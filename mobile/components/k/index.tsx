// Дизайн-система «K» — перенос app/k26.css мини-аппа один в один (размеры, шрифты, стекло, движения).
// Каждый компонент повторяет свой класс k-* — в комментарии указано, какой.
import { useEffect, useRef, type ReactNode } from "react";
import { Animated, Easing, Platform, StyleSheet, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { SvgXml } from "react-native-svg";
import { K_EXTRA, K_ICONS } from "./icons";
import { Press } from "./Press";
import { Creature } from "./Creature";
import { fonts, SERIF } from "@/lib/theme";

export { Press, Creature };

/** Переменные .K из app/k26.css. */
export const K = {
  ink: "#17141F",
  ink2: "rgba(23,20,31,0.58)",
  ink3: "rgba(23,20,31,0.38)",
  pearl: "#F4F2F8",
  pearl2: "#ECE8F2",
  line: "rgba(23,20,31,0.08)",
  glass: "rgba(255,255,255,0.58)",
  glassb: "rgba(255,255,255,0.95)",
  lilac: "#AAA0FF",
  peach: "#FFBEA0",
  sky: "#8CAAFF",
  chromeA: "#2F56E8",
  chromeB: "#FF6FB0",
  chromeC: "#FF7A3A",
  ok: "#2FA86A",
};

/** Шрифт мини-аппа: font: <weight> <size> var(--disp); letter-spacing в em → px. */
export function kf(weight: keyof typeof fonts, size: number, opts: { lh?: number; ls?: number; color?: string } = {}): TextStyle {
  return {
    fontFamily: fonts[weight],
    fontSize: size,
    ...(opts.lh ? { lineHeight: Math.round(size * opts.lh) } : null),
    ...(opts.ls ? { letterSpacing: size * opts.ls } : null),
    color: opts.color ?? K.ink,
  };
}
/** <em> мини-аппа: Lora Italic, обычно чуть крупнее (font-size:1.08em…1.1em). */
export function kem(size: number): TextStyle {
  return { fontFamily: SERIF, fontSize: size, letterSpacing: -0.01 * size };
}

/** Иконка мини-аппа (KI): те же контуры 24×24. */
export function KI({ n, size = 20, color = K.ink, sw = 1.7 }: { n: string; size?: number; color?: string; sw?: number }) {
  const body = K_ICONS[n] ?? K_EXTRA[n] ?? "";
  const xml = `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return <SvgXml xml={xml} width={size} height={size} />;
}

/** Фон экрана .k-pbg: перламутр и три мягких пятна (сирень, персик, небо), медленно плывут (k-drift 18 с). */
export function PearlBg({ style }: { style?: StyleProp<ViewStyle> }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const a = Animated.loop(
      Animated.sequence([
        Animated.timing(t, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 2, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 1, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(t, { toValue: 0, duration: 9000, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    a.start();
    return () => a.stop();
  }, [t]);
  const drift = {
    transform: [
      { translateX: t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, -12, 8] }) },
      { translateY: t.interpolate({ inputRange: [0, 1, 2], outputRange: [0, 16, -24] }) },
      { rotate: t.interpolate({ inputRange: [0, 1, 2], outputRange: ["0deg", "6deg", "-4deg"] }) },
    ],
  };
  return (
    <View style={[StyleSheet.absoluteFill, { overflow: "hidden" }, style]} pointerEvents="none">
      <LinearGradient colors={["#F5F3F8", "#ECE8F2"]} style={StyleSheet.absoluteFill} />
      <Animated.View style={[{ position: "absolute", left: "-30%", right: "-30%", top: "-30%", bottom: "-30%" }, drift]}>
        <Blob color="rgba(170,160,255,0.5)" x="80%" y="20%" w="30%" h="20%" />
        <Blob color="rgba(255,190,160,0.42)" x="15%" y="65%" w="28%" h="20%" />
        <Blob color="rgba(140,170,255,0.38)" x="70%" y="92%" w="35%" h="22%" />
      </Animated.View>
    </View>
  );
}

function Blob({ color, x, y, w, h }: { color: string; x: string; y: string; w: string; h: string }) {
  // radial-gradient(W H at X Y, color, transparent 70%) — эллипс с мягким краем.
  const xml = `<svg viewBox="0 0 100 100" preserveAspectRatio="none"><defs><radialGradient id="g" cx="${parseFloat(x)}" cy="${parseFloat(y)}" rx="${parseFloat(w)}" ry="${parseFloat(h)}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${color}"/><stop offset="0.7" stop-color="${color}" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" fill="url(#g)"/></svg>`;
  return <SvgXml xml={xml} width="100%" height="100%" style={StyleSheet.absoluteFill} />;
}

/** Светлое стекло без размытия: белое 66% на жемчужном фоне выглядит так же, как размытое. */
const GLASS_SOLID = "rgba(255,255,255,0.66)";

/** Стекло .k-g (светлое), .k-gw (белое на фото), .k-gd (тёмное). */
export function KGlass({ children, style, tone = "g", intensity }: { children?: ReactNode; style?: StyleProp<ViewStyle>; tone?: "g" | "gw" | "gd"; intensity?: number }) {
  const flat = StyleSheet.flatten(style) ?? {};
  const r = (flat.borderRadius as number | undefined) ?? 0;
  const bg = tone === "g" ? K.glass : tone === "gw" ? "rgba(255,255,255,0.2)" : "rgba(20,16,30,0.42)";
  const bd = tone === "g" ? K.glassb : tone === "gw" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)";
  return (
    <View style={[style, { overflow: "hidden" }]}>
      {/* Размытие — только на фото (gw/gd). На светлом фоне его не видно, а каждое размытие
          перерисовывается при каждом кадре прокрутки и нажатия — из-за этого всё подтормаживало. */}
      {tone !== "g" ? (
        <BlurView
          intensity={intensity ?? (tone === "gw" ? 30 : 40)}
          tint={tone === "gd" ? "dark" : "light"}
          experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
        />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: tone === "g" ? GLASS_SOLID : bg, borderWidth: 1, borderColor: bd }]} />
      {children}
    </View>
  );
}

