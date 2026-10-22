import { useEffect, useRef, useState } from "react";
import { Stack, router, useSegments } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AppState, StyleSheet, Text, View } from "react-native";
import * as Font from "expo-font";
import { AuthProvider, useAuth } from "@/lib/auth";
import { registerForPush, useNotificationTaps } from "@/lib/push";
import { startAppleWatcher, stopAppleWatcher } from "@/lib/iap";
import { MosyaPeekHost } from "@/components/MosyaPeek";
import { api } from "@/lib/api";
import { applyPendingRef } from "@/lib/referral";
import { LoadingScenes } from "@/components/LoadingScenes";
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

/** Заставка на время загрузки: три сцены с персонажами «Места» (components/LoadingScenes). */
function Splash() {
  return <LoadingScenes />;
}

/** Тестовая сборка для эмулятора держит заставку 8 с, чтобы её успели снять. */
function useSmokeHold() {
  const [hold, setHold] = useState(process.env.EXPO_PUBLIC_MAP_SMOKE === "1");
  useEffect(() => {
    if (!hold) return;
    const t = setTimeout(() => setHold(false), 8000);
    return () => clearTimeout(t);
  }, [hold]);
  return hold;
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
  const smokeHold = useSmokeHold();
  const smokeLogin = useRef(false);
  const [smokePhase, setSmokePhase] = useState<"login" | "map">("login");

  useEffect(() => {
    if (!ready) return;
    // Тестовая сборка для проверки карты на эмуляторе (не для магазина): сразу на карту.
    // Сначала 20 с экран входа (снимок), потом карта.
    if (process.env.EXPO_PUBLIC_MAP_SMOKE === "1") {
      if (smokeHold) return; // навигация — только когда экраны уже на месте
      if (smokePhase === "login") {
        if (segments[0] !== "(auth)") router.replace("/(auth)/login");
        if (!smokeLogin.current) {
          smokeLogin.current = true;
          setTimeout(() => setSmokePhase("map"), 20000);
        }
      } else if ((segments as string[])[1] !== "map") router.replace({ pathname: "/(tabs)/map", params: { business: "only" } });
      return;
    }
    // Ссылка партнёра сама решает, куда вести (сначала сохраняет код).
    if ((segments[0] as string) === "r") return;
    const inAuth = segments[0] === "(auth)";
    if (!signedIn && ticket && (segments as string[])[1] !== "register") router.replace("/(auth)/register");
    else if (!signedIn && !ticket && !inAuth) router.replace("/(auth)/login");
    else if (signedIn && inAuth) router.replace("/(tabs)");
  }, [ready, signedIn, ticket, segments, smokeHold, smokePhase]);

  useEffect(() => {
    if (!signedIn) {
      stopAppleWatcher();
      return;
    }
    registerForPush().catch(() => {});
    // iPhone: продления и прерванные покупки App Store — на сервер и закрыть.
    startAppleWatcher();
    // Открывал ссылку партнёра до входа в существующий аккаунт — применяем код.
    applyPendingRef().catch(() => {});
  }, [signedIn]);

  usePresencePing(ready && signedIn);

  // Тап по push-уведомлению открывает нужный экран (встреча, чат, уведомления).
  useNotificationTaps(ready && fontReady && signedIn);

  if (!ready || !fontReady || smokeHold) return <Splash />;

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
      {/* Один экран тарифов: возврат из оплаты (mesto://subscription?paid=1) не открывает второй поверх. */}
      <Stack.Screen name="subscription" getId={() => "subscription"} />
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
        {/* Мося-гид: подсказки разделов после регистрации (lib/guide.ts). */}
        <MosyaPeekHost />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  tagline: { fontSize: 15, color: colors.ink2 },
  track: { width: 120, height: 5, borderRadius: 3, backgroundColor: "rgba(108,59,255,0.12)", overflow: "hidden", marginTop: 24 },
});
