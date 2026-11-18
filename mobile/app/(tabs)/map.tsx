import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Camera, Map, Marker, UserLocation, type CameraRef } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { router, useLocalSearchParams, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Glass, RoundBtn } from "@/components/brand";
import { EventPin } from "@/components/map/EventPin";
import { Sheet } from "@/components/Sheet";
import { Icon } from "@/components/Icon";
import { Chip } from "@/components/ui";
import { api } from "@/lib/api";
import { tapLight } from "@/lib/feedback";
import { plural, qs, timePill } from "@/lib/format";
import { colors, eventIcon, FONT, f } from "@/lib/theme";
import { coverUri } from "@/lib/covers";
import type { MapEvent } from "@/lib/types";
import { useGuide } from "@/lib/guide";
import { MAP_STYLE, TYUMEN_CENTER } from "@/lib/map";
import { ADDRESS_ZOOM, MAX_MAP_ZOOM, clusterize, groupLocations, type MapGroup } from "@/lib/cluster";
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
  const params = useLocalSearchParams<{ date?: string; business?: string; t?: string; focus?: string }>();
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
  const [addressOpen, setAddressOpen] = useState(false);
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
    setBizCat(null);
    setSelected(null);
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
        let items = r.items.filter((e) => Number.isFinite(e.latitude) && Number.isFinite(e.longitude));
        if (chip === "now") items = items.filter((e) => new Date(e.startsAt).getTime() <= now && now < new Date(e.endsAt).getTime());
        setEvents(items);
        if (r.city) setCity(r.city);
        // Пришли со страницы события (нажали на карту места) — сразу к нему, его карточка первой.
        const f = params.focus ? items.find((e) => e.id === params.focus) : undefined;
        if (f) {
          const target = groupLocations(items.map(e => ({ ...e, lng: e.longitude, lat: e.latitude })), r.city ?? "").find(g => g.items.some(e => e.id === f.id));
          setTimeout(() => {
            if (id !== reqId.current) return;
            setSelected([f]);
            camera.current?.flyTo({ center: [target?.lng ?? f.longitude, target?.lat ?? f.latitude], zoom: ADDRESS_ZOOM, duration: 600 });
          }, 50);
        } else if (items.length && items.every((e) => e.latitude === items[0]!.latitude && e.longitude === items[0]!.longitude)) {
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
  }, [chip, bizOnly, params.focus, params.t]);

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
  const shown = useMemo(() => bizOnly && bizCat ? events.filter((e) => matchesBizCategory(e, bizCat)) : events, [events, bizOnly, bizCat]);
  const word = bizOnly ? plural(shown.length, "событие", "события", "событий") : plural(events.length, "встреча", "встречи", "встреч");
  const shownCount = shown.length;

  const locations = useMemo(() => groupLocations(shown.map(e => ({ ...e, lng: e.longitude, lat: e.latitude })), city ?? ""), [shown, city]);
  const clusters = useMemo(() => clusterize(locations, zoom), [locations, zoom]);
  useEffect(() => { setSelected(null); setAddressOpen(false); }, [shown]);
  const carousel = selected ?? shown.slice(0, 30);

  function zoomToCluster(group: MapGroup<MapEvent & { isCity?: boolean }>) {
    tapLight();
    setSelected(group.items);
    const nextZoom = group.locationCount === 1 ? ADDRESS_ZOOM : Math.min(ADDRESS_ZOOM, zoom + 2);
    camera.current?.flyTo({ center: [group.lng, group.lat], zoom: nextZoom, duration: 450 });
  }

  return (
    <View style={{ flex: 1 }}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        logo={false}
        compass={false}
        attributionPosition={{ bottom: insets.bottom + 96, left: 10 }}
        onRegionIsChanging={(e) => setZoom(Math.floor(e.nativeEvent.zoom * 4) / 4)}
        onRegionDidChange={(e) => setZoom(Math.floor(e.nativeEvent.zoom * 4) / 4)}
      >
        <Camera ref={camera} initialViewState={{ center: TYUMEN_CENTER, zoom: 11 }} />
        {located ? <UserLocation /> : null}
        {clusters.map((c) => {
          if (c.items.length > 1 && zoom < ADDRESS_ZOOM) {
            return (
              <Marker key={`group:${c.id}`} id={`group:${c.id}`} lngLat={[c.lng, c.lat]} anchor="center">
                <Pressable style={styles.cluster} onPress={() => zoomToCluster(c)} accessibilityRole="button" accessibilityLabel={`Показать события: ${c.items.length}`}>
                  <Text style={styles.clusterText}>{c.items.length}</Text>
                </Pressable>
              </Marker>
            );
          }
          const shared = c.items.length > 1;
          const visible = c.items.length > 3 ? c.items.slice(0, 2) : c.items;
          return (
            <Marker key={`photos:${c.id}`} id={`photos:${c.id}`} lngLat={[c.lng, c.lat]} anchor="bottom">
              <View collapsable={false} style={styles.pin}>
                <View style={styles.photoRow}>
                  {visible.map(e => {
                    const cityEvent = e.isCity || e.id.startsWith("city:");
                    const full = !cityEvent && e.seatsLeft <= 0;
                    const label = cityEvent ? "в городе" : full ? "мест нет" : timePill(e.startsAt, e.endsAt);
                    return (
                      <Pressable key={e.id} onPress={() => open(e)} accessibilityRole="button" accessibilityLabel={e.title}
                        style={[styles.pin, full && { opacity: 0.6 }]}>
                        <View style={[styles.pill, { backgroundColor: label === "сейчас" ? colors.live : "#17141F" }]}>
                          <Text style={styles.pillText}>{label}</Text>
                        </View>
                        <EventPin shared={shared} photo={coverUri(e.markerPhoto)} icon={eventIcon(e)} badge={e.isBusiness || cityEvent ? undefined : eventIcon(e)} />
                      </Pressable>
                    );
                  })}
                  {visible.length < c.items.length ? (
                    <Pressable accessibilityRole="button" accessibilityLabel={`Все события по адресу: ${c.items.length}`}
                      style={styles.morePhotos} onPress={() => { setSelected(c.items); setAddressOpen(true); }}>
                      <Text style={styles.clusterText}>+{c.items.length - visible.length}</Text>
                    </Pressable>
                  ) : null}
                </View>
                {shared ? <>
                  <View pointerEvents="none" style={styles.addressJoin} />
                  <View pointerEvents="none" style={styles.addressTip} />
                </> : null}
              </View>
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
                  {[bizOnly ? "Заведения" : "Что рядом?", city].filter(Boolean).join(" · ")}
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
        <FlatList
          data={carousel}
          keyExtractor={(e) => e.id}
          renderItem={({ item }) => <MapCard e={item} onPress={() => open(item)} />}
          horizontal
          showsHorizontalScrollIndicator={false}
          snapToInterval={310}
          decelerationRate="fast"
          style={{ position: "absolute", left: 0, right: 0, bottom: insets.bottom + 92 }}
          contentContainerStyle={{ gap: 10, paddingHorizontal: 20, paddingBottom: 6 }}
        />
      ) : null}

      <Sheet visible={addressOpen} onClose={() => setAddressOpen(false)}>
        <Text style={kf("600", 18)}>События по этому адресу</Text>
        <FlatList style={{ maxHeight: 420, flexShrink: 1 }} data={selected ?? []} keyExtractor={(e) => e.id}
          renderItem={({ item }) => <Pressable style={styles.addressEvent} onPress={() => { setAddressOpen(false); open(item); }}>
            <Image source={{ uri: coverUri(item.markerPhoto) ?? eventIcon(item) }} style={styles.addressPhoto} contentFit="cover" />
            <View style={{ flex: 1 }}>
              <Text style={kf("500", 15)}>{item.title}</Text>
              <Text style={kf("400", 13, { color: colors.grey })}>{timePill(item.startsAt, item.endsAt)}{item.placeName ? ` · ${item.placeName}` : ""}</Text>
            </View>
          </Pressable>} />
      </Sheet>
      <BizCatSheet visible={catSheet} onClose={() => setCatSheet(false)} counts={bizCounts} value={bizCat} onChange={setBizCat} total={events.length} />
      {/* .zm: приблизить / отдалить — справа посередине */}
      <View style={{ position: "absolute", right: 16, top: insets.top + 200, gap: 10 }}>
        <RoundBtn size={44} onPress={() => camera.current?.zoomTo(Math.min(MAX_MAP_ZOOM, zoom + 1), { duration: 250 })}><KI n="plus" size={18} /></RoundBtn>
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
  title: { ...f("500"), fontSize: 16, lineHeight: 21, includeFontPadding: false, color: colors.ink },
  sub: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, marginTop: 1 },
  note: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  noteText: { fontFamily: FONT, fontSize: 13, color: colors.ink2 },
  retry: { alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 16, height: 38, justifyContent: "center" },
  retryText: { fontSize: 14, ...f("600"), color: "#fff" },
  cluster: { minWidth: 46, height: 46, borderRadius: 23, paddingHorizontal: 6, borderWidth: 3, borderColor: "#fff", backgroundColor: "#17141F", alignItems: "center", justifyContent: "center" },
  clusterText: { ...f("600"), fontSize: 17, color: "#fff" },
  pin: { alignItems: "center" },
  photoRow: { flexDirection: "row", alignItems: "flex-end", gap: 3 },
  addressEvent: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  addressPhoto: { width: 46, height: 46, borderRadius: 12 },
  addressJoin: { alignSelf: "stretch", height: 6, marginHorizontal: 25, borderColor: "#17141F", borderLeftWidth: 2, borderRightWidth: 2, borderBottomWidth: 2, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  addressTip: { width: 0, height: 0, borderLeftWidth: 8, borderRightWidth: 8, borderTopWidth: 9, borderLeftColor: "transparent", borderRightColor: "transparent", borderTopColor: "#17141F" },
  morePhotos: { minWidth: 48, height: 48, paddingHorizontal: 4, borderRadius: 24, alignItems: "center", justifyContent: "center", backgroundColor: "#17141F" },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 2 },
  pillText: { color: "#fff", fontSize: 11.5, ...f("500") },
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
