import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Glass, Grad, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { plural, timePill } from "@/lib/format";
import { colors, FONT, pinIcon } from "@/lib/theme";
import type { MapEvent } from "@/lib/types";

const TYUMEN: Region = { latitude: 57.153, longitude: 65.534, latitudeDelta: 0.12, longitudeDelta: 0.12 };

export default function MapScreen() {
  const insets = useSafeAreaInsets();
  const map = useRef<MapView>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Пока картинки меток грузятся — даём карте перерисовывать их, потом замораживаем (так быстрее).
  const [tracking, setTracking] = useState(true);

  useEffect(() => {
    api<{ items: MapEvent[] }>("/api/events/map")
      .then((r) => {
        const items = r.items.filter((e) => e.latitude && e.longitude);
        setEvents(items);
        setTimeout(() => setTracking(false), 2500);
        if (items.length) {
          map.current?.fitToCoordinates(
            items.map((e) => ({ latitude: e.latitude, longitude: e.longitude })),
            { edgePadding: { top: 160, right: 60, bottom: 180, left: 60 }, animated: false }
          );
        }
      })
      .catch((e) => setError((e as Error).message));
  }, []);

  async function locate() {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") return;
    const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    map.current?.animateToRegion({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, latitudeDelta: 0.05, longitudeDelta: 0.05 });
  }

  return (
    <View style={{ flex: 1 }}>
      <MapView ref={map} style={StyleSheet.absoluteFill} initialRegion={TYUMEN} showsUserLocation showsMyLocationButton={false}>
        {events.map((e) => {
          const full = e.seatsLeft <= 0;
          const label = full ? "мест нет" : timePill(e.startsAt, e.endsAt);
          return (
            <Marker
              key={e.id}
              coordinate={{ latitude: e.latitude, longitude: e.longitude }}
              onPress={() => router.push(`/event/${e.id}`)}
              tracksViewChanges={tracking}
              anchor={{ x: 0.5, y: 1 }}
            >
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
        <Glass strong style={styles.titleBox}>
          <Text style={styles.title}>Встречи на карте</Text>
          <Text style={styles.sub}>
            {error ?? (events.length ? `${events.length} ${plural(events.length, "встреча", "встречи", "встреч")} рядом` : "Загружаем…")}
          </Text>
        </Glass>
      </View>

      <RoundBtn onPress={locate} size={50} style={[styles.locate, { bottom: insets.bottom + 104 }]}>
        <Icon name="nav" color={colors.violet} />
      </RoundBtn>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", left: 16, right: 16, alignItems: "flex-start" },
  titleBox: { borderRadius: 22, paddingHorizontal: 16, paddingVertical: 10 },
  title: { fontFamily: FONT, fontSize: 17, fontWeight: "500", color: colors.ink },
  sub: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, marginTop: 1 },
  pin: { alignItems: "center" },
  pill: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3, marginBottom: 2 },
  pillText: { fontFamily: FONT, color: "#fff", fontSize: 11.5, fontWeight: "500" },
  pinImg: { width: 48, height: 60 },
  locate: { position: "absolute", right: 16 },
});
