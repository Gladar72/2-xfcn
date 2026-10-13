import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Aurora, Glass, Grad, Mosya, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Chip } from "@/components/ui";
import { api } from "@/lib/api";
import { formatEventDate } from "@/lib/format";
import { animateNext, tapLight } from "@/lib/feedback";
import { fetchReviewable, toTargets, type ReviewTarget } from "@/lib/reviews";
import { ReviewSheet } from "@/components/reviews/ReviewSheet";
import { colors, eventIcon, FONT } from "@/lib/theme";
import { useGuide } from "@/lib/guide";

/** Ответ GET /api/me/events (app/api/me/events/route.ts). */
interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  status: string;
  category: { slug: string; name: string } | null;
  isBusiness: boolean;
  photoUrl: string | null;
  role: "organizer" | "participant";
  myStatus: "member" | "pending";
  pendingApplicationsCount: number;
}
type Scope = "upcoming" | "archive";

function statusOf(e: MyEvent): { label: string; color: string } {
  if (e.status === "cancelled") return { label: "Отменена", color: colors.grey };
  if (e.status === "completed") return { label: "Завершена", color: colors.grey };
  if (e.role === "organizer") return { label: "Активна", color: colors.ok };
  if (e.myStatus === "pending") return { label: "Ждём ответа", color: "#E8892F" };
  return { label: "Ты в деле", color: colors.violet };
}

