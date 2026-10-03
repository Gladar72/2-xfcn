import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Button, ErrorText, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { loginWithTelegram } from "@/lib/telegramLogin";
import { formatPhoneInput } from "@/lib/format";
import { colors, font } from "@/lib/theme";

export default function LoginScreen() {
  const { handleAuthResult } = useAuth();
  const [phone, setPhone] = useState("+7");
  const [loading, setLoading] = useState<"sms" | "tg" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const digits = phone.replace(/\D/g, "");

  async function sendCode() {
    setError(null);
    setLoading("sms");
    try {
      await api("/api/auth/mobile/phone/send", { body: { phone }, auth: false });
      router.push({ pathname: "/(auth)/code", params: { phone } });
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
    <SafeAreaView style={{ flex: 1 }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
        <View style={styles.hero}>
          <Image source={require("@/assets/mascot.png")} style={{ width: 150, height: 144 }} contentFit="contain" />
          <Text style={styles.logo}>МЕСТО</Text>
          <Text style={styles.tagline}>Есть куда сходить — найдём с кем</Text>
        </View>

        <View style={{ gap: 12 }}>
          <Field
            label="Номер телефона"
            value={phone}
            onChangeText={(t) => setPhone(formatPhoneInput(t))}
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            autoComplete="tel"
            maxLength={16}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Получить код" onPress={sendCode} loading={loading === "sms"} disabled={digits.length !== 11} />
          <Text style={styles.or}>или</Text>
          <Button title="Войти через Telegram" variant="telegram" onPress={telegramLogin} loading={loading === "tg"} />
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              Уже пользуешься «Место» в Telegram? Входи через Telegram — профиль, встречи и чаты сохранятся.
            </Text>
          </View>
          <Text style={styles.legal}>Продолжая, ты принимаешь условия оферты и политику конфиденциальности.</Text>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, justifyContent: "space-between" },
  hero: { alignItems: "center", marginTop: 40, gap: 8 },
  logo: { fontSize: 34, fontWeight: "900", color: colors.accent, letterSpacing: 2 },
  tagline: { fontSize: font.base, color: colors.ink600 },
  or: { textAlign: "center", color: colors.ink400, fontSize: font.sm },
  hint: { backgroundColor: colors.lavender100, borderRadius: 14, padding: 12 },
  hintText: { color: colors.accent, fontSize: font.sm, textAlign: "center", fontWeight: "600" },
  legal: { textAlign: "center", color: colors.ink400, fontSize: font.xs, marginTop: 4 },
});
