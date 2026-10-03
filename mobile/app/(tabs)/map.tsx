import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import MapView, { Marker, type Region } from "react-native-maps";
import * as Location from "expo-location";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";
import { timePill } from "@/lib/format";
import { colors, font } from "@/lib/theme";
import type { MapEvent } from "@/lib/types";

const TYUMEN: Region = { latitude: 57.153, longitude: 65.534, latitudeDelta: 0.12, longitudeDelta: 0.12 };

export default function MapScreen() {
  const map = useRef<MapView>(null);
  const [events, setEvents] = useState<MapEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<{ items: MapEvent[] }>("/api/events/map")
      .then((r) => {
        const items = r.items.filter((e) => e.latitude && e.longitude);
        setEvents(items);
        if (items.length) {
          map.current?.fitToCoordinates(
            items.map((e) => ({ latitude: e.latitude, longitude: e.longitude })),
            { edgePadding: { top: 120, right: 60, bottom: 120, left: 60 }, animated: false }
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
          return (
            <Marker
              key={e.id}
              coordinate={{ latitude: e.latitude, longitude: e.longitude }}
              onPress={() => router.push(`/event/${e.id}`)}
              tracksViewChanges={false}
              anchor={{ x: 0.5, y: 1 }}
            >
              <View style={[styles.pin, full && { opacity: 0.55 }]}>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{full ? "мест нет" : timePill(e.startsAt, e.endsAt)}</Text>
                </View>
                <View style={[styles.photoRing, e.isBusiness && { borderColor: colors.orange }]}>
                  <Avatar uri={e.organizer?.avatarUrl} name={e.organizer?.name} size={42} />
                </View>
                <View style={styles.tip} />
              </View>
            </Marker>
          );
        })}
      </MapView>
      <SafeAreaView edges={["top"]} style={styles.top} pointerEvents="box-none">
        <View style={styles.titleBox}>
          <Text style={styles.title}>Карта встреч</Text>
          {error ? <Text style={{ color: colors.danger, fontSize: font.xs }}>{error}</Text> : null}
        </View>
      </SafeAreaView>
      <Pressable style={styles.locate} onPress={locate}>
        <Ionicons name="locate" size={22} color={colors.accent} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { position: "absolute", top: 0, left: 0, right: 0, paddingHorizontal: 16 },
  titleBox: { alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8, marginTop: 8, shadowColor: "#000", shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  title: { fontSize: font.base, fontWeight: "800", color: colors.ink900 },
  pin: { alignItems: "center" },
  pill: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, marginBottom: 4 },
  pillText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  photoRing: { borderWidth: 3, borderColor: "#fff", borderRadius: 26, backgroundColor: "#fff", shadowColor: "#000", shadowOpacity: 0.2, shadowRadius: 4, elevation: 4 },
  tip: { width: 10, height: 10, backgroundColor: "#fff", transform: [{ rotate: "45deg" }], marginTop: -6 },
  locate: { position: "absolute", right: 16, bottom: 24, width: 48, height: 48, borderRadius: 24, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
});
