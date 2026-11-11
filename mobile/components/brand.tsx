// Фирменные элементы «Место» 2026 для телефона: фон-аврора, стекло, кнопки,
// градиентный текст, логотип, Мося. Повторяют классы .aurora / .gl / .btn
// из мини-приложения (app/proto.css).
import type { ReactNode } from "react";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { Image } from "expo-image";
import Svg, { Defs, LinearGradient as SvgLinear, Path, RadialGradient, Rect, Stop, G, Text as SvgText } from "react-native-svg";
import { brand, brandGradient, colors, fonts, gradientEnd, gradientStart, f, SERIF } from "@/lib/theme";
import { LOGO_LETTERS, LOGO_M, LOGO_VIEWBOX } from "@/lib/logo-paths";
import { textWidth } from "@/lib/textWidth";

export { textWidth };

/** Фон экрана как в прототипе: перламутр + мягкий свет сирени справа сверху и персика слева снизу. */
export function Aurora({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.pearl }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100">
        <Defs>
          <RadialGradient id="a1" cx="100" cy="0" rx="75" ry="40" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#DCD5FF" stopOpacity="0.95" />
            <Stop offset="0.75" stopColor="#DCD5FF" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="a2" cx="0" cy="48" rx="70" ry="30" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#FFE3D6" stopOpacity="0.85" />
            <Stop offset="0.75" stopColor="#FFE3D6" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="a3" cx="85" cy="100" rx="80" ry="34" gradientUnits="userSpaceOnUse">
            <Stop offset="0" stopColor="#D8E2FF" stopOpacity="0.7" />
            <Stop offset="0.75" stopColor="#D8E2FF" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect x="0" y="0" width="100" height="100" fill="url(#a1)" />
        <Rect x="0" y="0" width="100" height="100" fill="url(#a2)" />
        <Rect x="0" y="0" width="100" height="100" fill="url(#a3)" />
      </Svg>
    </View>
  );
}

/** Стеклянная плашка (.gl): размытие + полупрозрачный белый + тонкая белая обводка. */
export function Glass({
  children,
  style,
  strong,
  dark,
  intensity = 40,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  strong?: boolean;
  dark?: boolean;
  intensity?: number;
}) {
  const flat = StyleSheet.flatten(style) ?? {};
  const r = (flat.borderRadius as number | undefined) ?? 0;
  return (
    <View style={[styles.glassShadow, style, { overflow: "hidden" }]}>
      <BlurView
        intensity={intensity}
        tint={dark ? "dark" : "light"}
        experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
        style={[StyleSheet.absoluteFill, { borderRadius: r }]}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          {
            borderRadius: r,
            backgroundColor: dark ? "rgba(25,16,52,0.66)" : strong ? colors.glass2 : colors.glass,
            borderWidth: 1,
            borderColor: dark ? "rgba(255,255,255,0.16)" : colors.stroke,
          },
        ]}
      />
      {children}
    </View>
  );
}

/** Фирменная заливка градиентом. */
export function Grad({ children, style }: { children?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <LinearGradient colors={brandGradient} start={gradientStart} end={gradientEnd} style={style}>
      {children}
    </LinearGradient>
  );
}

type BtnKind = "v" | "k" | "o" | "tg" | "ok" | "apple" | "w";

/** Кнопка как .btn: v — градиент, k — чёрная, o — стекло, tg — Telegram, ok — зелёная. */
export function Btn({
  title,
  onPress,
  kind = "v",
  icon,
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress?: () => void;
  kind?: BtnKind;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const fg = kind === "o" || kind === "w" ? colors.ink : "#fff";
  const bg: Record<BtnKind, string> = { v: "transparent", k: colors.ink, o: colors.glass2, tg: colors.tg, ok: colors.ok, apple: "#000", w: "#fff" };
  const content = loading ? (
    <ActivityIndicator color={fg} />
  ) : (
    <View style={styles.btnRow}>
      {icon}
      <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
    </View>
  );
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        kind === "v" && styles.btnVShadow,
        kind === "tg" && styles.btnTgShadow,
        { backgroundColor: bg[kind], opacity: disabled ? 0.38 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
        kind === "o" && { borderWidth: 1, borderColor: colors.stroke },
        style,
      ]}
    >
      {kind === "v" ? (
        <LinearGradient colors={brandGradient} start={gradientStart} end={gradientEnd} style={[StyleSheet.absoluteFill, { borderRadius: 999 }]} />
      ) : null}
      {content}
    </Pressable>
  );
}

/** Круглая кнопка 44×44 (.rb): стекло или чёрная. */
export function RoundBtn({ children, onPress, dark, size = 44, style }: { children: ReactNode; onPress?: () => void; dark?: boolean; size?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.86 : 1 }] }, style]}>
      {dark ? (
        <View style={[styles.round, { width: size, height: size, backgroundColor: colors.ink }]}>{children}</View>
      ) : (
        <Glass style={[styles.round, { width: size, height: size, borderRadius: size / 2 }]}>{children}</Glass>
      )}
    </Pressable>
  );
}

/**
 * Текст с акцентом фирменным градиентом: «Что ищешь <em>сегодня?</em>».
 * С акцентом — рисуем целиком одним SVG (components/title-svg.tsx), чтобы акцент
 * стоял на одной линии с текстом и не обрезался.
 */
export function Title({ plain, em, size = 32, after, style }: { plain: string; em?: string; size?: number; after?: string; style?: StyleProp<TextStyle> }) {
  // Как в прототипе: Inter Light, одно слово-акцент — Lora Italic (чуть крупнее), всё одной строкой текста.
  const base: TextStyle = { fontSize: size, lineHeight: Math.round(size * 1.12), ...f("300"), letterSpacing: -size * 0.035, color: colors.ink };
  return (
    <Text style={[base, style]}>
      {plain}
      {em ? <Text style={{ fontFamily: SERIF, fontSize: size * 1.06, letterSpacing: -size * 0.01 }}>{em}</Text> : null}
      {after ?? ""}
    </Text>
  );
}

