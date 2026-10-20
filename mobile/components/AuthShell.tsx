import { useMemo, type ReactNode } from "react";
import { KeyboardAvoidingView, Linking, Platform, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { SvgXml } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wordmark } from "@/components/brand";
import { HEART, Pop, charXml } from "@/components/LoadingScenes";
import type { Face, Palette, Shape } from "@/lib/characters";
import { API_URL } from "@/lib/config";
import { colors, FONT } from "@/lib/theme";

/**
 * Оболочка экранов входа в стиле заставки: сверху логотип и прыгающие
 * персонажи «Места», снизу лавандовая панель с облаками, заголовком и кнопками.
 * compact — когда открыта клавиатура (почта, код): сцена становится ниже.
 */
const CAST: [Shape, Palette, Face, number, number, number, number, ("fromL" | "fromR")?][] = [
  ["blob", "pink", "wow", 30, 64, 120, 0, "fromL"],
  ["ball", "lilac", "calm", 70, 64, 112, 0.1, "fromR"],
  ["flower", "sky", "smile", 14, 24, 70, 0.35],
  ["star", "peach", "sly", 86, 26, 64, 0.5],
  ["cloud", "mint", "smile", 50, 18, 58, 0.65],
];

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
  const { height } = useWindowDimensions();
  const k = compact ? 0.6 : 1;
  const stageH = Math.round((compact ? 0.22 : 0.4) * height);
  const xml = useMemo(() => CAST.map(([s, p, f], n) => charXml(s, p, f, n + 1)), []);
  // В компактном виде мелкие персонажи сверху не помещаются — оставляем двоих.
  const cast = compact ? CAST.slice(0, 2) : CAST;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.root}>
      <View style={{ height: stageH + insets.top, paddingTop: insets.top + 18, alignItems: "center" }}>
        <Wordmark height={compact ? 22 : 26} color={colors.violet} />
        <View style={styles.stage}>
          {cast.map(([, , , x, y, size, d, a], n) => (
            <Pop key={n} x={x} y={compact ? 58 : y} size={size * k} delay={d} from={a} active>
              <SvgXml xml={xml[n]!} width={size * k} height={size * k} />
            </Pop>
          ))}
          <Pop x={50} y={compact ? 30 : 40} size={30 * k} delay={0.7} active>
            <SvgXml xml={HEART} width={30 * k} height={30 * k} />
          </Pop>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.clouds} pointerEvents="none">
          {[
            [-2, 34, 70],
            [22, 30, 95],
            [46, 36, 75],
            [74, 34, 100],
          ].map(([l, w, h], i) => (
            <View key={i} style={[styles.cloud, { left: `${l}%`, width: `${w}%`, height: `${h}%` }]} />
          ))}
        </View>
        <Text style={styles.h1}>
          {plain}
          <Text style={{ color: colors.violet }}>{em}</Text>
        </Text>
        {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        <View style={{ gap: 10 }}>{children}</View>
        <Text style={[styles.legal, { paddingBottom: insets.bottom + 12 }]}>
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
  );
}

const PANEL = "#EFEBFA";

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#FBFAFF" },
  stage: { flex: 1, alignSelf: "stretch" },
  panel: { flex: 1, backgroundColor: PANEL, paddingHorizontal: 20, paddingTop: 6 },
  clouds: { position: "absolute", left: "-10%", right: "-10%", top: -44, height: 46 },
  cloud: { position: "absolute", bottom: 0, borderRadius: 999, backgroundColor: PANEL },
  h1: { fontFamily: FONT, fontSize: 30, lineHeight: 32, fontWeight: "800", color: colors.ink, textAlign: "center", letterSpacing: -0.6, marginBottom: 8 },
  sub: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.ink2, textAlign: "center", marginBottom: 16 },
  legal: { fontFamily: FONT, textAlign: "center", color: colors.grey, fontSize: 11.5, marginTop: "auto", paddingTop: 12 },
  link: { color: colors.ink2, textDecorationLine: "underline" },
});
