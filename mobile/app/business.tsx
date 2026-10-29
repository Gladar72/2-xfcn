import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Aurora, Btn, Glass, Grad, RoundBtn, Title } from "@/components/brand";
import { EventCard } from "@/components/EventCard";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { cityEventIcon, cityWhen, KIND_LABEL, type CityEvent } from "@/lib/cityEvents";
import { BizCatRow } from "@/components/BizCategories";
import { bizCategoryCounts, matchesBizCategory } from "@/lib/bizCategories";
import { colors, FONT, f } from "@/lib/theme";
import type { FeedEvent } from "@/lib/types";
import { useGuide } from "@/lib/guide";

const STEPS: [string, string][] = [
  ["Создаёте событие", "с фото, временем и ценой билета"],
  ["Принимаете заявки", "гость получает номер билета"],
  ["Отмечаете на входе", "оплата — вам лично, на месте"],
];

/** «Для бизнеса» (app/(app)/business): события заведений и городская афиша. */
export default function BusinessScreen() {
  useGuide("business");
  const insets = useSafeAreaInsets();
  const [biz, setBiz] = useState<FeedEvent[] | null>(null);
  const [city, setCity] = useState<CityEvent[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  // Категория (кафе, бары, концерты…) — фильтрует и события заведений, и афишу города.
  const [cat, setCat] = useState<string | null>(null);
  const cityTagged = city.map((c) => ({ c, tag: { title: c.title, kind: c.kind } }));
  const counts = bizCategoryCounts([...(biz ?? []), ...cityTagged.map((x) => x.tag)]);
  const shownBiz = biz?.filter((e) => matchesBizCategory(e, cat)) ?? null;
  const shownCity = cityTagged.filter((x) => matchesBizCategory(x.tag, cat)).map((x) => x.c);

  const load = useCallback(async () => {
    await Promise.all([
      api<{ items: FeedEvent[] }>("/api/events?business=true&page=0")
        .then((r) => setBiz((r.items ?? []).filter((e) => e.isBusiness)))
        .catch(() => setBiz([])),
      api<{ items: CityEvent[] }>("/api/city-events")
        .then((r) => setCity(r.items ?? []))
        .catch(() => {}),
    ]);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 110, gap: 14 }}
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
        <RoundBtn onPress={() => router.back()}>
          <Icon name="back" />
        </RoundBtn>
        <Title plain="Для " em="бизнеса" size={32} style={{ marginLeft: 4 }} />
        <Text style={styles.sub}>Посетить или создать событие — концерты, дегустации, мастер-классы. Все события на общей карте города.</Text>
        <Btn title="Создать событие" icon={<Icon name="plus" size={20} color="#fff" />} onPress={() => router.push({ pathname: "/create", params: { business: "1" } })} />

        <Glass strong style={styles.how}>
          {STEPS.map(([t, s], i) => (
            <View key={t} style={styles.step}>
              <Grad style={styles.num}>
                <Text style={styles.numText}>{i + 1}</Text>
              </Grad>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepT}>{t}</Text>
                <Text style={styles.muted}>{s}</Text>
              </View>
            </View>
          ))}
        </Glass>

        {counts.length > 1 ? <BizCatRow counts={counts} value={cat} onChange={setCat} /> : null}
        <View style={styles.secRow}>
          <Text style={styles.section}>Ближайшие события</Text>
          {shownBiz?.length ? <Text style={styles.count}>{shownBiz.length}</Text> : null}
        </View>
        {biz === null ? <ActivityIndicator color={colors.violet} /> : null}
        {biz?.length === 0 ? (
          <Glass strong style={styles.empty}>
            <Text style={styles.emptyT}>Пока нет событий</Text>
            <Text style={styles.muted}>Стань первым — создай концерт, дегустацию или мастер-класс.</Text>
          </Glass>
        ) : null}
        {cat && !!biz?.length && shownBiz?.length === 0 ? <Text style={styles.muted}>В этой категории пока нет событий заведений.</Text> : null}
        {shownBiz?.map((e) => (
          <EventCard key={e.id} event={e} width="100%" height={320} />
        ))}

        {shownCity.length ? (
          <>
            <View style={styles.secRow}>
              <Text style={styles.section}>Что ещё в городе</Text>
              <Text style={styles.count}>{shownCity.length}</Text>
            </View>
            <Glass strong style={styles.list}>
              {shownCity.map((c, i) => (
                <Pressable key={c.id} onPress={() => router.push(`/city/${c.id}` as Href)} style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { opacity: 0.7 }]}>
                  <View style={styles.thumb}>
                    {c.photoUrl ? (
                      <Image source={{ uri: c.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <Image source={{ uri: cityEventIcon(c.kind) }} style={{ width: 36, height: 36 }} contentFit="contain" />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.kind} numberOfLines={1}>{KIND_LABEL[c.kind ?? ""] ?? "Событие"}</Text>
                    <Text style={styles.rowT} numberOfLines={2}>
                      {c.title}
                    </Text>
                    <Text style={styles.muted} numberOfLines={1}>
                      {cityWhen(c)}
                      {c.placeName ? ` · ${c.placeName}` : ""}
                    </Text>
                  </View>
                  {c.priceText ? (
                    <Text style={styles.price} numberOfLines={1}>
                      {c.priceText}
                    </Text>
                  ) : null}
                </Pressable>
              ))}
            </Glass>
          </>
        ) : null}
      </ScrollView>

      <View style={[styles.fabWrap, { bottom: Math.max(insets.bottom, 14) + 6 }]} pointerEvents="box-none">
        <Pressable
          onPress={() => router.navigate({ pathname: "/(tabs)/map", params: { business: "only", t: String(Date.now()) } })}
          style={({ pressed }) => [styles.fab, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
        >
          <Icon name="map" size={20} color="#fff" />
          <Text style={styles.fabText}>Карта</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.grey, marginLeft: 4 },
  how: { borderRadius: 24, padding: 14, gap: 12 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  num: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  numText: { fontSize: 15, ...f("700"), color: "#fff" },
  stepT: { fontSize: 15.5, ...f("500"), color: colors.ink },
  muted: { fontFamily: FONT, fontSize: 13, color: colors.grey },
  secRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6, marginLeft: 4 },
  section: { fontSize: 19, ...f("500"), color: colors.ink, letterSpacing: -0.4 },
  count: { fontSize: 13, ...f("600"), color: colors.violet, backgroundColor: colors.lav, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 2, overflow: "hidden" },
  empty: { borderRadius: 22, padding: 18, gap: 4, alignItems: "center" },
  emptyT: { fontSize: 18, ...f("500"), color: colors.ink },
  list: { borderRadius: 22, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(108,59,255,0.15)" },
  thumb: { width: 58, height: 58, borderRadius: 16, overflow: "hidden", backgroundColor: "#EDE5FF", alignItems: "center", justifyContent: "center" },
  kind: { fontSize: 11.5, ...f("600"), color: colors.violet, textTransform: "uppercase", letterSpacing: 0.5 },
  rowT: { fontSize: 15, ...f("500"), color: colors.ink },
  price: { fontSize: 13, ...f("600"), color: colors.ink, maxWidth: 90 },
  fabWrap: { position: "absolute", left: 0, right: 0, alignItems: "center" },
  fab: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.ink, borderRadius: 999, height: 50, paddingHorizontal: 22, shadowColor: "#000", shadowOpacity: 0.25, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 6 },
  fabText: { fontSize: 15.5, ...f("600"), color: "#fff" },
});
