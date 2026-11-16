import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Camera, Map, Marker, UserLocation, type CameraRef } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Glass, Grad, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Chip } from "@/components/ui";
import { api } from "@/lib/api";
import { tapLight } from "@/lib/feedback";
import { plural, qs, timePill } from "@/lib/format";
import { colors, eventIcon, FONT, pinIcon, f } from "@/lib/theme";
import { coverUri } from "@/lib/covers";
import type { MapEvent } from "@/lib/types";
import { useGuide } from "@/lib/guide";
import { MAP_STYLE, TYUMEN_CENTER } from "@/lib/map";
import { clusterize } from "@/lib/cluster";
import { openRoute } from "@/lib/route";
import { K, KGlass, KI, Press, kf } from "@/components/k";
import { catIcon } from "@/lib/theme";
import { BizCatRow, BizCatSheet } from "@/components/BizCategories";
import { bizCategoryCounts, matchesBizCategory } from "@/lib/bizCategories";

const SMOKE_EVENTS: MapEvent[] = [
  [57.1522, 65.5272, "coffee"],
  [57.1613, 65.5455, "walk"],
  [57.1398, 65.5601, "cinema"],
].map(([latitude, longitude, slug], i) => ({
  id: `smoke-${i}`,
  title: "Тест",
  latitude: latitude as number,
  longitude: longitude as number,
  startsAt: new Date(Date.now() + (i + 1) * 3600_000).toISOString(),
  endsAt: new Date(Date.now() + (i + 3) * 3600_000).toISOString(),
  seatsLeft: 3,
  isBusiness: true,
  placeName: null,
  organizer: null,
  markerPhoto: i < 2 ? `/brand/covers/${slug}.webp` : null,
  category: { slug: slug as string, name: "" },
}));

/**
 * Метка на карте как в мини-приложении: белая капля с фото внутри — у людей аватар
 * (и значок категории в уголке), у заведений обложка события вместо значка-портфеля.
 * Нет фото — прежняя 3D-булавка категории.
 */
function PinPhoto({ e }: { e: MapEvent }) {
  const photo = coverUri(e.markerPhoto ?? null);
  const [broken, setBroken] = useState(false);
  if (!photo || broken) return <Image source={{ uri: pinIcon(e) }} style={styles.pinImg} contentFit="contain" />;
  return (
    <View style={styles.drop}>
      <View style={[styles.dropShape, e.isBusiness && styles.dropBiz]} />
      <Image source={{ uri: photo }} style={styles.dropImg} contentFit="cover" onError={() => setBroken(true)} />
      {!e.isBusiness ? (
        <View style={styles.badge}>
          <Image source={{ uri: eventIcon(e) }} style={{ width: 19, height: 19 }} contentFit="contain" />
        </View>
      ) : null}
    </View>
  );
}

type DateChip = "any" | "now" | "today" | "tomorrow" | "weekend";
const CHIPS: [DateChip, string][] = [
  ["now", "Сейчас"],
  ["today", "Сегодня"],
  ["tomorrow", "Завтра"],
  ["weekend", "На выходных"],
];

/**
 * Карта встреч. Параметры: ?date=today|tomorrow|weekend, ?business=only — только
 * события заведений и городская афиша (как /map?business=only в мини-приложении).
 */
