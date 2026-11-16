// Карта в шаге «Когда и где?» — как LocationPicker мини-аппа: видна сразу (230 px),
// нажал — метка встала, адрес подставился сам; ⤢ — карта на весь экран с кнопкой «Готово».
import { useRef, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { Camera, Map, Marker, type CameraRef } from "@maplibre/maplibre-react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { api } from "@/lib/api";
import { MAP_STYLE, TYUMEN_CENTER } from "@/lib/map";
import { tapLight } from "@/lib/feedback";
import { K, KI, Press, kf } from "@/components/k";

type Coords = { latitude: number; longitude: number };

export function PlacePicker({
  value,
  onPick,
  onAddress,
}: {
  value: Coords | null;
  onPick: (c: Coords) => void;
  onAddress: (address: string) => void;
}) {
  const [full, setFull] = useState(false);
  return (
    <>
      <View style={st.box}>
        {!full ? <PickerMap value={value} onPick={onPick} onAddress={onAddress} /> : null}
        <View style={st.exp} pointerEvents="box-none">
          <Press onPress={() => setFull(true)} accessibilityLabel="Карта на весь экран" style={st.round}>
            <KI n="expand" size={18} />
          </Press>
        </View>
        {!value ? (
          <View style={st.hint} pointerEvents="none">
            <Text style={kf("500", 12.5, { color: K.ink })}>Нажми на карту — адрес определится сам</Text>
          </View>
        ) : null}
      </View>
      <Modal visible={full} animationType="slide" onRequestClose={() => setFull(false)} statusBarTranslucent>
        <FullMap value={value} onPick={onPick} onAddress={onAddress} onClose={() => setFull(false)} />
      </Modal>
    </>
  );
}

function FullMap({ value, onPick, onAddress, onClose }: { value: Coords | null; onPick: (c: Coords) => void; onAddress: (a: string) => void; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, backgroundColor: K.pearl }}>
      <PickerMap value={value} onPick={onPick} onAddress={onAddress} controlsTop={insets.top + 70} />
      <View style={[st.fullHead, { top: insets.top + 12 }]} pointerEvents="box-none">
        <Press onPress={onClose} accessibilityLabel="Закрыть" style={st.round}>
          <KI n="x" size={18} />
        </Press>
        <View style={st.fullTitle}>
          <Text style={kf("500", 14)}>Где встречаемся?</Text>
        </View>
      </View>
      <View style={[st.fullFoot, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <Press dark onPress={onClose} style={st.done}>
          <Text style={kf("500", 16, { color: "#fff" })}>{value ? "Готово" : "Закрыть"}</Text>
        </Press>
      </View>
    </View>
  );
}

function PickerMap({ value, onPick, onAddress, controlsTop = 12 }: { value: Coords | null; onPick: (c: Coords) => void; onAddress: (a: string) => void; controlsTop?: number }) {
  const camera = useRef<CameraRef>(null);
  const zoom = useRef(value ? 16 : 13);
  const seq = useRef(0);

  const pick = (c: Coords) => {
    tapLight();
    onPick(c);
    const my = ++seq.current;
    api<{ address?: string | null }>(`/api/geocode?lat=${c.latitude}&lng=${c.longitude}`)
      .then((r) => {
        if (my === seq.current && r.address) onAddress(r.address);
      })
      .catch(() => {});
  };

  const locate = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      camera.current?.flyTo({ center: [c.longitude, c.latitude], zoom: 16, duration: 600 });
      zoom.current = 16;
      pick(c);
    } catch {
      /* геолокация недоступна — ставим точку пальцем */
    }
  };

  return (
    <View style={StyleSheet.absoluteFill}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={MAP_STYLE}
        logo={false}
        compass={false}
        attributionPosition={{ top: 8, left: 58 }}
        onPress={(e: unknown) => {
          const ll = (e as { nativeEvent?: { lngLat?: [number, number] } })?.nativeEvent?.lngLat;
          if (ll) pick({ latitude: ll[1], longitude: ll[0] });
        }}
        onRegionDidChange={(e: unknown) => {
          const z = (e as { nativeEvent?: { zoom?: number } })?.nativeEvent?.zoom;
          if (typeof z === "number") zoom.current = z;
        }}
      >
        <Camera
          ref={camera}
          initialViewState={{ center: value ? [value.longitude, value.latitude] : TYUMEN_CENTER, zoom: zoom.current }}
        />
        {value ? (
          <Marker id="pick" lngLat={[value.longitude, value.latitude]} anchor="bottom">
            <View style={st.pin}>
              <View style={st.pinHead}>
                <KI n="pin" size={16} color="#fff" />
              </View>
              <View style={st.pinTail} />
            </View>
          </Marker>
        ) : null}
      </Map>
      <View style={[st.ctrl, { top: controlsTop }]} pointerEvents="box-none">
        <Press onPress={() => { zoom.current = Math.min(20, zoom.current + 1); camera.current?.zoomTo(zoom.current, { duration: 250 }); }} accessibilityLabel="Приблизить" style={st.round}>
          <KI n="plus" size={16} />
        </Press>
        <Press onPress={() => { zoom.current = Math.max(3, zoom.current - 1); camera.current?.zoomTo(zoom.current, { duration: 250 }); }} accessibilityLabel="Отдалить" style={st.round}>
          <KI n="minus" size={16} />
        </Press>
        <Press onPress={locate} accessibilityLabel="Где я" style={st.round}>
          <KI n="locate" size={17} />
        </Press>
      </View>
    </View>
  );
}

const shadow = { shadowColor: "rgb(40,20,100)", shadowOpacity: 0.14, shadowRadius: 8, shadowOffset: { width: 0, height: 6 } };
const st = StyleSheet.create({
  box: { height: 230, borderRadius: 26, overflow: "hidden", marginTop: 10, backgroundColor: "#EEECF3", borderWidth: 1, borderColor: "rgba(255,255,255,0.8)" },
  exp: { position: "absolute", left: 12, top: 12 },
  ctrl: { position: "absolute", right: 12, gap: 8 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.94)", alignItems: "center", justifyContent: "center", ...shadow },
  hint: { position: "absolute", left: 12, right: 12, bottom: 12, height: 34, borderRadius: 17, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", ...shadow },
  pin: { alignItems: "center" },
  pinHead: { width: 36, height: 36, borderRadius: 18, backgroundColor: "#17141F", borderWidth: 3, borderColor: "#fff", alignItems: "center", justifyContent: "center", ...shadow },
  pinTail: { width: 3, height: 10, backgroundColor: "#17141F", borderRadius: 2, marginTop: -1 },
  fullHead: { position: "absolute", left: 16, right: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  fullTitle: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.94)", justifyContent: "center", ...shadow },
  fullFoot: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12 },
  done: { height: 56, borderRadius: 28, backgroundColor: K.ink, alignItems: "center", justifyContent: "center" },
});
