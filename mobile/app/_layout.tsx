import { useEffect, useState } from "react";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppState, StyleSheet, Text, View } from "react-native";
import * as Font from "expo-font";
import { AuthProvider, useAuth } from "@/lib/auth";
import { registerForPush, useNotificationTaps } from "@/lib/push";
import { api } from "@/lib/api";
import { applyPendingRef } from "@/lib/referral";
import { Aurora, Grad, Mosya, Wordmark } from "@/components/brand";
import { brand, colors, FONT } from "@/lib/theme";

/** Шрифт Golos Text берём с сайта; если сети нет — через 3 секунды продолжаем на системном. */
function useBrandFont() {
  const [done, setDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDone(true), 3000);
    Font.loadAsync({ [FONT]: brand.font })
      .catch(() => {})
      .finally(() => {
        clearTimeout(t);
        setDone(true);
      });
    return () => clearTimeout(t);
  }, []);
  return done;
}

/** Заставка: Мося, логотип и слоган — как экран загрузки мини-приложения. */
function Splash() {
  return (
    <View style={styles.splash}>
      <Aurora />
      <Mosya pose="wave" size={170} />
      <Wordmark height={48} />
      <Text style={styles.tagline}>Есть куда пойти. Найдём, с кем</Text>
      <View style={styles.track}>
        <Grad style={{ width: "70%", height: "100%", borderRadius: 3 }} />
      </View>
    </View>
  );
}

/** «В сети»: пока приложение открыто, раз в минуту отмечаемся на сервере (/api/me/ping). */
function usePresencePing(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const ping = () => {
      if (AppState.currentState === "active") api("/api/me/ping", { method: "POST" }).catch(() => {});
    };
    ping();
    const t = setInterval(ping, 60_000);
    const sub = AppState.addEventListener("change", (st) => {
      if (st === "active") ping();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [enabled]);
}

function Gate() {
  const { ready, signedIn, ticket } = useAuth();
  const segments = useSegments();
  const fontReady = useBrandFont();

  useEffect(() => {
    if (!ready) return;
    // Ссылка партнёра сама решает, куда вести (сначала сохраняет код).
    if ((segments[0] as string) === "r") return;
    const inAuth = segments[0] === "(auth)";
    if (!signedIn && ticket && segments[1] !== "register") router.replace("/(auth)/register");
    else if (!signedIn && !ticket && !inAuth) router.replace("/(auth)/login");
    else if (signedIn && inAuth) router.replace("/(tabs)");
  }, [ready, signedIn, ticket, segments]);

  useEffect(() => {
    if (!signedIn) return;
    registerForPush().catch(() => {});
    // Открывал ссылку партнёра до входа в существующий аккаунт — применяем код.
    applyPendingRef().catch(() => {});
  }, [signedIn]);

  usePresencePing(ready && signedIn);

  // Тап по push-уведомлению открывает нужный экран (встреча, чат, уведомления).
  useNotificationTaps(ready && fontReady && signedIn);

  if (!ready || !fontReady) return <Splash />;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.milk }, animation: "slide_from_right" }}>
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="event/[id]" />
      <Stack.Screen name="notifications" />
      <Stack.Screen name="applications/[id]" />
      <Stack.Screen name="tickets/[id]" />
      <Stack.Screen name="ticket/[id]" />
      <Stack.Screen name="my-events" />
      <Stack.Screen name="people" options={{ animation: "fade_from_bottom" }} />
      <Stack.Screen name="person/[id]" />
      <Stack.Screen name="profile-edit" />
      <Stack.Screen name="interests" />
      <Stack.Screen name="settings" />
      <Stack.Screen name="reviews" />
      <Stack.Screen name="search" />
      <Stack.Screen name="business" />
      <Stack.Screen name="city/[id]" />
      <Stack.Screen name="privacy" />
      <Stack.Screen name="create" options={{ presentation: "modal", animation: "slide_from_bottom" }} />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <StatusBar style="dark" />
        <Gate />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  tagline: { fontSize: 15, color: colors.ink2 },
  track: { width: 120, height: 5, borderRadius: 3, backgroundColor: "rgba(108,59,255,0.12)", overflow: "hidden", marginTop: 24 },
});
