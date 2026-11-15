import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Tabs, router } from "expo-router";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path, SvgXml } from "react-native-svg";
import { f } from "@/lib/theme";
import { tapLight } from "@/lib/feedback";
import { Creature } from "@/components/k/Creature";
import { PendingReviews } from "@/components/reviews/PendingReviews";
import { fetchPendingApplications } from "@/lib/pending";

const TABS: Record<string, { label: string; icon: string }> = {
  index: { label: "Главная", icon: "home" },
  map: { label: "Карта", icon: "map" },
  meet: { label: "Встречи", icon: "people" },
  profile: { label: "Профиль", icon: "user" },
};
const ICON: Record<string, string> = {
  home: '<path d="M4 11l8-7 8 7v8.5a1.5 1.5 0 0 1-1.5 1.5H15v-6H9v6H5.5A1.5 1.5 0 0 1 4 19.5z"/>',
  map: '<path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6zM9 4v14M15 6v14"/>',
  people: '<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 3.5V17A2.5 2.5 0 0 1 4 14.5z"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
};
const H = 58;
/** Форма плашки с вырезом под Мосю — как navPath в components/layout/BottomNav.tsx мини-аппа. */
function navPath(w: number): string {
  const c = w / 2;
  const r = (n: number) => +n.toFixed(2);
  return `M29 0H${r(c - 44.82)}A6 6 0 0 1 ${r(c - 38.84)} 6.53A39 39 0 1 0 ${r(c + 38.84)} 6.53A6 6 0 0 1 ${r(c + 44.82)} 0H${r(w - 29)}A29 29 0 0 1 ${r(w - 29)} ${H}H29A29 29 0 0 1 29 0Z`;
}
const SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);

