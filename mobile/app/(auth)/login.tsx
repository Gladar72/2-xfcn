import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import Svg, { Path } from "react-native-svg";
import { Btn } from "@/components/brand";
import { AUTH, AuthShell, GlassBtn } from "@/components/AuthShell";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { appleLoginAvailable, loginWithApple } from "@/lib/appleLogin";
import { loginWithTelegram, resumeTelegramLogin } from "@/lib/telegramLogin";
import { colors, FONT, f } from "@/lib/theme";

// Вход через Apple (app.json → extra.appleLogin). App Store требует его, если есть вход через Telegram.
const APPLE_ENABLED = Platform.OS === "ios" && !!(Constants.expoConfig?.extra as { appleLogin?: boolean } | undefined)?.appleLogin;

export default function LoginScreen() {
  const { handleAuthResult } = useAuth();
  const [mode, setMode] = useState<"buttons" | "email">("buttons");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<"email" | "tg" | "apple" | null>(null);
  const [appleReady, setAppleReady] = useState(false);
  useEffect(() => {
    if (APPLE_ENABLED) appleLoginAvailable().then(setAppleReady);
  }, []);
  // Вернулись из Telegram по кнопке бота — экран мог пересоздаться: подхватываем начатый вход.
  useEffect(() => {
    const p = resumeTelegramLogin();
    if (!p) return;
    setLoading("tg");
    p.then((r) => (r ? handleAuthResult(r, "telegram") : undefined))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [error, setError] = useState<string | null>(null);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  async function sendCode() {
    setError(null);
    setLoading("email");
    try {
      const clean = email.trim().toLowerCase();
      await api("/api/auth/mobile/email/send", { body: { email: clean }, auth: false });
      router.push({ pathname: "/(auth)/code", params: { email: clean } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function telegramLogin() {
    setError(null);
    setLoading("tg");
    try {
      const r = await loginWithTelegram();
      if (r) await handleAuthResult(r, "telegram");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  async function appleLogin() {
    setError(null);
    setLoading("apple");
    try {
      const r = await loginWithApple();
      if (r) await handleAuthResult(r.result, "apple", r.firstName);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(null);
    }
  }

  const err = error ? <Text style={styles.error}>{error}</Text> : null;

  if (mode === "email") {
    return (
      <AuthShell compact plain="Вход " em="по почте" sub="Пришлём код из 4 цифр — без паролей">
        <View style={styles.field}>
          <Icon name="mail" size={20} color={colors.grey} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="Твоя почта"
            placeholderTextColor={colors.grey}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            style={styles.input}
            onSubmitEditing={() => emailOk && sendCode()}
          />
        </View>
        <Btn title="Получить код" onPress={sendCode} loading={loading === "email"} disabled={!emailOk} />
        {err}
        <Pressable onPress={() => setMode("buttons")} hitSlop={8}>
          <Text style={styles.back}>Другие способы входа</Text>
        </Pressable>
      </AuthShell>
    );
  }

  return (
    <AuthShell plain={"Есть куда пойти.\n"} em="Найдём, с кем" sub="Встречи рядом, люди, которые идут туда же">
      <Btn kind="w" title="Войти через Telegram" icon={<Icon name="tg" color={colors.tg} size={20} />} onPress={telegramLogin} loading={loading === "tg"} />
      {appleReady ? (
        loading === "apple" ? (
          <Btn kind="apple" title="" loading />
        ) : (
          // Своя кнопка «Войти через Apple» — такого же размера и шрифта, как соседние
          // (Apple разрешает собственный вид кнопки с логотипом Apple).
          <Btn kind="w" title="Войти через Apple" icon={<AppleGlyph />} onPress={appleLogin} />
        )
      ) : null}
      <GlassBtn title="Войти по почте" icon={<Icon name="mail" size={20} color="#fff" />} onPress={() => setMode("email")} />
      {err}
      <Text style={styles.hint}>Уже в «Месте» через Telegram? Входи через Telegram — всё сохранится</Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: FONT, fontSize: 12.5, color: AUTH.muted, textAlign: "center", paddingHorizontal: 8 },
  field: {
    height: 56,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 18,
    backgroundColor: "#fff",
    borderWidth: 0,
  },
  input: { flex: 1, fontFamily: FONT, fontSize: 16, color: colors.ink, height: 56 },
  back: { fontSize: 14, color: AUTH.text, textAlign: "center", marginTop: 4, ...f("500") },
  error: { fontFamily: FONT, color: AUTH.error, fontSize: 14, textAlign: "center" },
});

/** Логотип Apple для кнопки «Войти через Apple». */
function AppleGlyph() {
  return (
    <Svg width={18} height={20} viewBox="0 0 17 20">
      <Path
        fill="#16121F"
        d="M14.06 10.62c-.02-2.2 1.8-3.26 1.88-3.31-1.03-1.5-2.62-1.7-3.18-1.73-1.35-.14-2.65.8-3.33.8-.7 0-1.75-.78-2.88-.76-1.48.02-2.85.86-3.61 2.19-1.54 2.67-.39 6.62 1.11 8.79.73 1.06 1.6 2.25 2.74 2.21 1.1-.05 1.52-.71 2.85-.71 1.33 0 1.7.71 2.86.69 1.18-.02 1.93-1.08 2.65-2.15.84-1.23 1.18-2.42 1.2-2.48-.03-.01-2.3-.88-2.3-3.5zM11.88 4.16c.6-.74 1.01-1.75.9-2.77-.87.04-1.94.59-2.56 1.32-.55.64-1.05 1.69-.92 2.68.98.08 1.97-.49 2.58-1.23z"
      />
    </Svg>
  );
}
