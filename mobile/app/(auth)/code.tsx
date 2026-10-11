import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Aurora, Glass, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useAuth, type AuthResult } from "@/lib/auth";
import { colors, FONT } from "@/lib/theme";

export default function CodeScreen() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const { handleAuthResult } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resendIn, setResendIn] = useState(60);
  const input = useRef<TextInput>(null);

  useEffect(() => {
    const t = setInterval(() => setResendIn((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, []);

  async function verify(value: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await api<AuthResult>("/api/auth/mobile/email/verify", { body: { email, code: value }, auth: false });
      await handleAuthResult(r, "email");
    } catch (e) {
      setError((e as Error).message);
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(null);
    try {
      await api("/api/auth/mobile/email/send", { body: { email }, auth: false });
      setResendIn(60);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <SafeAreaView style={styles.wrap}>
        <RoundBtn onPress={() => router.back()}>
          <Icon name="back" />
        </RoundBtn>
        <Title plain="Код из " em="письма" size={30} style={{ marginTop: 24 }} />
        <Text style={styles.sub}>Отправили на {email}. Если письма нет — загляни в «Спам».</Text>

        <Pressable onPress={() => input.current?.focus()} style={styles.boxes}>
          {[0, 1, 2, 3].map((i) => (
            <Glass key={i} strong style={[styles.box, code.length === i && styles.boxActive]}>
              <Text style={styles.digit}>{code[i] ?? ""}</Text>
            </Glass>
          ))}
        </Pressable>
        <TextInput
          ref={input}
          value={code}
          onChangeText={(t) => {
            const v = t.replace(/\D/g, "").slice(0, 4);
            setCode(v);
            if (v.length === 4 && !busy) verify(v);
          }}
          keyboardType="number-pad"
          textContentType="oneTimeCode"
          autoComplete="one-time-code"
          autoFocus
          style={styles.hidden}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        {resendIn > 0 ? (
          <Text style={styles.sub}>Отправить ещё раз через {resendIn} с</Text>
        ) : (
          <Pressable onPress={resend}>
            <Text style={styles.link}>Отправить код ещё раз</Text>
          </Pressable>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingHorizontal: 20, paddingTop: 8, gap: 12 },
  sub: { fontFamily: FONT, fontSize: 15, color: colors.grey },
  boxes: { flexDirection: "row", gap: 12, marginVertical: 18 },
  box: { width: 66, height: 76, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  boxActive: { borderWidth: 2, borderColor: "#9B5CFF" },
  digit: { fontFamily: FONT, fontSize: 32, fontWeight: "500", color: colors.ink },
  hidden: { position: "absolute", opacity: 0, height: 1, width: 1 },
  error: { fontFamily: FONT, color: colors.danger, fontSize: 14 },
  link: { fontFamily: FONT, color: colors.violet, fontWeight: "500", fontSize: 15 },
});
