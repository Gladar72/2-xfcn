// Вкладка «Встречи» — перенос app/(app)/my-events/page.tsx мини-аппа один в один:
// заголовок «Мои встречи» и кнопка чатов, «… хочет с тобой на встречу», вкладки «Я иду / Создал / Прошли», список.
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { Image } from "expo-image";
import { api } from "@/lib/api";
import { coverUri } from "@/lib/covers";
import { plural } from "@/lib/format";
import { fetchReviewable, toTargets, type ReviewTarget } from "@/lib/reviews";
import { ReviewSheet } from "@/components/reviews/ReviewSheet";
import { useGuide } from "@/lib/guide";
import { B, Creature, K, KGlass, KMos, KPressGlass, KRb, KTitle, PearlBg, Press, kf, StatusShade } from "@/components/k";

interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  status: string;
  photoUrl: string | null;
  role: "organizer" | "participant";
  myStatus?: "member" | "pending";
  pendingApplicationsCount: number;
}
interface MeetHint { notificationId: string; userId: string; name: string; age: number | null; avatarUrl: string | null }
type Tab = 0 | 1 | 2;

function dayLong(iso: string) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
}

export default function MeetTab() {
  useGuide("myEvents");
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>(0);
  const [items, setItems] = useState<Record<"upcoming" | "archive", MyEvent[] | null>>({ upcoming: null, archive: null });
  const [unread, setUnread] = useState(0);
  const [hints, setHints] = useState<MeetHint[]>([]);
  const [toRate, setToRate] = useState<ReviewTarget[]>([]);
  const [rating, setRating] = useState<ReviewTarget | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const scope = tab === 2 ? "archive" : "upcoming";

  const load = useCallback(async (s: "upcoming" | "archive") => {
    try {
      const r = await api<{ items: MyEvent[] }>(`/api/me/events?scope=${s}`);
      setItems((prev) => ({ ...prev, [s]: r.items ?? [] }));
    } catch {
      setItems((prev) => ({ ...prev, [s]: prev[s] ?? [] }));
    }
    if (s === "archive") fetchReviewable().then((ev) => setToRate(toTargets(ev))).catch(() => {});
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(scope);
      api<{ items: { unreadCount: number; eventStatus?: string | null }[] }>("/api/conversations")
        .then((r) => setUnread(r.items.filter((c) => c.eventStatus !== "completed" && c.eventStatus !== "cancelled").reduce((s, c) => s + (c.unreadCount || 0), 0)))
        .catch(() => {});
      api<{ items: MeetHint[] }>("/api/me/meet-hints").then((d) => setHints(d.items ?? [])).catch(() => {});
    }, [load, scope])
  );

  const list = items[scope];
  const shown = (list ?? []).filter((e) => (tab === 0 ? e.role !== "organizer" : tab === 1 ? e.role === "organizer" : true));

  return (
    <View style={{ flex: 1, backgroundColor: K.pearl }}>
      <PearlBg />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(scope); }} tintColor={K.ink} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <KTitle parts={["Мои ", { em: "встречи" }]} size={36} />
          <View>
            <KRb icon="chat" onPress={() => router.navigate("/(tabs)/chats")} accessibilityLabel="Чаты" />
            {unread > 0 ? (
              <View style={styles.badge}>
                <Text style={kf("600", 11)}>{unread > 9 ? "9+" : unread}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {hints.slice(0, 3).map((h) => (
          <KMos
            key={h.notificationId}
            go="Позвать"
            onPress={() => router.push({ pathname: "/person/[id]", params: { id: h.userId, invite: "1" } } as unknown as Href)}
            left={h.avatarUrl ? <Image source={{ uri: h.avatarUrl }} style={{ width: 46, height: 46, borderRadius: 23, marginLeft: 4 }} contentFit="cover" /> : <Creature size={46} />}
          >
            <B>{h.name}{h.age ? `, ${h.age}` : ""}</B> хочет с тобой на встречу
          </KMos>
        ))}

        {/* .k-tabs */}
        <KGlass style={{ marginTop: 16, borderRadius: 24, padding: 4 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {(["Я иду", "Создал", "Прошли"] as const).map((t, i) => (
              <Press key={t} onPress={() => setTab(i as Tab)} dark={tab === i} style={{ flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: tab === i ? K.ink : "transparent" }}>
                <Text style={kf("500", 14, { color: tab === i ? "#fff" : K.ink })}>{t}</Text>
              </Press>
            ))}
          </View>
        </KGlass>

        <View style={{ gap: 10, marginTop: 14 }}>
          {list === null ? [0, 1, 2].map((i) => <View key={i} style={{ height: 94, borderRadius: 26, backgroundColor: "rgba(23,20,31,0.06)" }} />) : null}
          {shown.map((e) => {
            const past = scope === "archive";
            const rv = toRate.find((r) => r.eventId === e.id);
            const pill: [string, "ok" | "wait" | "own"] =
              e.status === "cancelled" ? ["Отменена", "wait"]
              : past ? (rv ? ["Оставь отзыв", "wait"] : ["Завершена", "ok"])
              : e.role === "organizer"
                ? e.pendingApplicationsCount > 0
                  ? [`${e.pendingApplicationsCount} ${plural(e.pendingApplicationsCount, "новая заявка", "новые заявки", "новых заявок")}`, "own"]
                  : ["Активна", "ok"]
                : e.myStatus === "pending" ? ["Ждём ответа организатора", "wait"] : ["Тебя приняли", "ok"];
            const pc = pill[1] === "ok" ? { bg: "rgba(47,168,106,0.12)", fg: "#1E7A4B" } : pill[1] === "wait" ? { bg: "rgba(240,166,58,0.15)", fg: "#9A5E0E" } : { bg: "rgba(124,92,255,0.14)", fg: "#5B3FD6" };
            const cover = coverUri(e.photoUrl);
            return (
              <KPressGlass key={e.id} onPress={() => (past && rv ? setRating(rv) : router.push(`/event/${e.id}` as Href))} style={{ borderRadius: 26 }}>
                <View style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 10 }}>
                  {cover ? <Image source={{ uri: cover }} style={{ width: 74, height: 74, borderRadius: 20 }} contentFit="cover" /> : <View style={{ width: 74, height: 74, borderRadius: 20, backgroundColor: "#2B2737" }} />}
                  <View style={{ flex: 1, minWidth: 0, justifyContent: "center" }}>
                    <Text style={kf("500", 15)} numberOfLines={1}>{e.title}</Text>
                    <Text style={[kf("400", 12.5, { color: K.ink2 }), { marginTop: 3 }]} numberOfLines={1}>
                      {dayLong(e.eventDate)}, {e.eventTime.slice(0, 5)}{e.placeName ? ` · ${e.placeName}` : ""}
                    </Text>
                    <View style={{ alignSelf: "flex-start", marginTop: 6, height: 24, paddingHorizontal: 10, borderRadius: 12, backgroundColor: pc.bg, justifyContent: "center" }}>
                      <Text style={kf("500", 11.5, { color: pc.fg })} numberOfLines={1}>{pill[0]}</Text>
                    </View>
                  </View>
                </View>
              </KPressGlass>
            );
          })}
        </View>

        {list !== null && shown.length === 0 ? (
          <KGlass style={{ marginTop: 14, borderRadius: 28 }}>
            <View style={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 18, alignItems: "center", gap: 6 }}>
              <Creature size={84} variant="e" />
              <Text style={[kf("500", 17, { lh: 1.3 }), { textAlign: "center" }]}>
                {tab === 2 ? "Прошедших встреч пока нет" : tab === 1 ? "Ты ещё ничего не создал" : "Ты пока никуда не идёшь"}
              </Text>
              <Text style={[kf("400", 13.5, { lh: 1.45, color: K.ink2 }), { textAlign: "center" }]}>
                {tab === 2 ? "После встречи здесь можно оценить участников" : tab === 1 ? "Создай встречу — люди рядом её увидят" : "Загляни на главную или создай свою встречу"}
              </Text>
              <Press dark onPress={() => router.push(tab === 1 ? "/create" : "/(tabs)")} style={{ marginTop: 10, alignSelf: "stretch", height: 54, borderRadius: 27, backgroundColor: K.ink, alignItems: "center", justifyContent: "center" }}>
                <Text style={kf("500", 16, { color: "#fff" })}>{tab === 1 ? "Создать встречу" : "Найти встречу"}</Text>
              </Press>
            </View>
          </KGlass>
        ) : null}
      </ScrollView>
      <StatusShade top={insets.top} />
      <ReviewSheet
        target={rating}
        onDone={(t) => {
          const rest = toRate.filter((x) => !(x.eventId === t.eventId && x.person.id === t.person.id));
          setToRate(rest);
          setRating(rest.find((x) => x.eventId === t.eventId) ?? null);
        }}
        onSkip={() => setRating(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // .k-badge
  badge: { position: "absolute", top: -5, left: 33, minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "rgb(80,60,160)", shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
});