function NavTab({ label, icon, on, badge, onPress }: { label: string; icon: string; on: boolean; badge?: number; onPress: () => void }) {
  const lift = useRef(new Animated.Value(on ? 1 : 0)).current;
  const press = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(lift, { toValue: on ? 1 : 0, duration: 500, easing: SPRING, useNativeDriver: true }).start();
  }, [on, lift]);
  const color = on ? "#17141F" : "rgba(23,20,31,0.55)";
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => Animated.timing(press, { toValue: 0.9, duration: 120, useNativeDriver: true }).start()}
      onPressOut={() => Animated.timing(press, { toValue: 1, duration: 500, easing: SPRING, useNativeDriver: true }).start()}
      style={{ width: 62, alignItems: "center", gap: 2 }}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
    >
      <Animated.View style={{ transform: [{ translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -1] }) }, { scale: Animated.multiply(press, lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] })) }] }}>
        <SvgXml xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICON[icon]}</svg>`} width={21} height={21} />
        {badge ? (
          <View style={styles.badge} accessibilityLabel={`Новое на встречах: ${badge}`}>
            <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
          </View>
        ) : null}
      </Animated.View>
      <Text style={[styles.label, { color }]}>{label}</Text>
    </Pressable>
  );
}

/** Меню как в мини-аппе (.nav26): стеклянная плашка с вырезом, в вырезе — живой Мося 104 px с «+». */
function TabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const [w, setW] = useState(358);
  const [pending, setPending] = useState(0);
  const jelly = useRef(new Animated.Value(0)).current;
  const pressBlob = useRef(new Animated.Value(1)).current;
  const wob = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fetchPendingApplications().then((r) => setPending(r.count));
  }, [state.index]);
  useEffect(() => {
    // k-wob 4.5 с: Мося в меню чуть покачивается.
    const a = Animated.loop(Animated.sequence([
      Animated.timing(wob, { toValue: 1, duration: 2250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      Animated.timing(wob, { toValue: 0, duration: 2250, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
    ]));
    a.start();
    return () => a.stop();
  }, [wob]);
  const cur = state.routes[state.index]?.name;
  const go = (name: string) => {
    const r = state.routes.find((x) => x.name === name);
    if (!r) return;
    const e = navigation.emit({ type: "tabPress", target: r.key, canPreventDefault: true });
    if (cur !== name && !e.defaultPrevented) navigation.navigate(name);
  };
  const tab = (name: string) => {
    const t = TABS[name]!;
    return <NavTab key={name} label={t.label} icon={t.icon} on={cur === name} badge={name === "meet" ? pending : 0} onPress={() => go(name)} />;
  };
  const onPlus = () => {
    tapLight();
    jelly.setValue(0);
    Animated.timing(jelly, { toValue: 1, duration: 700, easing: SPRING, useNativeDriver: true }).start();
    router.push("/create");
  };
  // nav26jelly: 1 → (1.22, .8) → (.88, 1.14) → (1.06, .96) → 1
  const sx = jelly.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 1.22, 0.88, 1.06, 1] });
  const sy = jelly.interpolate({ inputRange: [0, 0.25, 0.5, 0.75, 1], outputRange: [1, 0.8, 1.14, 0.96, 1] });
  const path = navPath(w);
  if (!TABS[cur ?? ""]) return null;
  return (
    <View
      pointerEvents="box-none"
      onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}
      style={{ position: "absolute", left: 16, right: 16, bottom: insets.bottom + 6, height: H }}
    >
      {/* Плашка с вырезом: размытие под формой + светлая заливка + белая кромка, мягкая тень. */}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { shadowColor: "rgb(60,40,120)", shadowOpacity: 0.14, shadowRadius: 22, shadowOffset: { width: 0, height: 14 } }]}>
        <MaskedBlur path={path} w={w} />
      </View>
      <View style={{ flex: 1, flexDirection: "row", justifyContent: "space-around", alignItems: "center", paddingHorizontal: 4 }}>
        {tab("index")}
        {tab("map")}
        <View style={{ width: 98 }} />
        {tab("meet")}
        {tab("profile")}
      </View>
      <Pressable
        onPress={onPlus}
        onPressIn={() => Animated.timing(pressBlob, { toValue: 0.92, duration: 120, useNativeDriver: true }).start()}
        onPressOut={() => Animated.timing(pressBlob, { toValue: 1, duration: 500, easing: SPRING, useNativeDriver: true }).start()}
        accessibilityLabel="Создать встречу"
        style={{ position: "absolute", left: w / 2 - 52, top: -42, width: 104, height: 104 }}
      >
        <Animated.View
          style={{
            width: 104,
            height: 104,
            alignItems: "center",
            justifyContent: "center",
            shadowColor: "rgb(110,80,255)",
            shadowOpacity: 0.35,
            shadowRadius: 14,
            shadowOffset: { width: 0, height: 8 },
            transform: [
              { scaleX: Animated.multiply(sx, pressBlob) },
              { scaleY: Animated.multiply(sy, pressBlob) },
              { rotate: wob.interpolate({ inputRange: [0, 1], outputRange: ["-3deg", "3deg"] }) },
            ],
          }}
        >
          <Creature size={104} variant="p" />
          <View pointerEvents="none" style={{ position: "absolute", width: 20, height: 2.4, backgroundColor: "#fff", opacity: 0.9, borderRadius: 1 }} />
          <View pointerEvents="none" style={{ position: "absolute", width: 2.4, height: 20, backgroundColor: "#fff", opacity: 0.9, borderRadius: 1 }} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

/** Плашка по форме выреза: светлая заливка rgba(246,244,250,.96) и белая кромка (как .bgp + .edge в мини-аппе). */
function MaskedBlur({ path, w }: { path: string; w: number }) {
  return (
    <Svg width={w} height={H} style={StyleSheet.absoluteFill}>
      <Path d={path} fill="rgba(246,244,250,0.97)" stroke="#fff" strokeWidth={1.2} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 10, lineHeight: 12, ...f("500") },
  // .nbadge
  badge: { position: "absolute", right: -9, top: -7, minWidth: 18, height: 18, paddingHorizontal: 5, borderRadius: 9, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", shadowColor: "#000", shadowOpacity: 0.12, shadowRadius: 3, shadowOffset: { width: 0, height: 1 } },
  badgeText: { color: "#17141F", fontSize: 11, ...f("600") },
});
