import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { Stack, router } from "expo-router";
import { Button, ErrorText, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { formatPhoneInput } from "@/lib/format";
import { colors, font } from "@/lib/theme";

/**
 * Привязка номера к текущему профилю: после этого в приложение можно входить
 * и по SMS, и через Telegram — в один и тот же аккаунт.
 */
export default function LinkPhoneScreen() {
  const [phone, setPhone] = useState("+7");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      await api("/api/auth/mobile/phone/send", { body: { phone }, auth: false });
      setStep("code");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setError(null);
    setBusy(true);
    try {
      await api("/api/me/phone", { body: { phone, code } });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
      <Stack.Screen options={{ headerShown: true, title: "Номер телефона", headerBackTitle: "Профиль", headerTintColor: colors.accent }} />
      <Text style={styles.sub}>
        Привяжи номер — и входи в «Место» по SMS-коду в этот же профиль, даже без Telegram.
      </Text>
      {step === "phone" ? (
        <View style={{ gap: 12 }}>
          <Field label="Номер телефона" value={phone} onChangeText={(t) => setPhone(formatPhoneInput(t))} keyboardType="phone-pad" maxLength={16} />
          <ErrorText>{error}</ErrorText>
          <Button title="Получить код" onPress={sendCode} loading={busy} disabled={phone.replace(/\D/g, "").length !== 11} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={styles.sub}>Код отправлен на {phone}</Text>
          <Field
            label="Код из SMS"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoComplete="sms-otp"
            autoFocus
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Привязать номер" onPress={confirm} loading={busy} disabled={code.length !== 4} />
          <Button title="Изменить номер" variant="ghost" onPress={() => { setStep("phone"); setCode(""); }} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, gap: 16, backgroundColor: colors.background },
  sub: { fontSize: font.sm, color: colors.ink600 },
});
