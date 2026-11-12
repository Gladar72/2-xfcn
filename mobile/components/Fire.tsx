// «Огонёк» на событии: человек отмечает, что событие классное, даже если не идёт.
// Плашка на карточке (видна всегда, нажимается прямо в ленте) и кнопка в нижней панели события.
import { useEffect, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { api } from "@/lib/api";
import { tapLight, tapOk } from "@/lib/feedback";
import { f } from "@/lib/theme";

export function FireIcon({ size = 18, off = false }: { size?: number; off?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <LinearGradient id="fireg" x1="0" y1="1" x2="0" y2="0">
          <Stop offset="0" stopColor="#FF4D12" />
          <Stop offset="0.6" stopColor="#FF8A1F" />
          <Stop offset="1" stopColor="#FFC93C" />
        </LinearGradient>
      </Defs>
      <Path
        d="M12 2.2c.6 3.1 2.6 4.9 4.3 6.8 1.6 1.8 2.9 3.8 2.9 6.4A7.2 7.2 0 0 1 12 22.6a7.2 7.2 0 0 1-7.2-7.2c0-2.3 1-4.2 2.4-5.6.3 1.6 1.1 2.7 2.3 3.3-.4-3.9 1-7.7 2.5-10.9z"
        fill={off ? "none" : "url(#fireg)"}
        stroke={off ? "#fff" : "none"}
        strokeWidth={off ? 1.7 : 0}
        strokeLinejoin="round"
      />
      {off ? null : <Path d="M12 13.2c.4 1.5 1.6 2.4 2.2 3.6.5 1 .5 2.1.1 3a3.1 3.1 0 0 1-4.7 1.1 3 3 0 0 1-1-3.3c.4-1.5 2.4-2.6 3.4-4.4z" fill="#FFE7A3" />}
    </Svg>
  );
}

/** Состояние огонька + переключение с оптимистичным обновлением. */
export function useFire(eventId: string, count = 0, mine = false) {
  const [st, setSt] = useState({ count, mine });
  const scale = useRef(new Animated.Value(1)).current;
  useEffect(() => setSt({ count, mine }), [count, mine]);
  const toggle = () => {
    const on = !st.mine;
    if (on) tapOk();
    else tapLight();
    setSt({ count: Math.max(0, st.count + (on ? 1 : -1)), mine: on });
    if (on) {
      scale.setValue(0.6);
      Animated.spring(scale, { toValue: 1, friction: 3, tension: 160, useNativeDriver: true }).start();
    }
    api<{ count?: number; fired?: boolean }>(`/api/events/${eventId}/fire`, { method: on ? "POST" : "DELETE" })
      .then((d) => {
        if (typeof d?.count === "number") setSt({ count: d.count, mine: !!d.fired });
      })
      .catch(() => {});
  };
  return { ...st, toggle, scale };
}

/** Плашка на карточке в ленте. */
export function FireChip({ eventId, count, mine, style }: { eventId: string; count?: number; mine?: boolean; style?: StyleProp<ViewStyle> }) {
  const fire = useFire(eventId, count ?? 0, !!mine);
  return (
    <Pressable onPress={fire.toggle} hitSlop={10} style={[styles.chip, fire.count > 0 ? null : styles.chip0, fire.mine && styles.on, style]} accessibilityLabel={fire.mine ? "Убрать огонёк" : "Поставить огонёк"}>
      <Animated.View style={{ transform: [{ scale: fire.scale }] }}>
        <FireIcon size={14} off={!fire.mine} />
      </Animated.View>
      {fire.count > 0 ? <Text style={styles.chipText}>{fire.count}</Text> : null}
    </Pressable>
  );
}

/** Кнопка в нижней панели экрана события. */
export function FireButton({ eventId, count, mine }: { eventId: string; count?: number; mine?: boolean }) {
  const fire = useFire(eventId, count ?? 0, !!mine);
  return (
    <Pressable onPress={fire.toggle} style={[styles.btn, fire.mine && styles.on]} accessibilityLabel={fire.mine ? "Убрать огонёк" : "Поставить огонёк"}>
      <Animated.View style={{ transform: [{ scale: fire.scale }] }}>
        <FireIcon size={24} off={!fire.mine} />
      </Animated.View>
      {fire.count > 0 ? <Text style={styles.btnText}>{fire.count}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 4, height: 26, paddingLeft: 7, paddingRight: 9, borderRadius: 13, backgroundColor: "rgba(23,20,31,0.45)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  chip0: { width: 26, paddingLeft: 0, paddingRight: 0, justifyContent: "center" },
  chipText: { color: "#fff", fontSize: 12, ...f("600") },
  on: { backgroundColor: "rgba(255,106,31,0.3)", borderColor: "rgba(255,170,100,0.7)" },
  btn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, height: 56, minWidth: 56, paddingHorizontal: 14, borderRadius: 28, backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
  btnText: { color: "#fff", fontSize: 17, ...f("600") },
});
