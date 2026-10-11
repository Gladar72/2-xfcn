import { useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Constants from "expo-constants";
import { Aurora, Btn, Glass, Mosya, Wordmark } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { loginWithTelegram } from "@/lib/telegramLogin";
import { colors, FONT } from "@/lib/theme";

// Вход через Apple включится, когда будет готов аккаунт разработчика Apple
// (app.json → extra.appleLogin = true). App Store требует его, если есть вход через Telegram.
const APPLE_ENABLED = Platform.OS === "ios" && !!(Constants.expoConfig?.extra as { appleLogin?: boolean } | undefined)?.appleLogin;

export default function LoginScreen() {
  const { handleAuthResult } = useAuth();
  const [mode, setMode] = useState<"buttons" | "email">("buttons");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState<"email" | "tg" | null>(null);
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

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
          <View style={styles.hero}>
            <Mosya pose="wave" size={190} />
            <Wordmark height={52} />
            <Text style={styles.tagline}>Есть куда пойти. Найдём, с кем</Text>
          </View>

          {mode === "buttons" ? (
            <View style={{ gap: 10 }}>
              <Btn
                kind="tg"
                title="Войти через Telegram"
                icon={<Icon name="tg" color="#fff" size={20} />}
                onPress={telegramLogin}
                loading={loading === "tg"}
              />
              {APPLE_ENABLED ? <Btn kind="apple" title="Продолжить с Apple" onPress={() => setError("Скоро")} /> : null}
              <Btn kind="o" title="Войти по почте" icon={<Icon name="mail" size={20} />} onPress={() => setMode("email")} />
              <Text style={styles.hint}>Уже в «Месте» через Telegram? Входи через Telegram — профиль, встречи и чаты сохранятся.</Text>
            </View>
          ) : (
            <View style={{ gap: 10 }}>
              <Glass strong style={styles.field}>
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
              </Glass>
              <Btn title="Получить код" onPress={sendCode} loading={loading === "email"} disabled={!emailOk} />
              <Pressable onPress={() => setMode("buttons")} hitSlop={8}>
                <Text style={styles.back}>Другие способы входа</Text>
              </Pressable>
            </View>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
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
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, paddingBottom: 10, justifyContent: "space-between" },
  hero: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  tagline: { fontFamily: FONT, fontSize: 16, color: colors.ink2 },
  hint: { fontFamily: FONT, fontSize: 13, color: colors.grey, textAlign: "center", marginTop: 4, paddingHorizontal: 8 },
  field: { height: 56, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18 },
  input: { flex: 1, fontFamily: FONT, fontSize: 16, color: colors.ink, height: 56 },
  back: { fontFamily: FONT, fontSize: 14, color: colors.violet, textAlign: "center", marginTop: 6, fontWeight: "500" },
  error: { fontFamily: FONT, color: colors.danger, fontSize: 14, textAlign: "center", marginTop: 10 },
  legal: { fontFamily: FONT, textAlign: "center", color: colors.grey, fontSize: 12, marginTop: 14 },
  link: { color: colors.ink2, textDecorationLine: "underline" },
});
