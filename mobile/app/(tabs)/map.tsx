import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
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
import { colors, FONT, pinIcon } from "@/lib/theme";
import type { MapEvent } from "@/lib/types";

const TYUMEN: Region = { latitude: 57.153, longitude: 65.534, latitudeDelta: 0.12, longitudeDelta: 0.12 };

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
  const params = useLocalSearchParams<{ date?: string; business?: string; t?: string }>();
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const [events, setEvents] = useState<(MapEvent & { isCity?: boolean })[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [city, setCity] = useState<string | null>(null);
  const [chip, setChip] = useState<DateChip>((params.date as DateChip) || "any");
  const [bizOnly, setBizOnly] = useState(params.business === "only");
  // Пока картинки меток грузятся — даём карте перерисовывать их, потом замораживаем (так быстрее).
  const [tracking, setTracking] = useState(true);

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
    api<{ items: (MapEvent & { isCity?: boolean })[]; city?: string }>(`/api/events/map${query ? `?${query}` : ""}`)
      .then((r) => {
        if (id !== reqId.current) return; // пришёл ответ на старый фильтр
        const now = Date.now();
        let items = r.items.filter((e) => e.latitude && e.longitude);
        if (chip === "now") items = items.filter((e) => new Date(e.startsAt).getTime() <= now && now < new Date(e.endsAt).getTime());
        setEvents(items);
        if (r.city) setCity(r.city);
        setTracking(true);
        setTimeout(() => setTracking(false), 2500);
        if (items.length) {
          map.current?.fitToCoordinates(
            items.map((e) => ({ latitude: e.latitude, longitude: e.longitude })),
            { edgePadding: { top: 200, right: 60, bottom: 180, left: 60 }, animated: true }
          );
        }
      })
      .catch(() => id === reqId.current && setError("Не удалось загрузить карту"));
  }, [chip, bizOnly]);

  useEffect(load, [load]);

  async function locate() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    map.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  }

  function open(e: MapEvent & { isCity?: boolean }) {
    if (e.isCity || e.id.startsWith("city:")) router.push(`/city/${e.id.replace(/^city:/, "")}` as Href);
    else router.push(`/event/${e.id}` as Href);
  }

  const word = bizOnly ? plural(events.length, "событие", "события", "событий") : plural(events.length, "встреча", "встречи", "встреч");

  return (
    <View style={{ flex: 1 }}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={TYUMEN} showsUserLocation showsMyLocationButton={false}>
        {events.map((e) => {
          const cityEv = e.isCity || e.id.startsWith("city:");
          const full = !cityEv && e.seatsLeft <= 0;
          const label = cityEv ? "в городе" : full ? "мест нет" : timePill(e.startsAt, e.endsAt);
          return (
            <Marker key={e.id} coordinate={{ latitude: e.latitude, longitude: e.longitude }} onPress={() => open(e)} tracksViewChanges={tracking} anchor={{ x: 0.5, y: 1 }}>
              <View style={[styles.pin, full && { opacity: 0.6 }]}>
                {label === "сейчас" ? (
                  <View style={[styles.pill, { backgroundColor: colors.live }]}>
                    <Text style={styles.pillText}>сейчас</Text>
                  </View>
                ) : (
                  <Grad style={styles.pill}>
                    <Text style={styles.pillText}>{label}</Text>
                  </Grad>
                )}
                <Image source={{ uri: pinIcon(e) }} style={styles.pinImg} contentFit="contain" />
              </View>
            </Marker>
          );
        })}
      </MapView>

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
                <Text style={styles.sub}>{error ?? (events.length ? `${events.length} ${word} на карте` : "Загружаем…")}</Text>
              </View>
            </Glass>
          </Pressable>
          <RoundBtn dark size={50} onPress={() => router.push({ pathname: "/search", params: { filters: "1" } })}>
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
        {bizOnly ? (
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

      <RoundBtn onPress={locate} size={50} style={[styles.locate, { bottom: insets.bottom + 104 }]}>
        <Icon name="nav" color={colors.violet} />
      </RoundBtn>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", left: 16, right: 16, gap: 10 },
  bar: { flexDirection: "row", alignItems: "center", gap: 8 },
  titleBox: { borderRadius: 22, paddingHorizontal: 14, paddingVertical: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  title: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink },
  sub: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, marginTop: 1 },
  note: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  noteText: { fontFamily: FONT, fontSize: 13, color: colors.ink2 },
  retry: { alignSelf: "flex-start", backgroundColor: colors.ink, borderRadius: 999, paddingHorizontal: 16, height: 38, justifyContent: "center" },
  retryText: { fontFamily: FONT, fontSize: 14, fontWeight: "600", color: "#fff" },
  pin: { alignItems: "center" },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 2 },
  pillText: { fontFamily: FONT, color: "#fff", fontSize: 11.5, fontWeight: "500" },
  pinImg: { width: 48, height: 60 },
  locate: { position: "absolute", right: 16 },
});
