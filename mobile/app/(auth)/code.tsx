import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { ErrorText } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth, type AuthResult } from "@/lib/auth";
import { colors, font } from "@/lib/theme";

export default function CodeScreen() {
  const { phone } = useLocalSearchParams<{ phone: string }>();
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
      const r = await api<AuthResult>("/api/auth/mobile/phone/verify", { body: { phone, code: value }, auth: false });
      await handleAuthResult(r);
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
      await api("/api/auth/mobile/phone/send", { body: { phone }, auth: false });
      setResendIn(60);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <SafeAreaView style={styles.wrap}>
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>‹ Назад</Text>
      </Pressable>
      <Text style={styles.title}>Код из SMS</Text>
      <Text style={styles.sub}>Отправили на {phone}</Text>

      <Pressable onPress={() => input.current?.focus()} style={styles.boxes}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.box, code.length === i && styles.boxActive]}>
            <Text style={styles.digit}>{code[i] ?? ""}</Text>
          </View>
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
        autoComplete="sms-otp"
        autoFocus
        style={styles.hidden}
      />
      <ErrorText>{error}</ErrorText>
      {resendIn > 0 ? (
        <Text style={styles.sub}>Отправить ещё раз через {resendIn} с</Text>
      ) : (
        <Pressable onPress={resend}>
          <Text style={styles.link}>Отправить код ещё раз</Text>
        </Pressable>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, padding: 20, gap: 12 },
  back: { color: colors.accent, fontSize: font.base, fontWeight: "600" },
  title: { fontSize: font.display, fontWeight: "800", color: colors.ink900, marginTop: 24 },
  sub: { fontSize: font.sm, color: colors.ink600 },
  boxes: { flexDirection: "row", gap: 12, marginVertical: 16 },
  box: { width: 64, height: 72, borderRadius: 18, backgroundColor: colors.lavender50, borderWidth: 1.5, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  boxActive: { borderColor: colors.accent },
  digit: { fontSize: 30, fontWeight: "800", color: colors.ink900 },
  hidden: { position: "absolute", opacity: 0, height: 1, width: 1 },
  link: { color: colors.accent, fontWeight: "700", fontSize: font.sm },
});
