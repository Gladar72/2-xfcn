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
type Tab = 0 | 1 | 2 | 3; // Все · Я иду · Создал · Прошли

const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WDL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const isoOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
/** Заголовок дня — как в «Афише заведений»: «Сегодня, 16 ноября», «Завтра, вторник 17», «Сб, 21 ноября». */
function dayTitle(i: string) {
  const now = new Date();
  const today = isoOf(now);
  const tomorrow = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1));
  const yesterday = isoOf(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1));
  const d = new Date(`${i}T12:00:00`);
  const dm = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (i === today) return `Сегодня, ${dm}`;
  if (i === tomorrow) return `Завтра, ${WDL[d.getDay()]} ${d.getDate()}`;
  if (i === yesterday) return `Вчера, ${dm}`;
  return `${WD[d.getDay()]}, ${dm}${d.getFullYear() !== now.getFullYear() ? ` ${d.getFullYear()}` : ""}`;
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
  // Полоска дат сверху (как в афише): «Все» или конкретный день — список ниже сужается до него.
  const [day, setDay] = useState<string | null>(null);
  const scope = tab === 3 ? "archive" : "upcoming";

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
  const shown = (list ?? []).filter((e) => (tab === 1 ? e.role !== "organizer" : tab === 2 ? e.role === "organizer" : true));
  // Все встречи и события — по дням, как в афише: ближайшие сверху, в «Прошли» — последние сверху.
  const allGroups: { d: string; list: MyEvent[] }[] = [];
  [...shown]
    .sort((a, b) => {
      const ka = `${a.eventDate} ${a.eventTime}`;
      const kb = `${b.eventDate} ${b.eventTime}`;
      return scope === "archive" ? kb.localeCompare(ka) : ka.localeCompare(kb);
    })
    .forEach((e) => {
      const g = allGroups[allGroups.length - 1];
      if (g && g.d === e.eventDate) g.list.push(e);
      else allGroups.push({ d: e.eventDate, list: [e] });
    });
  const groups = day && allGroups.some((g) => g.d === day) ? allGroups.filter((g) => g.d === day) : allGroups;

  return (
    <View style={{ flex: 1, backgroundColor: K.pearl }}>
      <PearlBg />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 90 }}
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
            {(["Все", "Я иду", "Создал", "Прошли"] as const).map((t, i) => (
              <Press key={t} onPress={() => { setTab(i as Tab); setDay(null); }} dark={tab === i} style={{ flex: 1, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center", backgroundColor: tab === i ? K.ink : "transparent" }}>
                <Text style={kf("500", 14, { color: tab === i ? "#fff" : K.ink })}>{t}</Text>
              </Press>
            ))}
          </View>
        </KGlass>

        {allGroups.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 12 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
            <Press onPress={() => setDay(null)} dark={!day} style={[styles.dp, !day && styles.dpOn]}>
              <Text style={kf("400", 11, { color: !day ? "rgba(255,255,255,0.7)" : K.ink2 })}>Все</Text>
              <Text style={kf("500", 16, { color: !day ? "#fff" : K.ink })}>{shown.length}</Text>
            </Press>
            {allGroups.map((g) => {
              const on = day === g.d;
              const d = new Date(`${g.d}T12:00:00`);
              const today = isoOf(new Date());
              return (
                <Press key={g.d} onPress={() => setDay(on ? null : g.d)} dark={on} style={[styles.dp, on && styles.dpOn]}>
                  <Text style={kf("400", 11, { color: on ? "rgba(255,255,255,0.7)" : K.ink2 })}>{g.d === today ? "Сегодня" : WD[d.getDay()]}</Text>
                  <Text style={kf("500", 18, { color: on ? "#fff" : K.ink })}>{d.getDate()}</Text>
                  <View style={[styles.dpDot, { backgroundColor: on ? "#fff" : K.ink }]} />
                </Press>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={{ gap: 10, marginTop: 14 }}>
          {list === null ? [0, 1, 2].map((i) => <View key={i} style={{ height: 94, borderRadius: 26, backgroundColor: "rgba(23,20,31,0.06)" }} />) : null}
        </View>
        {groups.map(({ d, list: dayList }) => (
          <View key={d} style={{ gap: 10 }}>
            <Text style={[kf("500", 17, { ls: -0.01 }), { marginTop: 20, marginHorizontal: 2 }]}>{dayTitle(d)}</Text>
          {dayList.map((e) => {
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
                      {e.eventTime.slice(0, 5)}{e.placeName ? ` · ${e.placeName}` : ""}
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
        ))}

        {list !== null && shown.length === 0 ? (
          <KGlass style={{ marginTop: 14, borderRadius: 28 }}>
            <View style={{ paddingTop: 20, paddingHorizontal: 20, paddingBottom: 18, alignItems: "center", gap: 6 }}>
              <Creature size={84} variant="e" />
              <Text style={[kf("500", 17, { lh: 1.3 }), { textAlign: "center" }]}>
                {tab === 3 ? "Прошедших встреч пока нет" : tab === 2 ? "Ты ещё ничего не создал" : tab === 1 ? "Ты пока никуда не идёшь" : "Встреч пока нет"}
              </Text>
              <Text style={[kf("400", 13.5, { lh: 1.45, color: K.ink2 }), { textAlign: "center" }]}>
                {tab === 3 ? "После встречи здесь можно оценить участников" : tab === 2 ? "Создай встречу — люди рядом её увидят" : "Загляни на главную или создай свою встречу"}
              </Text>
              <Press dark onPress={() => router.push(tab === 2 ? "/create" : "/(tabs)")} style={{ marginTop: 10, alignSelf: "stretch", height: 54, borderRadius: 27, backgroundColor: K.ink, alignItems: "center", justifyContent: "center" }}>
                <Text style={kf("500", 16, { color: "#fff" })}>{tab === 2 ? "Создать встречу" : "Найти встречу"}</Text>
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
  // .k-dp — плитка дня, как в «Когда и где?»
  dp: { width: 58, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 1, backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)" },
  dpOn: { backgroundColor: K.ink, borderColor: K.ink },
  dpDot: { width: 4, height: 4, borderRadius: 2, marginTop: 2 },
  // .k-badge
  badge: { position: "absolute", top: -5, left: 33, minWidth: 19, height: 19, paddingHorizontal: 5, borderRadius: 10, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "rgb(80,60,160)", shadowOpacity: 0.18, shadowRadius: 4, shadowOffset: { width: 0, height: 2 } },
});