/** Нажимаемое стекло: .k-g.k-pr. */
export function KPressGlass({ children, style, onPress, tone = "g", dark, accessibilityLabel }: { children?: ReactNode; style?: StyleProp<ViewStyle>; onPress?: () => void; tone?: "g" | "gw" | "gd"; dark?: boolean; accessibilityLabel?: string }) {
  const flat = StyleSheet.flatten(style) ?? {};
  const r = (flat.borderRadius as number | undefined) ?? 0;
  const bg = tone === "g" ? K.glass : tone === "gw" ? "rgba(255,255,255,0.2)" : "rgba(20,16,30,0.42)";
  const bd = tone === "g" ? K.glassb : tone === "gw" ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.18)";
  return (
    <Press onPress={onPress} style={style} dark={dark || tone === "gd"} accessibilityLabel={accessibilityLabel}>
      {tone !== "g" ? (
        <BlurView
          intensity={tone === "gw" ? 30 : 40}
          tint={tone === "gd" ? "dark" : "light"}
          experimentalBlurMethod={Platform.OS === "android" ? "dimezisBlurView" : undefined}
          style={[StyleSheet.absoluteFill, { borderRadius: r }]}
        />
      ) : null}
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: r, backgroundColor: tone === "g" ? GLASS_SOLID : bg, borderWidth: 1, borderColor: bd }]} />
      {children}
    </Press>
  );
}

/** .k-chip: 36 px, скругление 18, Inter 500 14; on — чёрная. */
export function KChip({ label, icon, iconUri, on, onPress, height = 36, padH = 14, tone = "g" }: { label?: string; icon?: string; iconUri?: string; on?: boolean; onPress?: () => void; height?: number; padH?: number; tone?: "g" | "gw" }) {
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 7, height, paddingHorizontal: padH }}>
      {icon ? <View style={{ marginLeft: label ? -4 : 0 }}><KI n={icon} size={22} color={on ? "#fff" : tone === "gw" ? "#fff" : K.ink} /></View> : null}
      {iconUri ? <Image source={{ uri: iconUri }} style={{ width: 22, height: 22, marginLeft: -4 }} contentFit="contain" tintColor={on ? "#fff" : undefined} /> : null}
      {label ? <Text style={kf("500", 14, { color: on || tone === "gw" ? "#fff" : K.ink })} numberOfLines={1}>{label}</Text> : null}
    </View>
  );
  if (on) {
    return (
      <Press onPress={onPress} dark style={{ height, borderRadius: height / 2, backgroundColor: K.ink, borderWidth: 1, borderColor: K.ink }}>
        {inner}
      </Press>
    );
  }
  return <KPressGlass onPress={onPress} tone={tone} style={{ height, borderRadius: height / 2 }}>{inner}</KPressGlass>;
}

/** .k-rb: круглая стеклянная кнопка 44 px с иконкой 20 px. */
export function KRb({ icon, onPress, size = 44, tone = "g", dot, children, accessibilityLabel }: { icon?: string; onPress?: () => void; size?: number; tone?: "g" | "gw" | "gd"; dot?: boolean; children?: ReactNode; accessibilityLabel?: string }) {
  return (
    <View>
      <KPressGlass onPress={onPress} tone={tone} accessibilityLabel={accessibilityLabel} style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }}>
        {children ?? (icon ? <KI n={icon} size={20} color={tone === "g" ? K.ink : "#fff"} /> : null)}
      </KPressGlass>
      {dot ? <View style={{ position: "absolute", top: 9, right: 10, width: 8, height: 8, borderRadius: 4, backgroundColor: K.chromeB, borderWidth: 2, borderColor: "#fff" }} /> : null}
    </View>
  );
}

