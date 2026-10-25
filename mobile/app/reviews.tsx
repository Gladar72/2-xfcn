import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Glass, Mosya, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { ReviewSheet } from "@/components/reviews/ReviewSheet";
import { Avatar } from "@/components/ui";
import { animateNext } from "@/lib/feedback";
import { fetchReviewable, longDate, toTargets, type ReviewableEvent, type ReviewTarget } from "@/lib/reviews";
import { colors, FONT } from "@/lib/theme";

/** «Отзывы после встреч» (app/(app)/reviews). ?event=<id> — сразу открыть оценку этой встречи. */
export default function ReviewsScreen() {
  const { event } = useLocalSearchParams<{ event?: string }>();
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<ReviewableEvent[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [queue, setQueue] = useState<ReviewTarget[]>([]);
  const opened = useRef(false);

  const load = useCallback(async () => {
    try {
      const list = await fetchReviewable();
      // Встреча из уведомления — наверх.
      const sorted = event ? [...list.filter((e) => e.eventId === event), ...list.filter((e) => e.eventId !== event)] : list;
      setEvents(sorted);
      if (event && !opened.current) {
        opened.current = true;
        const ev = sorted.find((e) => e.eventId === event);
        // Небольшая пауза: на iOS вторая шторка не откроется, пока закрывается другая.
        if (ev) setTimeout(() => setQueue(toTargets([ev])), 350);
        else Alert.alert("Спасибо!", "Эту встречу ты уже оценил — спасибо!");
      }
    } catch {
      setEvents((prev) => prev ?? []);
    }
    setRefreshing(false);
  }, [event]);

  useEffect(() => {
    load();
  }, [load]);

  function removeTarget(t: ReviewTarget) {
    animateNext();
    setEvents((list) =>
      (list ?? [])
        .map((e) => (e.eventId === t.eventId ? { ...e, reviewableMembers: e.reviewableMembers.filter((m) => m.id !== t.person.id) } : e))
        .filter((e) => e.reviewableMembers.length > 0)
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.violet}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
      >
        <RoundBtn onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}>
          <Icon name="back" />
        </RoundBtn>
        <Title plain="Отзывы " em="после встреч" size={30} style={{ marginLeft: 4 }} />
        <Text style={styles.sub}>Оцени, как прошла встреча — так в «Месте» остаются хорошие события.</Text>

        {events === null ? <ActivityIndicator color={colors.violet} style={{ marginTop: 30 }} /> : null}
        {events && events.length === 0 ? (
          <Glass strong style={styles.empty}>
            <Mosya pose="wave" size={110} />
            <Text style={styles.emptyTitle}>Оценивать пока некого</Text>
            <Text style={styles.sub}>После каждой встречи здесь можно будет её оценить.</Text>
          </Glass>
        ) : null}

        {events?.map((e) => (
          <View key={e.eventId} style={{ gap: 8 }}>
            <View style={styles.evHead}>
              <Text style={styles.evTitle} numberOfLines={1}>
                {e.title}
              </Text>
              <Text style={styles.muted}>{longDate(e.eventDate)}</Text>
            </View>
            <Glass strong style={styles.list}>
              {e.reviewableMembers.map((m, i) => (
                <View key={m.id} style={[styles.row, i > 0 && styles.sep]}>
                  <Avatar uri={m.avatar_url} name={m.name} size={44} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.name}>{m.name}</Text>
                    <Text style={styles.muted}>Организатор · оцени встречу</Text>
                  </View>
                  <Pressable
                    onPress={() => setQueue([{ eventId: e.eventId, eventTitle: e.title, person: { id: m.id, name: m.name, avatarUrl: m.avatar_url } }])}
                    style={({ pressed }) => [styles.rate, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                  >
                    <Text style={styles.rateText}>Оценить</Text>
                  </Pressable>
                </View>
              ))}
            </Glass>
          </View>
        ))}
      </ScrollView>

      <ReviewSheet
        target={queue[0] ?? null}
        onDone={(t) => {
          removeTarget(t);
          setQueue((q) => q.slice(1));
          if (queue.length <= 1) Alert.alert("Спасибо за отзыв!");
        }}
        onSkip={() => setQueue((q) => q.slice(1))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.grey, marginLeft: 4 },
  empty: { borderRadius: 26, padding: 22, alignItems: "center", gap: 8, marginTop: 10 },
  emptyTitle: { fontFamily: FONT, fontSize: 18, fontWeight: "500", color: colors.ink },
  evHead: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginHorizontal: 4, marginTop: 6 },
  evTitle: { flex: 1, fontFamily: FONT, fontSize: 17, fontWeight: "500", color: colors.ink },
  muted: { fontFamily: FONT, fontSize: 13, color: colors.grey },
  list: { borderRadius: 22, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(108,59,255,0.15)" },
  name: { fontFamily: FONT, fontSize: 15.5, fontWeight: "500", color: colors.ink },
  rate: { backgroundColor: colors.violet, borderRadius: 999, height: 38, paddingHorizontal: 16, justifyContent: "center" },
  rateText: { fontFamily: FONT, fontSize: 14.5, fontWeight: "600", color: "#fff" },
});
