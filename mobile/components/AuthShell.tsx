import { useMemo, type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from "react-native-svg";
import { SvgXml } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wordmark } from "@/components/brand";
import { HEART, Pop, charXml } from "@/components/LoadingScenes";
import type { Face, Palette, Shape } from "@/lib/characters";
import { API_URL } from "@/lib/config";
import { FONT, f } from "@/lib/theme";

/**
 * Экраны входа, вариант «Яркий градиент»: фиолетовый фон с розовым свечением,
 * сверху белый логотип и прыгающие персонажи «Места», снизу стеклянная
 * карточка с заголовком и кнопками. compact — когда открыта клавиатура.
 */
const CAST: [Shape, Palette, Face, number, number, number, number, ("fromL" | "fromR" | "drop")?][] = [
  ["flower", "peach", "calm", 50, 64, 128, 0, "drop"],
  ["ball", "pink", "smile", 26, 32, 96, 0.15, "fromL"],
  ["cloud", "sky", "wow", 74, 26, 92, 0.25, "fromR"],
  ["star", "mint", "sly", 14, 80, 62, 0.45],
  ["squ", "lilac", "smile", 86, 82, 66, 0.55],
];

export const AUTH = {
  text: "#fff",
  sub: "rgba(255,255,255,0.82)",
  muted: "rgba(255,255,255,0.7)",
  accent: "#FFC2DA",
  error: "#FFD3D3",
};

export function AuthShell({
  plain,
  em,
  sub,
  compact = false,
  children,
}: {
  plain: string;
  em: string;
  sub?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const k = compact ? 0.62 : 1;
  const xml = useMemo(() => CAST.map(([s, p, f], n) => charXml(s, p, f, n + 11)), []);
  // С клавиатурой места мало — оставляем трёх крупных героев.
  const cast = compact ? CAST.slice(0, 3) : CAST;

  return (
    <View style={styles.root}>
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <RadialGradient id="bg" cx="20%" cy="0%" rx="120%" ry="75%" fx="20%" fy="0%">
            <Stop offset="0" stopColor="#9B6BFF" />
            <Stop offset="0.45" stopColor="#6C3BFF" />
            <Stop offset="1" stopColor="#4A1FD1" />
          </RadialGradient>
          <RadialGradient id="glow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor="#FF6FA0" stopOpacity="0.75" />
            <Stop offset="1" stopColor="#FF6FA0" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#bg)" />
        <Circle cx="105%" cy="48%" r="210" fill="url(#glow)" />
      </Svg>

      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={{ flex: 1, paddingTop: insets.top + (compact ? 12 : 26), alignItems: "center" }}>
          <Wordmark height={compact ? 24 : 30} color="#fff" />
          <View style={styles.stage}>
            {cast.map(([, , , x, y, size, d, a], n) => (
              <Pop key={n} x={x} y={compact ? [58, 40, 40][n]! : y} size={size * k} delay={d} from={a} active>
                <SvgXml xml={xml[n]!} width={size * k} height={size * k} />
              </Pop>
            ))}
            <Pop x={52} y={compact ? 14 : 10} size={26 * k} delay={0.8} active>
              <SvgXml xml={HEART.replace("#FF5FAE", "#FFD2E6")} width={26 * k} height={26 * k} />
            </Pop>
          </View>
        </View>

        <View style={[styles.card, { marginBottom: insets.bottom + 12 }]}>
          <Text style={styles.h1}>
            {plain}
            <Text style={{ color: AUTH.accent }}>{em}</Text>
          </Text>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
          <View style={{ gap: 10 }}>{children}</View>
          <Text style={styles.legal}>
            Продолжая, ты принимаешь{" "}
            <Text style={styles.link} onPress={() => Linking.openURL(`${API_URL}/legal/offer`)}>
              условия
            </Text>{" "}
            и{" "}
            <Text style={styles.link} onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)}>
              политику конфиденциальности
            </Text>
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/** Полупрозрачная кнопка на стеклянной карточке («Войти по почте»). */
export function GlassBtn({ title, icon, onPress, loading }: { title: string; icon?: ReactNode; onPress?: () => void; loading?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [styles.glassBtn, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <>
          {icon}
          <Text style={styles.glassText}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#6C3BFF" },
  stage: { flex: 1, alignSelf: "stretch" },
  card: {
    marginHorizontal: 14,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.14)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.28)",
    paddingHorizontal: 18,
    paddingTop: 24,
    paddingBottom: 14,
  },
  h1: { fontSize: 30, lineHeight: 32, ...f("800"), color: AUTH.text, textAlign: "center", letterSpacing: -0.6, marginBottom: 8 },
  sub: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: AUTH.sub, textAlign: "center", marginBottom: 16 },
  legal: { fontFamily: FONT, textAlign: "center", color: AUTH.muted, fontSize: 11.5, marginTop: 14 },
  link: { color: AUTH.text, textDecorationLine: "underline" },
  glassBtn: {
    height: 56,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: "rgba(255,255,255,0.16)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
  },
  glassText: { fontSize: 16, ...f("600"), color: "#fff" },
});
