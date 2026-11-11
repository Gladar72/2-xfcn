import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import { SvgXml } from "react-native-svg";
import { Image as ExpoImage } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Grad, Wordmark } from "@/components/brand";
import { characterSvg, type Face, type Palette, type Shape } from "@/lib/characters";
import { colors, FONT, f } from "@/lib/theme";

/**
 * Заставка загрузки — та же, что в мини-приложении (components/brand/LoadingScenes.tsx на сайте):
 * три сцены с персонажами «Места» сменяются каждые 3,2 с, пока грузится приложение.
 */
type Ch = [Shape, Palette, Face, number, number, number, number, ("fromL" | "fromR" | "drop")?];

const SCENES: { title: [string, string]; text: string; cast: Ch[] }[] = [
  {
    title: ["Есть куда", "пойти"],
    text: "Кофе, кино, пробежка, концерт — смотри, что происходит в городе прямо сейчас.",
    cast: [
      ["flower", "sky", "smile", 50, 50, 150, 0],
      ["squ", "pink", "calm", 22, 22, 78, 0.25],
      ["star", "peach", "sly", 80, 24, 72, 0.4],
      ["cloud", "mint", "smile", 18, 78, 74, 0.55],
      ["clover", "violet", "wow", 82, 76, 80, 0.7],
    ],
  },
  {
    title: ["Найдём,", "с кем"],
    text: "Люди рядом идут туда же. Откликнись — и ты уже не один.",
    cast: [
      ["blob", "pink", "wow", 30, 58, 128, 0, "fromL"],
      ["ball", "lilac", "calm", 70, 58, 120, 0.1, "fromR"],
    ],
  },
  {
    title: ["Встречаемся", "в Месте"],
    text: "Выбери место и иди проводить время вместе.",
    cast: [
      ["flower", "peach", "calm", 18, 62, 84, 0.45],
      ["squ", "pink", "smile", 82, 62, 80, 0.6],
      ["cloud", "sky", "smile", 30, 86, 70, 0.75],
      ["star", "violet", "sly", 70, 86, 68, 0.9],
    ],
  },
];

export const HEART = `<svg viewBox="0 0 24 24"><path fill="#FF5FAE" d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.2 4.3 2.4.7-1.2 2.2-2.4 4.3-2.4 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z"/></svg>`;
const PIN = `<svg viewBox="0 0 64 84"><defs><radialGradient id="lp" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#B9A2FF"/><stop offset="1" stop-color="#17141F"/></radialGradient></defs><ellipse cx="32" cy="80" rx="14" ry="4" fill="rgba(23,20,31,.15)"/><path d="M32 2C16 2 4 14 4 30c0 20 28 48 28 48s28-28 28-48C60 14 48 2 32 2z" fill="url(#lp)"/><circle cx="32" cy="30" r="11" fill="#fff"/></svg>`;

/** SVG персонажа без CSS-анимаций (в приложении «дыхание» и прыжки — через Animated). */
export function charXml(shape: Shape, pal: Palette, face: Face, seed: number) {
  return characterSvg(shape, pal, face, seed).replace(/ class="[^"]*"/g, "").replace(/ style="[^"]*"/g, "").replace(/ aria-hidden="true"/g, "");
}

/** Появление (пружина) + лёгкие прыжки по кругу. */
export function Pop({ children, delay, from, x, y, size, active }: { children: React.ReactNode; delay: number; from?: string; x: number; y: number; size: number; active: boolean }) {
  const t = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) {
      t.setValue(0);
      hop.stopAnimation();
      hop.setValue(0);
      return;
    }
    const a = Animated.sequence([
      Animated.delay(delay * 1000),
      Animated.spring(t, { toValue: 1, damping: 9, stiffness: 140, mass: 0.8, useNativeDriver: true }),
    ]);
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    a.start(() => loop.start());
    return () => {
      a.stop();
      loop.stop();
    };
  }, [active, delay, t, hop]);
  const enter =
    from === "fromL"
      ? [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [-160, 0] }) }]
      : from === "fromR"
        ? [{ translateX: t.interpolate({ inputRange: [0, 1], outputRange: [160, 0] }) }]
        : from === "drop"
          ? [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [-220, 0] }) }]
          : [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1] }) }, { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }];
  return (
    <Animated.View
      style={{
        position: "absolute",
        left: `${x}%`,
        top: `${y}%`,
        width: size,
        height: size,
        marginLeft: -size / 2,
        marginTop: -size / 2,
        opacity: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
        transform: [...enter, { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -7] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

/** Заставка как экран входа в прототипе: фото компании, белый логотип по центру,
 *  «Найди компанию на сегодня» и тонкая полоска загрузки внизу. */
export function LoadingScenes() {
  const insets = useSafeAreaInsets();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [x]);
  return (
    <View style={{ flex: 1, backgroundColor: "#17141F" }}>
      <ExpoImage source={require("../assets/auth_bg.webp")} style={StyleSheet.absoluteFill} contentFit="cover" />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(23,20,31,0.38)" }]} />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        <Wordmark height={46} color="#fff" />
        <Text style={{ marginTop: 22, fontSize: 30, lineHeight: 34, fontFamily: "Inter-Light", color: "#fff", textAlign: "center", letterSpacing: -1 }}>
          Найди <Text style={{ fontFamily: "Lora-Italic", fontSize: 32 }}>компанию</Text>
          {"\n"}на сегодня
        </Text>
      </View>
      <View style={{ position: "absolute", left: "50%", marginLeft: -60, width: 120, height: 3, borderRadius: 2, bottom: insets.bottom + 64, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" }}>
        <Animated.View style={{ width: 48, height: 3, borderRadius: 2, backgroundColor: "#fff", transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-48, 120] }) }] }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FBFAFF", overflow: "hidden" },
  head: { position: "absolute", left: 0, right: 0, alignItems: "center", gap: 12, zIndex: 3 },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#D9D2F2" },
  dotOn: { width: 18, backgroundColor: colors.violet },
  stage: { position: "absolute", left: 0, right: 0, top: "15%", height: "44%" },
  clouds: { position: "absolute", left: "-10%", right: "-10%", top: "55%", height: "14%", zIndex: 1 },
  cloud: { position: "absolute", bottom: 0, borderRadius: 999, backgroundColor: "#EFEBFA" },
  txt: { position: "absolute", left: 0, right: 0, top: "63%", bottom: 0, backgroundColor: "#EFEBFA", zIndex: 2, paddingTop: 28, paddingHorizontal: 28 },
  h1: { fontSize: 32, lineHeight: 34, ...f("800"), color: colors.ink, textAlign: "center", marginBottom: 12, letterSpacing: -0.6 },
  p: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: colors.ink2, textAlign: "center" },
  track: { position: "absolute", left: "50%", marginLeft: -60, width: 120, height: 4, borderRadius: 3, backgroundColor: "#DCD5F3", overflow: "hidden" },
});
