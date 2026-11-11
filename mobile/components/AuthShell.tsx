import { type ReactNode } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Wordmark } from "@/components/brand";
import { API_URL } from "@/lib/config";
import { FONT, SERIF, f } from "@/lib/theme";

/**
 * Экраны входа как в прототипе: фото компании на весь экран, мягкое затемнение,
 * белый логотип и «Найди компанию на сегодня» по центру, кнопки внизу без карточки.
 * compact — когда открыта клавиатура (вход по почте): логотип меньше, текст выше.
 */
export const AUTH = {
  text: "#fff",
  sub: "rgba(255,255,255,0.82)",
  muted: "rgba(255,255,255,0.7)",
  accent: "#fff",
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
  return (
    <View style={styles.root}>
      <Image source={require("../assets/auth_bg.webp")} style={StyleSheet.absoluteFill} contentFit="cover" />
      <LinearGradient
        colors={["rgba(23,20,31,0.35)", "rgba(23,20,31,0.15)", "rgba(23,20,31,0.55)", "rgba(23,20,31,0.92)"]}
        locations={[0, 0.3, 0.62, 1]}
        style={StyleSheet.absoluteFill}
      />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={[styles.center, { paddingTop: insets.top + (compact ? 16 : 0) }, compact && { flex: 0, marginBottom: 18 }]}>
          <Wordmark height={compact ? 30 : 46} color="#fff" />
          {compact ? (
            <Text style={[styles.tag, { fontSize: 22, lineHeight: 26, marginTop: 14 }]}>
              {plain}
              <Text style={[styles.tagEm, { fontSize: 24 }]}>{em}</Text>
            </Text>
          ) : (
            <>
              <View style={{ marginTop: 22, flexDirection: "row", alignItems: "baseline" }}>
                <Text style={[styles.tag, { marginTop: 0 }]}>Найди </Text>
                <Text style={[styles.tag, styles.tagEm, { marginTop: 0 }]}>компанию</Text>
              </View>
              <Text style={[styles.tag, { marginTop: 0 }]}>на сегодня</Text>
            </>
          )}
          {sub && compact ? <Text style={styles.sub}>{sub}</Text> : null}
        </View>

        <View style={[styles.bottom, { paddingBottom: insets.bottom + 14 }]}>
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
  root: { flex: 1, backgroundColor: "#17141F" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 },
  tag: { marginTop: 22, fontSize: 30, lineHeight: 34, ...f("300"), color: "#fff", textAlign: "center", letterSpacing: -1 },
  tagEm: { fontFamily: SERIF, fontSize: 32 },
  sub: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: AUTH.sub, textAlign: "center", marginTop: 8 },
  bottom: { paddingHorizontal: 18, paddingTop: 8 },
  legal: { fontFamily: FONT, textAlign: "center", color: AUTH.muted, fontSize: 11.5, marginTop: 14, lineHeight: 16 },
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
