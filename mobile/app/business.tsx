// «Афиша заведений» — перенос app/(app)/business/page.tsx мини-аппа один в один:
// разделы, «Сегодня / Завтра / Выходные / Бесплатно», поиск, список по дням, «Что ещё в городе», кнопка «Создать событие».
import { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { api } from "@/lib/api";
import { KIND_LABEL, type CityEvent } from "@/lib/cityEvents";
import { bizCategoryCounts, bizCategoryIcon, matchesBizCategory } from "@/lib/bizCategories";
import { coverUri } from "@/lib/covers";
import { costShort } from "@/lib/format";
import type { FeedEvent } from "@/lib/types";
import { useGuide } from "@/lib/guide";
import { K, KChip, KGlass, KI, KPressGlass, KRb, KTitle, PearlBg, Press, kf } from "@/components/k";

type When = "all" | "today" | "tomorrow" | "weekend";
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const WDL = ["воскресенье", "понедельник", "вторник", "среда", "четверг", "пятница", "суббота"];
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const norm = (t: string | null | undefined) => (t ?? "").toLowerCase().replace(/ё/g, "е");

function days() {
  const now = new Date();
  const d = (n: number) => iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() + n));
  const wd = now.getDay();
  const toSat = wd === 0 ? -1 : 6 - wd;
  return { today: d(0), tomorrow: d(1), weekend: { from: d(Math.max(0, toSat)), to: d(wd === 0 ? 0 : toSat + 1) } };
}
function dayTitle(i: string, t: ReturnType<typeof days>) {
  const d = new Date(`${i}T12:00:00`);
  const dm = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  if (i === t.today) return `Сегодня, ${dm}`;
  if (i === t.tomorrow) return `Завтра, ${WDL[d.getDay()]} ${d.getDate()}`;
  return `${WD[d.getDay()]}, ${dm}`;
}
function inWhen(start: string, end: string | null, when: When, t: ReturnType<typeof days>) {
  const e = end && end > start ? end : start;
  const hit = (a: string, b: string) => start <= b && e >= a;
  if (when === "today") return hit(t.today, t.today);
  if (when === "tomorrow") return hit(t.tomorrow, t.tomorrow);
  if (when === "weekend") return hit(t.weekend.from, t.weekend.to);
  return true;
}
function cityDay(c: CityEvent) {
  const today = iso(new Date());
  const f = (i: string) => new Date(`${i}T00:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
  if (c.endDate && c.eventDate <= today) return `идёт · до ${f(c.endDate)}`;
  return `${f(c.eventDate)}${c.eventTime ? `, ${c.eventTime.slice(0, 5)}` : ""}`;
}

export default function BusinessScreen() {
  useGuide("business");
  const insets = useSafeAreaInsets();
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [cityEv, setCityEv] = useState<CityEvent[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [when, setWhen] = useState<When>("all");
  const [free, setFree] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(() => {
    api<{ items: FeedEvent[] }>("/api/events?business=true")
      .then((r) => setEvents((r.items ?? []).filter((e) => e.isBusiness)))
      .catch(() => setEvents((p) => p ?? []))
      .finally(() => setRefreshing(false));
    api<{ items: CityEvent[] }>("/api/city-events").then((r) => setCityEv(r.items ?? [])).catch(() => {});
  }, []);
  useFocusEffect(useCallback(() => load(), [load]));

  const t = useMemo(days, []);
  const query = norm(q.trim());
  const baseEvents = useMemo(
    () => (events ?? []).filter((e) => inWhen(e.eventDate, null, when, t) && (!free || e.businessPricingType === "free" || /бесплат/i.test(e.businessPricingDetails ?? "")) && (!query || norm(`${e.title} ${e.placeName ?? ""} ${e.organizer?.name ?? ""}`).includes(query))),
    [events, when, t, free, query]
  );
  const baseCity = useMemo(
    () => cityEv.filter((c) => inWhen(c.eventDate, c.endDate ?? null, when, t) && (!free || /бесплат/i.test(c.priceText ?? "")) && (!query || norm(`${c.title} ${c.placeName ?? ""}`).includes(query))),
    [cityEv, when, t, free, query]
  );
  const counts = bizCategoryCounts([...baseEvents, ...baseCity.map((c) => ({ title: c.title, kind: c.kind }))]);
  const shownEvents = events === null ? null : baseEvents.filter((e) => matchesBizCategory(e, cat));
  const shownCity = baseCity.filter((c) => matchesBizCategory({ title: c.title, kind: c.kind }, cat));
  const filtered = !!cat || when !== "all" || free || !!query;
  const found = (shownEvents?.length ?? 0) + shownCity.length;
  const groups = useMemo(() => {
    const m = new Map<string, FeedEvent[]>();
    for (const e of shownEvents ?? []) m.set(e.eventDate, [...(m.get(e.eventDate) ?? []), e]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([d, list]) => ({ d, list: list.sort((a, b) => a.eventTime.localeCompare(b.eventTime)) }));
  }, [shownEvents]);
  const city = events?.[0]?.city ?? cityEv[0]?.city ?? null;
  const reset = () => { setCat(null); setQ(""); setWhen("all"); setFree(false); };

  return (
    <View style={{ flex: 1, backgroundColor: K.pearl }}>
      <PearlBg />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 110 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={K.ink} />}
      >
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <KRb icon="back" onPress={() => router.back()} accessibilityLabel="Назад" />
          {/* .k-pair: карта | поиск */}
          <KGlass style={{ height: 44, borderRadius: 22, paddingHorizontal: 4 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center" }}>
              <Press onPress={() => router.push({ pathname: "/(tabs)/map", params: { business: "only", t: String(Date.now()), ...(when !== "all" ? { date: when } : {}) } } as unknown as Href)} style={styles.pairBtn} accessibilityLabel="На карте">
                <KI n="map" />
              </Press>
              <View style={{ width: 1, height: 20, backgroundColor: "rgba(23,20,31,0.12)", marginHorizontal: 2 }} />
              <Press onPress={() => setSearchOpen((v) => !v)} style={styles.pairBtn} accessibilityLabel="Поиск">
                <KI n="search" />
              </Press>
            </View>
          </KGlass>
        </View>

        <KTitle parts={["Афиша ", { em: "заведений" }]} size={36} style={{ marginTop: 18 }} />
        <Text style={[kf("400", 14, { lh: 1.5, color: K.ink2 }), { marginTop: 8, marginBottom: 12 }]}>Кафе, бары и площадки{city ? ` · ${city}` : " рядом"}</Text>

        {searchOpen || q ? (
          <KGlass style={{ height: 50, borderRadius: 25, marginBottom: 12 }}>
            <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
              <KI n="search" size={18} color={K.ink2} />
              <TextInput autoFocus value={q} onChangeText={setQ} placeholder="Событие или заведение" placeholderTextColor={K.ink3} returnKeyType="search" style={[kf("400", 15), { flex: 1 }]} />
              {q ? <Press onPress={() => setQ("")} accessibilityLabel="Очистить"><KI n="x" size={16} color={K.ink2} /></Press> : null}
            </View>
          </KGlass>
        ) : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
          <KChip label="Все" on={!cat} onPress={() => setCat(null)} />
          {counts.map(({ cat: c }) => (
            <KChip key={c.key} label={c.label} iconUri={bizCategoryIcon(c)} on={cat === c.key} onPress={() => setCat(cat === c.key ? null : c.key)} />
          ))}
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 12 }} contentContainerStyle={{ gap: 6, paddingHorizontal: 20 }}>
          {([["today", "Сегодня"], ["tomorrow", "Завтра"], ["weekend", "Выходные"]] as [When, string][]).map(([k, l]) => (
            <KChip key={k} label={l} height={40} on={when === k} onPress={() => setWhen(when === k ? "all" : k)} />
          ))}
          <KChip label="Бесплатно" height={40} on={free} onPress={() => setFree(!free)} />
        </ScrollView>

        {filtered && events !== null ? (
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
            <Text style={kf("500", 14)}>Найдено {found}</Text>
            <Press onPress={reset}><Text style={kf("500", 14, { color: "#5B3FD6" })}>Сбросить ✕</Text></Press>
          </View>
        ) : null}

        {events === null ? (
          <View style={{ gap: 8, marginTop: 16 }}>
            {[0, 1, 2].map((i) => <View key={i} style={{ height: 136, borderRadius: 26, backgroundColor: "rgba(23,20,31,0.06)" }} />)}
          </View>
        ) : null}

        {groups.map(({ d, list }, gi) => (
          <View key={d} style={{ gap: 8 }}>
            <Text style={[kf("500", 15, { ls: -0.01 }), { marginTop: gi === 0 ? 6 : 18, marginBottom: 8, marginHorizontal: 2 }]}>{dayTitle(d, t)}</Text>
            {list.map((e) => {
              const left = Math.max(0, e.seatsTotal - e.seatsTaken);
              const price = e.businessPricingType === "free" ? "Бесплатно" : costShort(e);
              return <AfRow key={e.id} photo={e.photoUrl} chip={price ? (left > 0 ? price : "Мест нет") : null} title={e.title} sub={`${e.eventTime.slice(0, 5)}${e.placeName ? ` · ${e.placeName}` : ""}`} vn={e.organizer?.name ?? null} onPress={() => router.push(`/event/${e.id}` as Href)} />;
            })}
          </View>
        ))}

        {events !== null && events.length > 0 && found === 0 ? (
          <KGlass style={{ marginTop: 16, borderRadius: 28 }}>
            <View style={{ padding: 20, alignItems: "center", gap: 6 }}>
              <Text style={kf("500", 17)}>Ничего не нашли</Text>
              <Text style={kf("400", 13.5, { color: K.ink2 })}>Попробуй другой день или раздел.</Text>
              <Press dark onPress={reset} style={{ marginTop: 10, height: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: K.ink, justifyContent: "center" }}>
                <Text style={kf("500", 14, { color: "#fff" })}>Сбросить фильтры</Text>
              </Press>
            </View>
          </KGlass>
        ) : null}
        {events !== null && events.length === 0 && shownCity.length === 0 ? (
          <KGlass style={{ marginTop: 16, borderRadius: 28 }}>
            <View style={{ padding: 20, alignItems: "center", gap: 6 }}>
              <Text style={[kf("500", 17, { lh: 1.3 }), { textAlign: "center" }]}>Заведения {city ? `в городе ${city}` : "рядом"} пока не публиковали события</Text>
              <Text style={[kf("400", 13.5, { color: K.ink2 }), { textAlign: "center" }]}>Как только появятся — покажем здесь и на карте.</Text>
            </View>
          </KGlass>
        ) : null}

        {shownCity.length > 0 ? (
          <View style={{ gap: 8 }}>
            <Text style={[kf("500", 15, { ls: -0.01 }), { marginTop: 18, marginBottom: 8, marginHorizontal: 2 }]}>Что ещё в городе</Text>
            {shownCity.map((c) => (
              <AfRow key={c.id} photo={c.photoUrl} chip={c.priceText || null} title={c.title} sub={`${cityDay(c)} · ${KIND_LABEL[c.kind ?? ""] ?? "Событие"}`} vn={c.placeName} onPress={() => router.push(`/city/${c.id}` as Href)} />
            ))}
          </View>
        ) : null}
      </ScrollView>

      {/* .mapfab: «Создать событие» внизу по центру */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 18, alignItems: "center" }}>
        <Press dark onPress={() => router.push({ pathname: "/create", params: { business: "true" } })} style={{ height: 50, paddingHorizontal: 22, borderRadius: 25, backgroundColor: "rgba(22,18,31,0.86)", flexDirection: "row", alignItems: "center", gap: 8 }}>
          <KI n="plus" size={18} color="#fff" />
          <Text style={kf("500", 15, { color: "#fff" })}>Создать событие</Text>
        </Press>
      </View>
    </View>
  );
}

/** .k-afr: строка события — фото 96×120 с ценой, название, время · место, заведение. */
function AfRow({ photo, chip, title, sub, vn, onPress }: { photo: string | null; chip: string | null; title: string; sub: string; vn: string | null; onPress: () => void }) {
  const cover = coverUri(photo);
  return (
    <KPressGlass onPress={onPress} style={{ borderRadius: 26 }}>
      <View style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 8 }}>
        <View style={{ width: 96, height: 120, borderRadius: 20, overflow: "hidden", backgroundColor: "#2B2737" }}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : null}
          {chip ? (
            <KGlass tone="gw" style={{ position: "absolute", left: 6, bottom: 6, maxWidth: 84, height: 24, borderRadius: 12, justifyContent: "center", paddingHorizontal: 8 }}>
              <Text style={kf("400", 11, { color: "#fff" })} numberOfLines={1}>{chip}</Text>
            </KGlass>
          ) : null}
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={kf("500", 16, { lh: 1.2 })} numberOfLines={3}>{title}</Text>
          <Text style={[kf("400", 12.5, { color: K.ink2 }), { marginTop: 4 }]} numberOfLines={1}>{sub}</Text>
          {vn ? <Text style={[kf("500", 12.5), { marginTop: 4 }]} numberOfLines={1}>{vn}</Text> : null}
        </View>
      </View>
    </KPressGlass>
  );
}

const styles = StyleSheet.create({
  pairBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