/** Заголовок из кусков: обычный текст и <em> (Lora Italic). parts: ["Найди ", {em:"компанию"}, "\nна сегодня"]. */
export type KTitlePart = string | { em: string };
export function KTitle({ parts, size, weight = "300", ls = -0.035, lh = 1.14, emScale = 1.08, color = K.ink, style, numberOfLines }: { parts: KTitlePart[]; size: number; weight?: keyof typeof fonts; ls?: number; lh?: number; emScale?: number; color?: string; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  return (
    <Text style={[kf(weight, size, { lh, ls, color }), style]} numberOfLines={numberOfLines}>
      {parts.map((p, i) => (typeof p === "string" ? <Text key={i}>{p}</Text> : <Text key={i} style={[kem(size * emScale), { color }]}>{p.em}</Text>))}
    </Text>
  );
}

/** .k-sec: заголовок раздела (400 20, em ×1.1), подпись 13, кнопка «Все» (стекло 32 px). */
export function KSec({ plain, em, sub, action, onAction, style }: { plain: string; em?: string; sub?: string; action?: string; onAction?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12, marginTop: 26 }, style]}>
      <View style={{ minWidth: 0, flexShrink: 1 }}>
        <KTitle parts={em ? [plain + " ", { em }] : [plain]} size={20} weight="400" ls={-0.02} lh={1.2} emScale={1.1} numberOfLines={1} />
        {sub ? <Text style={[kf("400", 13, { color: K.ink2 }), { marginTop: 2 }]}>{sub}</Text> : null}
      </View>
      {action ? (
        <KPressGlass onPress={onAction} style={{ height: 32, borderRadius: 16, paddingHorizontal: 13, justifyContent: "center" }}>
          <Text style={kf("500", 13)}>{action}</Text>
        </KPressGlass>
      ) : null}
    </View>
  );
}

/** .k-mos: плашка с живым Мосей (62 px, скругление 31), текст 14/1.3 и чёрная кнопка «Открыть». */
export function KMos({ children, go, onPress, left, style }: { children: ReactNode; go?: string; onPress?: () => void; left?: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <KPressGlass onPress={onPress} style={[{ marginTop: 14, height: 62, borderRadius: 31 }, style]}>
      <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 4, paddingRight: 8 }}>
        {left ?? <Creature size={58} variant="e" />}
        <Text style={[kf("400", 14, { lh: 1.3 }), { flex: 1 }]} numberOfLines={3}>{children}</Text>
        {go ? (
          <View style={{ height: 42, paddingHorizontal: 16, borderRadius: 21, backgroundColor: K.ink, justifyContent: "center" }}>
            <Text style={kf("500", 13, { color: "#fff" })}>{go}</Text>
          </View>
        ) : null}
      </View>
    </KPressGlass>
  );
}

/** Жирный кусок внутри текста .k-mos (<b>). */
export function B({ children }: { children: ReactNode }) {
  return <Text style={{ fontFamily: fonts["600"] }}>{children}</Text>;
}

/** Затемнение снизу у фото-карточек (.k-hc::after / .k-mt::after). */
export function PhotoShade({ from = 0.38, to = 0.78 }: { from?: number; to?: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(0,0,0,0)", "rgba(0,0,0,0)", `rgba(12,8,24,${to})`]}
      locations={[0, from, 1]}
      style={StyleSheet.absoluteFill}
    />
  );
}

/** .k-biz: стеклянная подложка «Афиши заведений» (поля −14, скругление 32). */
export function KBiz({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <KGlass style={[{ marginTop: 26, marginHorizontal: -14, borderRadius: 32 }, style]}>
      <View style={{ paddingTop: 16, paddingHorizontal: 14, paddingBottom: 14 }}>{children}</View>
    </KGlass>
  );
}

/** Полоса под часами и батареей: контент уходит под неё плавно и не наезжает на статус-бар. */
export function StatusShade({ top }: { top: number }) {
  return (
    <LinearGradient
      pointerEvents="none"
      colors={["rgba(244,242,248,0.96)", "rgba(244,242,248,0.85)", "rgba(244,242,248,0)"]}
      locations={[0, 0.6, 1]}
      style={{ position: "absolute", left: 0, right: 0, top: 0, height: top + 18 }}
    />
  );
}
