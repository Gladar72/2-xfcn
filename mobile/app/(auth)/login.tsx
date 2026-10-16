import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import Constants from "expo-constants";
import * as AppleAuthentication from "expo-apple-authentication";
import { Aurora, Btn, Glass, Mosya, Title, Wordmark, type MosyaPose } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { appleLoginAvailable, loginWithApple } from "@/lib/appleLogin";
import { loginWithTelegram } from "@/lib/telegramLogin";
import { colors, FONT } from "@/lib/theme";

// Вход через Apple (app.json → extra.appleLogin). App Store требует его, если есть вход через Telegram.
const APPLE_ENABLED = Platform.OS === "ios" && !!(Constants.expoConfig?.extra as { appleLogin?: boolean } | undefined)?.appleLogin;

/** Слайды на экране входа: что умеет «Место». Листаются сами и пальцем. */
const SLIDES: { pose: MosyaPose; plain: string; em: string; sub: string }[] = [
  { pose: "wave", plain: "Есть куда пойти. ", em: "Найдём, с кем", sub: "Кофе, спорт, кино, настолки — собери компанию за пару минут" },
  { pose: "phone", plain: "Встречи ", em: "рядом", sub: "Видно, кто и что зовёт поблизости — и как далеко идти" },
  { pose: "glasses", plain: "Ты решаешь, ", em: "кого позвать", sub: "Все приходят по заявке, а детали — в общем чате встречи" },
];

function Intro({ compact }: { compact: boolean }) {
  const { width } = useWindowDimensions();
  const w = width - 40;
  const ref = useRef<ScrollView>(null);
  const [i, setI] = useState(0);
  const touched = useRef(false);

  useEffect(() => {
    if (compact) return;
    const t = setInterval(() => {
      if (touched.current) return;
      setI((cur) => {
        const n = (cur + 1) % SLIDES.length;
        ref.current?.scrollTo({ x: n * w, animated: true });
        return n;
      });
    }, 4000);
    return () => clearInterval(t);
  }, [compact, w]);

  function onEnd(e: NativeSyntheticEvent<NativeScrollEvent>) {
    setI(Math.round(e.nativeEvent.contentOffset.x / w));
  }

  // Ввод почты: клавиатура съедает место — оставляем только Мосю и логотип.
  if (compact) {
    return (
      <View style={styles.hero}>
        <Mosya pose="phone" size={130} />
        <Wordmark height={40} />
      </View>
    );
  }

  return (
    <View style={styles.hero}>
      <Wordmark height={40} />
      <ScrollView
        ref={ref}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScrollBeginDrag={() => (touched.current = true)}
        onMomentumScrollEnd={onEnd}
        style={{ width: w, flexGrow: 0 }}
      >
        {SLIDES.map((sl) => (
          <View key={sl.pose} style={[styles.slide, { width: w }]}>
            <Mosya pose={sl.pose} size={180} />
            <Title plain={sl.plain} em={sl.em} size={28} style={styles.slideTitle} />
            <Text style={styles.tagline}>{sl.sub}</Text>
          </View>
        ))}
      </ScrollView>
      <View style={styles.dots}>
        {SLIDES.map((sl, k) => (
          <View key={sl.pose} style={[styles.dot, k === i && styles.dotOn]} />
        ))}
      </View>
    </View>
  );
}

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

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.wrap}>
          <Intro compact={mode === "email"} />

          {mode === "buttons" ? (
            <View style={{ gap: 10 }}>
              <Btn
                kind="tg"
                title="Войти через Telegram"
                icon={<Icon name="tg" color="#fff" size={20} />}
                onPress={telegramLogin}
                loading={loading === "tg"}
              />
              {appleReady ? (
                loading === "apple" ? (
                  <Btn kind="apple" title="" loading />
                ) : (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.CONTINUE}
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    cornerRadius={28}
                    style={styles.apple}
                    onPress={appleLogin}
                  />
                )
              ) : null}
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
  tagline: { fontFamily: FONT, fontSize: 15.5, lineHeight: 21, color: colors.ink2, textAlign: "center", paddingHorizontal: 12 },
  slide: { alignItems: "center", gap: 12 },
  slideTitle: { textAlign: "center" },
  dots: { flexDirection: "row", gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(108,59,255,0.22)" },
  dotOn: { width: 20, backgroundColor: colors.violet },
  apple: { height: 56, width: "100%" },
  hint: { fontFamily: FONT, fontSize: 13, color: colors.grey, textAlign: "center", marginTop: 4, paddingHorizontal: 8 },
  field: { height: 56, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18 },
  input: { flex: 1, fontFamily: FONT, fontSize: 16, color: colors.ink, height: 56 },
  back: { fontFamily: FONT, fontSize: 14, color: colors.violet, textAlign: "center", marginTop: 6, fontWeight: "500" },
  error: { fontFamily: FONT, color: colors.danger, fontSize: 14, textAlign: "center", marginTop: 10 },
  legal: { fontFamily: FONT, textAlign: "center", color: colors.grey, fontSize: 12, marginTop: 14 },
  link: { color: colors.ink2, textDecorationLine: "underline" },
});