/**
 * Одно слово градиентом (для заголовков). Встаёт в строку как картинка: низ картинки
 * RN ставит на базовую линию, поэтому сдвигаем её вниз на высоту под базовой линией —
 * так градиентное слово стоит ровно на одной линии с обычным текстом.
 */
export function GradWord({ text, size }: { text: string; size: number }) {
  return <Text style={{ fontFamily: SERIF, fontSize: size * 1.06, color: colors.ink, letterSpacing: -size * 0.01 }}>{text}</Text>;
}

/** Логотип «место» (своя «м» с петлёй). */
export function Wordmark({ height = 28, color = colors.ink, gradientM }: { height?: number; color?: string; gradientM?: boolean }) {
  const [, , w = 1, h = 1] = LOGO_VIEWBOX.split(" ").map(Number);
  return (
    <Svg width={(height * w) / h} height={height} viewBox={LOGO_VIEWBOX}>
      {gradientM ? (
        <Defs>
          <SvgLinear id="wm" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#17141F" />
            <Stop offset="0.55" stopColor="#2A2636" />
            <Stop offset="1" stopColor="#3F3A4E" />
          </SvgLinear>
        </Defs>
      ) : null}
      <G>
        <Path d={LOGO_M} fill={gradientM ? "url(#wm)" : color} />
        <G fill={color}>
          {LOGO_LETTERS.map((l, i) => (
            <Path key={i} d={l.d} transform={l.transform} />
          ))}
        </G>
      </G>
    </Svg>
  );
}

export type MosyaPose = Parameters<typeof brand.mosya>[0];

/** Маскот Мося. */
export function Mosya({ pose = "wave", size = 120, style }: { pose?: MosyaPose; size?: number; style?: StyleProp<ViewStyle> }) {
  return <Image source={{ uri: brand.mosya(pose) }} style={[{ width: size, height: size }, style as object]} contentFit="contain" cachePolicy="disk" />;
}

/** Плашка-чип: lav — сиреневая, glass — на фото, live — «Идёт сейчас», dark — чёрная. */
export function Pill({ label, kind = "lav", icon }: { label: string; kind?: "lav" | "glass" | "live" | "dark" | "white"; icon?: ReactNode }) {
  const map = {
    lav: { bg: colors.lav, fg: colors.violet },
    glass: { bg: "rgba(255,255,255,0.22)", fg: "#fff" },
    live: { bg: "#fff", fg: "#2FA86A" },
    dark: { bg: colors.ink, fg: "#fff" },
    white: { bg: "#fff", fg: colors.violet },
  }[kind];
  return (
    <View style={[styles.pill, { backgroundColor: map.bg }, kind === "glass" && { borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" }]}>
      {kind === "live" ? <View style={styles.liveDot} /> : icon}
      <Text style={[styles.pillText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

/** Кружки аватарок «кто идёт». */
export function Faces({ people, size = 24, ring = "#fff" }: { people: { id: string; name: string; avatarUrl: string | null }[]; size?: number; ring?: string }) {
  if (!people.length) return null;
  return (
    <View style={{ flexDirection: "row" }}>
      {people.slice(0, 3).map((p, i) =>
        p.avatarUrl ? (
          <Image
            key={p.id}
            source={{ uri: p.avatarUrl }}
            style={{ width: size, height: size, borderRadius: size / 2, marginLeft: i ? -size / 3 : 0, borderWidth: 2, borderColor: ring }}
          />
        ) : (
          <View
            key={p.id}
            style={{ width: size, height: size, borderRadius: size / 2, marginLeft: i ? -size / 3 : 0, borderWidth: 2, borderColor: ring, backgroundColor: "#ECE8F2", alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: size * 0.42, color: colors.violet, ...f("600") }}>{p.name.charAt(0).toUpperCase()}</Text>
          </View>
        )
      )}
    </View>
  );
}

/** Шапка раздела: «Популярное сегодня ………… Все». */
export function SectionHead({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sec}>
      <Text style={styles.secTitle} numberOfLines={1}>{title}</Text>
      {action ? (
        <Pressable onPress={onAction} hitSlop={8} style={styles.secBtn}>
          <Text style={styles.secBtnText}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  glassShadow: { shadowColor: "#2A2160", shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 2 },
  btn: { height: 56, borderRadius: 999, alignItems: "center", justifyContent: "center", paddingHorizontal: 22, overflow: "hidden" },
  btnVShadow: { shadowColor: "#17141F", shadowOpacity: 0.22, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  btnTgShadow: { shadowColor: colors.tg, shadowOpacity: 0.5, shadowRadius: 16, shadowOffset: { width: 0, height: 10 }, elevation: 6 },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  btnText: { fontSize: 16, ...f("500") },
  round: { alignItems: "center", justifyContent: "center", borderRadius: 999 },
  pill: { flexDirection: "row", alignItems: "center", gap: 6, height: 30, paddingHorizontal: 11, borderRadius: 999, alignSelf: "flex-start" },
  pillText: { fontSize: 12.5, ...f("500") },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "#2FA86A" },
  sec: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 26, marginBottom: 12 },
  secTitle: { flexShrink: 1, fontSize: 22, ...f("300"), letterSpacing: -0.6, color: colors.ink },
  secBtn: { backgroundColor: "rgba(255,255,255,0.86)", borderRadius: 999, paddingHorizontal: 12, height: 30, justifyContent: "center" },
  secBtnText: { fontSize: 13.5, color: colors.violet, ...f("500") },
});