export default function MapScreen() {
  useGuide("map");
  const params = useLocalSearchParams<{ date?: string; business?: string; t?: string }>();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  // Точка «я здесь» — только если доступ к геопозиции уже дан (сами не спрашиваем при открытии).
  const [located, setLocated] = useState(false);
  const [events, setEvents] = useState<(MapEvent & { isCity?: boolean })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [chip, setChip] = useState<DateChip>((params.date as DateChip) || "any");
  const [bizOnly, setBizOnly] = useState(params.business === "only");
  const [bizCat, setBizCat] = useState<string | null>(null);
  const [catSheet, setCatSheet] = useState(false);
  // Кластеры как в мини-аппе: при отдалении метки собираются в тёмные кружки с числом.
  const [zoom, setZoom] = useState(11);
  const [selected, setSelected] = useState<(MapEvent & { isCity?: boolean })[] | null>(null);
  useEffect(() => {
    Location.getForegroundPermissionsAsync()
      .then((p) => setLocated(p.status === "granted"))
      .catch(() => {});
  }, []);

  // Пришли с параметрами (из поиска или «Для бизнеса») — применяем. t меняется при
  // каждом переходе, поэтому повторный переход с теми же параметрами тоже срабатывает.
  useEffect(() => {
    if (!params.t) return;
    setChip(((params.date as DateChip) || "any") as DateChip);
    setBizOnly(params.business === "only");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.t]);
  const reqId = useRef(0);

  const load = useCallback(() => {
    setError(null);
    const id = ++reqId.current;
    const query = qs({ date: chip === "now" ? "today" : chip === "any" ? undefined : chip, business: bizOnly ? "only" : undefined });
    // Тестовая сборка для эмулятора — без входа, с тремя примерами меток.
    const source = process.env.EXPO_PUBLIC_MAP_SMOKE === "1" ? Promise.resolve({ items: SMOKE_EVENTS, city: "Тюмень" }) : api<{ items: (MapEvent & { isCity?: boolean })[]; city?: string }>(`/api/events/map${query ? `?${query}` : ""}`);
    source
      .then((r) => {
        if (id !== reqId.current) return; // пришёл ответ на старый фильтр
        const now = Date.now();
        let items = r.items.filter((e) => e.latitude && e.longitude);
        if (chip === "now") items = items.filter((e) => new Date(e.startsAt).getTime() <= now && now < new Date(e.endsAt).getTime());
        setEvents(items);
        if (r.city) setCity(r.city);
        if (items.length === 1) {
          camera.current?.flyTo({ center: [items[0].longitude, items[0].latitude], zoom: 14, duration: 600 });
        } else if (items.length > 1) {
          const lngs = items.map((e) => e.longitude);
          const lats = items.map((e) => e.latitude);
          camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], {
            padding: { top: 200, right: 60, bottom: 180, left: 60 },
            duration: 600,
          });
        }
      })
      .catch(() => id === reqId.current && setError("Не удалось загрузить карту"));
  }, [chip, bizOnly]);

  useEffect(load, [load]);

  async function locate() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    setLocated(true);
    camera.current?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 14, duration: 800 });
  }

  function open(e: MapEvent & { isCity?: boolean }) {
    if (e.isCity || e.id.startsWith("city:")) router.push(`/city/${e.id.replace(/^city:/, "")}` as Href);
    else router.push(`/event/${e.id}` as Href);
  }

  // Карта заведений: категория (кафе, бары, концерты…) — фильтруем сразу, без загрузки.
  const bizCounts = useMemo(() => (bizOnly ? bizCategoryCounts(events) : []), [bizOnly, events]);
  const shown = bizOnly && bizCat ? events.filter((e) => matchesBizCategory(e, bizCat)) : events;
  const word = bizOnly ? plural(shown.length, "событие", "события", "событий") : plural(events.length, "встреча", "встречи", "встреч");
  const shownCount = shown.length;

  const clusters = useMemo(() => clusterize(shown.map((e) => ({ ...e, lng: e.longitude, lat: e.latitude })), Math.round(zoom)), [shown, zoom]);
  useEffect(() => setSelected(null), [shown]);
  const carousel = (selected ?? shown).slice(0, 30);

  function openCluster(leaves: (MapEvent & { isCity?: boolean })[]) {
    tapLight();
    setSelected(leaves);
    const lngs = leaves.map((e) => e.longitude);
    const lats = leaves.map((e) => e.latitude);
    const spread = Math.max(...lngs) - Math.min(...lngs) + Math.max(...lats) - Math.min(...lats);
    if (spread < 0.0005) {
      camera.current?.flyTo({ center: [lngs[0]!, lats[0]!], zoom: 17, duration: 500 });
    } else {
      camera.current?.fitBounds([Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)], { padding: { top: 220, right: 60, bottom: 260, left: 60 }, duration: 500 });
    }
  }


  return (
    <View style={{ flex: 1 }}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        logo={false}
        compass={false}
        attributionPosition={{ bottom: insets.bottom + 96, left: 10 }}
        onRegionDidChange={(e: unknown) => {
          const ev = e as { nativeEvent?: { zoom?: number }; properties?: { zoomLevel?: number } };
          const z = ev?.nativeEvent?.zoom ?? ev?.properties?.zoomLevel;
          if (typeof z === "number") setZoom(z);
        }}
      >
        <Camera ref={camera} initialViewState={{ center: TYUMEN_CENTER, zoom: 11 }} />
        {located ? <UserLocation /> : null}
        {clusters.map((c) => {
          if (c.items.length > 1) {
            const n = c.items.length;
            const label = n > 99 ? "99+" : String(n);
            const size = (label.length >= 3 ? 50 : 42) + 4;
            return (
              <Marker key={c.id} id={c.id} lngLat={[c.lng, c.lat]} anchor="center">
                <Pressable onPress={() => openCluster(c.items)} accessibilityLabel={`Показать встречи: ${n}`}
                  style={{ width: size, height: size, borderRadius: size / 2, borderWidth: 3, borderColor: "#fff", backgroundColor: "#17141F", alignItems: "center", justifyContent: "center", shadowColor: "#17141F", shadowOpacity: 0.55, shadowRadius: 11, shadowOffset: { width: 0, height: 10 } }}>
                  <Text style={{ color: "#fff", fontSize: label.length >= 3 ? 16 : 17, ...f("600") }}>{label}</Text>
                </Pressable>
              </Marker>
            );
          }
          const e = c.items[0];
          if (!e) return null;
          const cityEv = e.isCity || e.id.startsWith("city:");
          const full = !cityEv && e.seatsLeft <= 0;
          const label = cityEv ? "в городе" : full ? "мест нет" : timePill(e.startsAt, e.endsAt);
          return (
            <Marker key={e.id} id={e.id} lngLat={[e.longitude, e.latitude]} anchor="bottom">
              <Pressable onPress={() => open(e)} style={[styles.pin, full && { opacity: 0.6 }]}>
                {label === "сейчас" ? (
                  <View style={[styles.pill, { backgroundColor: colors.live }]}>
                    <Text style={styles.pillText}>сейчас</Text>
                  </View>
                ) : (
                  <View style={[styles.pill, { backgroundColor: "#17141F" }]}>
                    <Text style={styles.pillText}>{label}</Text>
                  </View>
                )}
                <PinPhoto e={e} />
              </Pressable>
            </Marker>
          );
        })}
      </Map>

      <View style={[styles.top, { top: insets.top + 10 }]} pointerEvents="box-none">
        <View style={styles.bar}>
          <Pressable onPress={() => router.push("/search")} style={{ flex: 1 }}>
            <Glass strong style={styles.titleBox}>
              <Icon name="search" size={18} color={colors.grey} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title} numberOfLines={1}>
                  {bizOnly ? "Заведения" : "Что рядом?"}
                  {city ? ` · ${city}` : ""}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>{error ?? (shownCount ? `${shownCount} ${word} на карте` : events.length ? "В этой категории пусто" : "Загружаем…")}</Text>
              </View>
            </Glass>
          </Pressable>
          <RoundBtn dark size={50} onPress={() => (bizOnly ? setCatSheet(true) : router.push({ pathname: "/search", params: { filters: "1" } }))}>
            <Icon name="filter" color="#fff" />
          </RoundBtn>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }} style={{ marginHorizontal: -16 }}>
          {bizOnly ? <Chip label="Все встречи ✕" active onPress={() => setBizOnly(false)} /> : null}
          {CHIPS.map(([v, l]) => (
            <Chip
              key={v}
              label={l}
              active={chip === v}
              onPress={() => {
                tapLight();
                setChip((c) => (c === v ? "any" : v));
              }}
            />
          ))}
        </ScrollView>
        {bizOnly && bizCounts.length ? <BizCatRow counts={bizCounts} value={bizCat} onChange={setBizCat} /> : null}
        {bizOnly && !bizCat ? (
          <Glass strong style={styles.note}>
            <Text style={styles.noteText}>Здесь только события заведений{city ? ` в городе ${city}` : ""} — кафе, бары, студии.</Text>
          </Glass>
        ) : null}
        {error ? (
          <Pressable onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Попробовать снова</Text>
          </Pressable>
        ) : null}
      </View>

      {/* .mcar: карточки встреч внизу карты (по кластеру — только его встречи) */}
      {carousel.length ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={310}
          decelerationRate="fast"
          style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 92 }}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 6 }}
        >
          {carousel.map((e) => <MapCard key={e.id} e={e} onPress={() => open(e)} />)}
        </ScrollView>
      ) : null}

      <BizCatSheet visible={catSheet} onClose={() => setCatSheet(false)} counts={bizCounts} value={bizCat} onChange={setBizCat} total={events.length} />
      {/* .zm: приблизить / отдалить — справа посередине */}
      <View style={{ position: "absolute", right: 16, top: insets.top + 200, gap: 10 }}>
        <RoundBtn size={44} onPress={() => camera.current?.zoomTo(Math.min(20, zoom + 1), { duration: 250 })}><KI n="plus" size={18} /></RoundBtn>
        <RoundBtn size={44} onPress={() => camera.current?.zoomTo(Math.max(3, zoom - 1), { duration: 250 })}><KI n="minus" size={18} /></RoundBtn>
      </View>
      {/* .locate2: создать встречу — тёмная круглая кнопка над «Где я» */}
      <View style={{ position: "absolute", right: 16, bottom: insets.bottom + (carousel.length ? 256 : 164) }}>
        <Press dark onPress={() => router.push("/create")} accessibilityLabel="Создать встречу" style={{ width: 50, height: 50, borderRadius: 25, backgroundColor: K.ink, alignItems: "center", justifyContent: "center" }}>
          <KI n="plus" size={22} color="#fff" />
        </Press>
      </View>
      {/* .listb: «Списком · N» / «Здесь N · показать все» — над карточками */}
      <View pointerEvents="box-none" style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + (carousel.length ? 206 : 104), alignItems: "center" }}>
        <Press onPress={() => (selected ? setSelected(null) : router.push(bizOnly ? "/business" : "/search"))} style={{ height: 36, borderRadius: 18 }}>
          <KGlass style={{ height: 36, borderRadius: 18 }}>
            <View style={{ height: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14 }}>
              <KI n={selected ? "x" : "filter"} size={14} />
              <Text style={kf("500", 13.5)}>{selected ? (selected.length > 1 ? `Здесь ${selected.length} · показать все` : "Показать все") : `Списком · ${shown.length}`}</Text>
            </View>
          </KGlass>
        </Press>
      </View>
      <RoundBtn onPress={locate} size={50} style={[styles.locate, { bottom: insets.bottom + (carousel.length ? 196 : 104) }]}>
        <Icon name="nav" color={colors.violet} />
      </RoundBtn>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", left: 16, right: 16, gap: 10 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleBox: { borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontSize: 16, ...f("500"), color: colors.ink },
  sub: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, marginTop: 1 },
  note: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  noteText: { fontFamily: FONT, fontSize: 13, color: colors.ink2 },
  retry: { alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 16, height: 38, justifyContent: "center" },
  retryText: { fontSize: 14, ...f("600"), color: "#fff" },
  pin: { alignItems: "center" },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 2 },
  pillText: { color: "#fff", fontSize: 11.5, ...f("500") },
  pinImg: { width: 48, height: 60 },
  drop: { width: 52, height: 52, marginBottom: 10 },
  dropShape: {
    position: "absolute",
    left: 0,
    top: 0,
    width: 52,
    height: 52,
    backgroundColor: "#fff",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    borderBottomRightRadius: 26,
    borderBottomLeftRadius: 0,
    transform: [{ rotate: "-45deg" }],
    shadowColor: "#3C1E8C",
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  dropBiz: { borderWidth: 3, borderColor: colors.violet },
  dropImg: { position: "absolute", left: 4, top: 4, width: 44, height: 44, borderRadius: 22, backgroundColor: "#F3EFFF" },
  badge: {
    position: "absolute",
    right: -6,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
  },
  locate: { position: "absolute", right: 16 },
});

