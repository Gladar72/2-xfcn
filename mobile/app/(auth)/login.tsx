import { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import { Btn } from "@/components/brand";
import { AUTH, AuthShell, GlassBtn } from "@/components/AuthShell";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { appleLoginAvailable, loginWithApple } from "@/lib/appleLogin";
import { loginWithTelegram } from "@/lib/telegramLogin";
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
      <Btn kind="tg" title="Войти через Telegram" icon={<Icon name="tg" color="#fff" size={20} />} onPress={telegramLogin} loading={loading === "tg"} />
      {appleReady ? (
        loading === "apple" ? (
          <Btn kind="apple" title="" loading />
        ) : (
          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
            cornerRadius={28}
            style={styles.apple}
            onPress={appleLogin}
          />
        )
      ) : null}
      <GlassBtn title="Войти по почте" icon={<Icon name="mail" size={20} color="#fff" />} onPress={() => setMode("email")} />
      {err}
      <Text style={styles.hint}>Уже в «Месте» через Telegram? Входи через Telegram — всё сохранится</Text>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  apple: { height: 56, width: "100%" },
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
