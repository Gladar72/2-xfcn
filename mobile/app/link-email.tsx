import { useState } from "react";
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Button, ErrorText, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, FONT } from "@/lib/theme";

/**
 * Привязка почты к текущему профилю: после этого в приложение можно входить
 * и по коду из письма, и через Telegram — в один и тот же аккаунт.
 */
export default function LinkEmailScreen() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = email.trim().toLowerCase();
  const insets = useSafeAreaInsets();

  async function sendCode() {
    setError(null);
    setBusy(true);
    try {
      await api("/api/auth/mobile/email/send", { body: { email: clean }, auth: false });
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
      await api("/api/me/email", { body: { email: clean, code } });
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={[styles.wrap, { paddingTop: insets.top + 12 }]}>
      <Aurora />
      <RoundBtn onPress={() => router.back()}>
        <Icon name="back" />
      </RoundBtn>
      <Title plain="Почта " em="для входа" size={30} />
      <Text style={styles.sub}>Привяжи почту — и входи в «Место» по коду из письма в этот же профиль, даже без Telegram.</Text>
      {step === "email" ? (
        <View style={{ gap: 12 }}>
          <Field
            label="Почта"
            value={email}
            onChangeText={setEmail}
            placeholder="you@mail.ru"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Получить код" onPress={sendCode} loading={busy} disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean)} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={styles.sub}>Код отправлен на {clean}. Если письма нет — проверь «Спам».</Text>
          <Field
            label="Код из письма"
            value={code}
            onChangeText={(t) => setCode(t.replace(/\D/g, "").slice(0, 4))}
            keyboardType="number-pad"
            textContentType="oneTimeCode"
            autoFocus
          />
          <ErrorText>{error}</ErrorText>
          <Button title="Привязать почту" onPress={confirm} loading={busy} disabled={code.length !== 4} />
          <Button title="Изменить почту" variant="ghost" onPress={() => { setStep("email"); setCode(""); }} />
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, gap: 16 },
  sub: { fontFamily: FONT, fontSize: 15, color: colors.grey },
});