function dayShortMap(dateIso: string) {
  const d = new Date(dateIso);
  const t = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 864e5);
  if (diff === 0) return "сегодня";
  if (diff === 1) return "завтра";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "");
}

/** .mcard: карточка встречи внизу карты — фото организатора, название, когда · где, мест, маршрут. */
function MapCard({ e, onPress }: { e: MapEvent & { isCity?: boolean }; onPress: () => void }) {
  const cityEv = e.isCity || e.id.startsWith("city:");
  const live = Date.now() >= new Date(e.startsAt).getTime() && Date.now() < new Date(e.endsAt).getTime();
  const ava = e.organizer?.avatarUrl && !e.organizerHidden ? e.organizer.avatarUrl : null;
  return (
    <Press onPress={onPress} style={{ width: 300, borderRadius: 24 }}>
      <KGlass style={{ borderRadius: 24 }}>
        <View style={{ flexDirection: "row", gap: 12, alignItems: "center", padding: 10, backgroundColor: "rgba(255,255,255,0.2)" }}>
          {ava ? (
            <Image source={{ uri: ava }} style={{ width: 72, height: 72, borderRadius: 17 }} contentFit="cover" />
          ) : (
            <View style={{ width: 72, height: 72, borderRadius: 17, backgroundColor: "#F3EFFF", alignItems: "center", justifyContent: "center" }}>
              <Image source={{ uri: e.isBusiness ? catIcon("business") : catIcon(e.category?.slug) }} style={{ width: 50, height: 50 }} contentFit="contain" />
            </View>
          )}
          <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
            <Text style={kf("500", 15)} numberOfLines={1}>{e.title}</Text>
            <Text style={kf("400", 12.5, { color: colors.grey })} numberOfLines={1}>
              {live ? "идёт сейчас" : `${dayShortMap(e.startsAt.slice(0, 10))}, ${new Date(e.startsAt).toTimeString().slice(0, 5)}`} · {e.organizerHidden ? "анонимно · место после одобрения" : e.placeName ?? ""}
            </Text>
            <Text style={kf("400", 12.5, { color: colors.grey })}>{cityEv ? "событие города" : e.seatsLeft > 0 ? `свободно ${e.seatsLeft}` : "мест нет"}</Text>
          </View>
          {!e.organizerHidden ? (
            <Press onPress={() => openRoute(e.latitude, e.longitude)} style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(23,20,31,0.06)", alignItems: "center", justifyContent: "center" }} accessibilityLabel="Маршрут">
              <KI n="route" size={18} color={K.ink} />
            </Press>
          ) : null}
        </View>
      </KGlass>
    </Press>
  );
}
