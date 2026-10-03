import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { EventCard } from "@/components/EventCard";
import { Chip } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";
import type { FeedEvent } from "@/lib/types";

const DATES = [
  { key: "any", label: "Все" },
  { key: "today", label: "Сегодня" },
  { key: "tomorrow", label: "Завтра" },
  { key: "weekend", label: "Выходные" },
] as const;

export default function FeedScreen() {
  const [items, setItems] = useState<FeedEvent[]>([]);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [date, setDate] = useState<(typeof DATES)[number]["key"]>("any");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (p: number, replace: boolean) => {
      try {
        setError(null);
        const r = await api<{ items: FeedEvent[]; hasMore?: boolean }>(`/api/events?page=${p}&date=${date}`);
        setItems((prev) => (replace ? r.items : [...prev, ...r.items]));
        setHasMore(r.hasMore ?? r.items.length > 0);
        setPage(p);
      } catch (e) {
        setError((e as Error).message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [date]
  );

  useEffect(() => {
    setLoading(true);
    load(0, true);
  }, [load]);

  return (
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.title}>Встречи рядом</Text>
        <View style={styles.chips}>
          {DATES.map((d) => (
            <Chip key={d.key} label={d.label} active={date === d.key} onPress={() => setDate(d.key)} />
          ))}
        </View>
      </View>
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(e) => e.id}
          contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}
          renderItem={({ item }) => <EventCard event={item} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(0, true); }} tintColor={colors.accent} />}
          onEndReached={() => hasMore && !loading && load(page + 1, false)}
          onEndReachedThreshold={0.5}
          ListEmptyComponent={
            <Text style={styles.empty}>{error ?? "Пока нет встреч на эти даты. Загляни позже или создай свою!"}</Text>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  title: { fontSize: font.display, fontWeight: "800", color: colors.ink900 },
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  empty: { textAlign: "center", color: colors.ink600, marginTop: 40, paddingHorizontal: 24, fontSize: font.base },
});
