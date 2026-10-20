import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { AUTH, AuthShell } from "@/components/AuthShell";
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

  const mm = `${Math.floor(resendIn / 60)}:${String(resendIn % 60).padStart(2, "0")}`;

  return (
    <AuthShell compact plain="Введи " em="код" sub={`Отправили на ${email}. Нет письма — загляни в «Спам».`}>
      <Pressable onPress={() => input.current?.focus()} style={styles.boxes}>
        {[0, 1, 2, 3].map((i) => (
          <View key={i} style={[styles.box, (code.length === i || !!code[i]) && styles.boxActive]}>
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
        autoComplete="one-time-code"
        autoFocus
        style={styles.hidden}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {resendIn > 0 ? (
        <Text style={styles.sub}>Отправить ещё раз через {mm}</Text>
      ) : (
        <Pressable onPress={resend} hitSlop={8}>
          <Text style={styles.link}>Отправить код ещё раз</Text>
        </Pressable>
      )}
      <Pressable onPress={() => router.back()} hitSlop={8}>
        <Text style={styles.link}>Изменить почту</Text>
      </Pressable>
    </AuthShell>
  );
}

const styles = StyleSheet.create({
  boxes: { flexDirection: "row", gap: 10, justifyContent: "center", marginBottom: 4 },
  box: { width: 60, height: 68, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: "#fff", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)" },
  boxActive: { borderWidth: 2.5, borderColor: AUTH.accent },
  digit: { fontFamily: FONT, fontSize: 28, fontWeight: "700", color: colors.ink },
  hidden: { position: "absolute", opacity: 0, height: 1, width: 1 },
  sub: { fontFamily: FONT, fontSize: 13, color: AUTH.muted, textAlign: "center" },
  error: { fontFamily: FONT, color: AUTH.error, fontSize: 14, textAlign: "center" },
  link: { fontFamily: FONT, color: AUTH.text, fontWeight: "500", fontSize: 14, textAlign: "center" },
});
