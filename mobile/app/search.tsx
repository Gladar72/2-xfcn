import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Dimensions, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Aurora, Btn, Glass, Mosya, RoundBtn } from "@/components/brand";
import { EventCard } from "@/components/EventCard";
import { FiltersSheet } from "@/components/FiltersSheet";
import { Icon } from "@/components/Icon";
import { Chip } from "@/components/ui";
import { api } from "@/lib/api";
import { animateNext, tapLight } from "@/lib/feedback";
import { activeCount, EMPTY_FILTERS, toQuery, type Filters } from "@/lib/filters";
import { catIcon, CATEGORY_SHORT, colors, FONT } from "@/lib/theme";
import type { Category, FeedEvent } from "@/lib/types";

interface TrainingType {
  slug: string;
  name: string;
}

/**
 * Поиск встреч (app/(app)/search в мини-приложении): строка «Что ищем?»,
 * быстрые чипы, категории (можно несколько), шторка фильтров, подгрузка страниц.
 * Параметры: ?categories=a,b&type=gym&date=today&filters=1
 */
export default function SearchScreen() {
  const params = useLocalSearchParams<{ categories?: string; type?: string; date?: string; filters?: string; q?: string }>();
  const insets = useSafeAreaInsets();
  const [filters, setFilters] = useState<Filters>(() => ({
    ...EMPTY_FILTERS,
    categories: params.categories ? params.categories.split(",").filter(Boolean) : [],
    type: params.type ?? null,
    date: (params.date as Filters["date"]) ?? "any",
  }));
  const [q, setQ] = useState(params.q ?? "");
  const [cats, setCats] = useState<Category[]>([]);
  const [types, setTypes] = useState<TrainingType[]>([]);
  const [items, setItems] = useState<FeedEvent[] | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [sheet, setSheet] = useState(params.filters === "1");
  const reqId = useRef(0);

  useEffect(() => {
    api<{ categories: Category[]; trainingTypes?: TrainingType[] }>("/api/categories", { auth: false })
      .then((r) => {
        setCats(r.categories.filter((c) => c.slug !== "custom"));
        setTypes(r.trainingTypes ?? []);
      })
      .catch(() => {});
  }, []);

  const query = useMemo(() => toQuery(filters), [filters]);

  const fetchPage = useCallback(
    async (p: number) => {
      const id = ++reqId.current;
      const r = await api<{ items: FeedEvent[]; hasMore?: boolean }>(`/api/events?page=${p}${query ? `&${query}` : ""}`);
      if (id !== reqId.current) return;
      const fresh = (r.items ?? []).filter((e) => !e.isBusiness);
      setItems((prev) => (p === 0 ? fresh : [...(prev ?? []), ...fresh]));
      setHasMore(!!r.hasMore);
      setPage(p);
    },
    [query]
  );

  useEffect(() => {
    setItems(null);
    fetchPage(0).catch(() => setItems([]));
  }, [fetchPage]);

  async function more() {
    if (!hasMore || loadingMore) return;
    setLoadingMore(true);
    await fetchPage(page + 1).catch(() => {});
    setLoadingMore(false);
  }

  // Текст ищем по уже загруженным встречам — как в мини-приложении.
  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle || !items) return items;
    return items.filter((e) =>
      [e.title, e.placeName, e.description, e.category?.name, e.trainingType?.name].some((s) => (s ?? "").toLowerCase().includes(needle))
    );
  }, [items, q]);

  function setF(next: Partial<Filters>) {
    tapLight();
    animateNext();
    setFilters((f) => ({ ...f, ...next }));
  }

  function toggleCat(slug: string) {
    const on = filters.categories.includes(slug);
    const categories = on ? filters.categories.filter((c) => c !== slug) : [...filters.categories, slug];
    setF({ categories, type: categories.includes("training") ? filters.type : null });
  }

  const quick: { label: string; on: boolean; press: () => void }[] = [
    { label: "Сегодня", on: filters.date === "today", press: () => setF({ date: filters.date === "today" ? "any" : "today" }) },
    { label: "Завтра", on: filters.date === "tomorrow", press: () => setF({ date: filters.date === "tomorrow" ? "any" : "tomorrow" }) },
    { label: "На выходных", on: filters.date === "weekend", press: () => setF({ date: filters.date === "weekend" ? "any" : "weekend" }) },
    { label: "Бесплатно", on: filters.costType === "free", press: () => setF({ costType: filters.costType === "free" ? "any" : "free" }) },
  ];
  const nf = activeCount(filters);
  const touched = query.length > 0 || q.trim().length > 0;

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <FlatList
        data={shown ?? []}
        keyExtractor={(e) => e.id}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        onEndReached={more}
        onEndReachedThreshold={0.6}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 14 }}
        ListHeaderComponent={
          <View style={{ gap: 12 }}>
            <View style={styles.bar}>
              <RoundBtn onPress={() => router.back()}>
                <Icon name="back" />
              </RoundBtn>
              <Glass strong style={styles.field}>
                <Icon name="search" size={18} color={colors.grey} />
                <TextInput
                  value={q}
                  onChangeText={setQ}
                  placeholder="Что ищем?"
                  placeholderTextColor={colors.grey}
                  style={styles.input}
                  autoFocus={!params.categories && !params.date && params.filters !== "1"}
                  returnKeyType="search"
                />
                {q ? (
                  <Pressable onPress={() => setQ("")} hitSlop={8}>
                    <Icon name="close" size={16} color={colors.grey} />
                  </Pressable>
                ) : null}
              </Glass>
              <RoundBtn dark onPress={() => setSheet(true)}>
                <Icon name="filter" color="#fff" />
                {nf > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{nf}</Text>
                  </View>
                ) : null}
              </RoundBtn>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
              {quick.map((c) => (
                <Chip key={c.label} label={c.label} active={c.on} onPress={c.press} />
              ))}
              <Chip label="На карте" onPress={() => router.navigate({ pathname: "/(tabs)/map", params: { date: filters.date, t: String(Date.now()) } })} />
            </ScrollView>

            <View style={styles.cats}>
              {cats.map((c) => {
                const on = filters.categories.includes(c.slug);
                return (
                  <Pressable key={c.slug} onPress={() => toggleCat(c.slug)} style={({ pressed }) => [styles.cat, on && styles.catOn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                    <Image source={{ uri: catIcon(c.slug) }} style={{ width: 34, height: 34 }} />
                    <Text style={[styles.catText, on && { color: "#fff" }]} numberOfLines={1}>
                      {CATEGORY_SHORT[c.slug] ?? c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {filters.categories.includes("training") && types.length ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
                <Chip label="Любая тренировка" active={!filters.type} onPress={() => setF({ type: null })} />
                {types.map((t) => (
                  <Chip key={t.slug} label={t.name} active={filters.type === t.slug} onPress={() => setF({ type: filters.type === t.slug ? null : t.slug })} />
                ))}
              </ScrollView>
            ) : null}

            <View style={styles.resRow}>
              <Text style={styles.section}>{touched && shown ? `Нашлось: ${shown.length}${hasMore ? "+" : ""}` : "Все встречи"}</Text>
              {touched ? (
                <Pressable
                  onPress={() => {
                    setQ("");
                    setF({ ...EMPTY_FILTERS });
                  }}
                  hitSlop={8}
                >
                  <Text style={styles.reset}>Сбросить</Text>
                </Pressable>
              ) : null}
            </View>
            {shown === null ? <ActivityIndicator color={colors.violet} style={{ marginTop: 30 }} /> : null}
          </View>
        }
        ListEmptyComponent={
          shown ? (
            <Glass strong style={styles.empty}>
              <Mosya pose="think" size={110} />
              <Text style={styles.emptyTitle}>Ничего не нашлось</Text>
              <Text style={styles.emptyText}>Попробуй другие фильтры — или создай свою встречу, люди подтянутся.</Text>
              <Btn title="Создать встречу" onPress={() => router.push("/create")} style={{ alignSelf: "stretch", marginTop: 6 }} />
            </Glass>
          ) : null
        }
        renderItem={({ item }) => <EventCard event={item} width="100%" height={320} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.violet} style={{ marginVertical: 16 }} /> : null}
      />

      <FiltersSheet
        visible={sheet}
        value={filters}
        onClose={() => setSheet(false)}
        onApply={(f) => {
          setSheet(false);
          animateNext();
          setFilters(f);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", alignItems: "center", gap: 8 },
  field: { flex: 1, height: 46, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14 },
  input: { flex: 1, fontFamily: FONT, fontSize: 15.5, color: colors.ink, height: 46 },
  badge: { position: "absolute", top: 2, right: 2, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.pink, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  badgeText: { fontFamily: FONT, fontSize: 10.5, fontWeight: "700", color: "#fff" },
  cats: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cat: { width: Math.floor((Dimensions.get("window").width - 32 - 24) / 4), alignItems: "center", gap: 4, paddingVertical: 8, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.7)" },
  catOn: { backgroundColor: colors.ink },
  catText: { fontFamily: FONT, fontSize: 12, color: colors.ink, fontWeight: "500" },
  resRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 4 },
  section: { fontFamily: FONT, fontSize: 19, fontWeight: "500", color: colors.ink, letterSpacing: -0.4 },
  reset: { fontFamily: FONT, fontSize: 14.5, fontWeight: "600", color: colors.violet },
  empty: { borderRadius: 28, padding: 22, alignItems: "center", gap: 6 },
  emptyTitle: { fontFamily: FONT, fontSize: 19, fontWeight: "500", color: colors.ink },
  emptyText: { fontFamily: FONT, fontSize: 14, lineHeight: 20, color: colors.grey, textAlign: "center" },
});