const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** «Мои встречи» — созданные и те, куда идёшь (app/(app)/my-events). */
export default function MyEventsScreen() {
  useGuide("myEvents");
  const insets = useSafeAreaInsets();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [items, setItems] = useState<Record<Scope, MyEvent[] | null>>({ upcoming: null, archive: null });
  const [refreshing, setRefreshing] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [toRate, setToRate] = useState<ReviewTarget[]>([]);
  const [rating, setRating] = useState<ReviewTarget | null>(null);

  const load = useCallback(async (s: Scope) => {
    try {
      const r = await api<{ items: MyEvent[] }>(`/api/me/events?scope=${s}`);
      setItems((prev) => ({ ...prev, [s]: r.items ?? [] }));
      // В архиве — кнопка «Оценить» у встреч, где остались неоценённые участники.
      if (s === "archive") fetchReviewable().then((ev) => setToRate(toTargets(ev))).catch(() => {});
    } catch {
      setItems((prev) => ({ ...prev, [s]: prev[s] ?? [] }));
    }
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load(scope);
    }, [load, scope])
  );

  const week = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
      return { iso: iso(d), wd: WD[d.getDay()]!, num: d.getDate() };
    });
  }, []);
  const busyDays = useMemo(() => new Set((items.upcoming ?? []).map((e) => e.eventDate)), [items.upcoming]);
  const all = items[scope];
  const list = all && scope === "upcoming" && day ? all.filter((e) => e.eventDate === day) : all;
  const today = week[0]!.iso;

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <FlatList
        data={list ?? []}
        keyExtractor={(e) => e.id}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.violet}
            onRefresh={() => {
              setRefreshing(true);
              load(scope);
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 4 }}>
            <RoundBtn onPress={() => router.back()}>
              <Icon name="back" />
            </RoundBtn>
            <Title plain="Мои " em="встречи" size={30} style={{ marginLeft: 4 }} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Chip label="Предстоящие" active={scope === "upcoming"} onPress={() => setScope("upcoming")} />
              <Chip label="Архив" active={scope === "archive"} onPress={() => setScope("archive")} />
            </View>
            {scope === "upcoming" ? (
              <View style={styles.week}>
                {week.map((d) => {
                  const on = day === d.iso || (!day && d.iso === today);
                  return (
                    <Pressable
                      key={d.iso}
                      onPress={() => {
                        tapLight();
                        animateNext();
                        setDay((cur) => (cur === d.iso ? null : d.iso));
                      }}
                      style={[styles.day, on && styles.dayOn, day === d.iso && styles.dayPicked]}
                    >
                      <Text style={[styles.wd, on && { color: day === d.iso ? "#fff" : colors.violet }]}>{d.wd}</Text>
                      <Text style={[styles.num, on && { color: day === d.iso ? "#fff" : colors.violet }]}>{d.num}</Text>
                      <View style={[styles.dot, { opacity: busyDays.has(d.iso) ? 1 : 0 }, day === d.iso && { backgroundColor: "#fff" }]} />
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {list === null ? <ActivityIndicator color={colors.violet} style={{ marginTop: 30 }} /> : null}
          </View>
        }
        ListEmptyComponent={
          list ? (
            <Glass strong style={styles.empty}>
              <Mosya pose="wave" size={110} />
              <Text style={styles.emptyTitle}>{scope === "archive" ? "Архив пуст" : day ? "В этот день встреч нет" : "Пока ничего не запланировано"}</Text>
              <Text style={styles.muted}>
                {scope === "archive"
                  ? "Здесь будут прошедшие встречи — после них можно оценить участников."
                  : "Ты пока никуда не идёшь — загляни в ленту или создай свою встречу."}
              </Text>
            </Glass>
          ) : null
        }
        renderItem={({ item: e }) => {
          const st = statusOf(e);
          const rate = scope === "archive" ? toRate.find((t) => t.eventId === e.id) : undefined;
          return (
            <Pressable onPress={() => router.push(`/event/${e.id}` as Href)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <Glass strong style={styles.row}>
                <View style={styles.cover}>
                  <View style={styles.clip}>
                  {e.photoUrl ? (
                    <Image source={{ uri: e.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <Grad style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                      <Image source={{ uri: eventIcon(e) }} style={{ width: 44, height: 44 }} contentFit="contain" />
                    </Grad>
                  )}
                  </View>
                  {e.role === "organizer" && e.pendingApplicationsCount > 0 ? (
                    <View style={styles.count}>
                      <Text style={styles.countText}>{e.pendingApplicationsCount}</Text>
                    </View>
                  ) : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={styles.title} numberOfLines={2}>
                    {e.title}
                  </Text>
                  <Text style={styles.muted} numberOfLines={1}>
                    {formatEventDate(e.eventDate, e.eventTime)}
                    {e.placeName ? ` · ${e.placeName}` : ""}
                  </Text>
                  <Text style={styles.meta}>
                    <Text style={{ color: colors.grey }}>{e.role === "organizer" ? "Организатор" : "Участник"} · </Text>
                    <Text style={{ color: st.color, fontWeight: "600" }}>{st.label}</Text>
                  </Text>
                </View>
                {rate ? (
                  <Pressable onPress={() => setRating(rate)} style={({ pressed }) => [styles.rateBtn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                    <Text style={styles.rateText}>Оценить</Text>
                  </Pressable>
                ) : (
                  <Icon name="chev" size={18} color={colors.grey} />
                )}
              </Glass>
            </Pressable>
          );
        }}
      />
      <ReviewSheet
        target={rating}
        onDone={(t) => {
          setToRate((list) => list.filter((x) => !(x.eventId === t.eventId && x.person.id === t.person.id)));
          // Следующий неоценённый с этой же встречи — сразу.
          const next = toRate.find((x) => x.eventId === t.eventId && x.person.id !== t.person.id);
          setRating(next ?? null);
        }}
        onSkip={() => setRating(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { borderRadius: 24, padding: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  cover: { width: 72, height: 72 },
  clip: { ...StyleSheet.absoluteFillObject, borderRadius: 18, overflow: "hidden" },
  count: { position: "absolute", top: -6, right: -6, minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.live, alignItems: "center", justifyContent: "center", paddingHorizontal: 6, borderWidth: 2, borderColor: "#fff" },
  countText: { fontFamily: FONT, fontSize: 12, fontWeight: "700", color: "#fff" },
  title: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink, letterSpacing: -0.2 },
  muted: { fontFamily: FONT, fontSize: 13.5, color: colors.grey },
  meta: { fontFamily: FONT, fontSize: 13 },
  week: { flexDirection: "row", justifyContent: "space-between", gap: 6 },
  day: { flex: 1, alignItems: "center", paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.6)", gap: 2 },
  dayOn: { backgroundColor: "#fff" },
  dayPicked: { backgroundColor: colors.violet },
  wd: { fontFamily: FONT, fontSize: 11.5, color: colors.grey },
  num: { fontFamily: FONT, fontSize: 17, fontWeight: "500", color: colors.ink },
  dot: { width: 5, height: 5, borderRadius: 3, backgroundColor: colors.pink },
  rateBtn: { backgroundColor: colors.violet, borderRadius: 999, height: 34, paddingHorizontal: 12, justifyContent: "center" },
  rateText: { fontFamily: FONT, fontSize: 13.5, fontWeight: "600", color: "#fff" },
  empty: { borderRadius: 26, padding: 22, alignItems: "center", gap: 8 },
  emptyTitle: { fontFamily: FONT, fontSize: 18, fontWeight: "500", color: colors.ink, textAlign: "center" },
});
