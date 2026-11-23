import { heartDestination } from "./hearts";
import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import * as SecureStore from "expo-secure-store";
import { api, getToken } from "./api";
import { API_URL, sessionKey, TICKET_SANDBOX } from "./config";
import { STORE } from "./store";

// Показываем уведомления и когда приложение открыто (баннер сверху + в списке).
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Канал "default" для Android — сервер шлёт push именно в него (channelId: "default"). */
async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "Уведомления",
    importance: Notifications.AndroidImportance.HIGH,
    lightColor: "#17141F",
    sound: "default",
  });
}

/**
 * Android-сборка для RuStore: пуши через RuStore Push (работает в России без Google и VPN).
 * Модуль подключаем лениво — на iPhone и в сборке для Google Play его нет.
 */
const PUSH_KEY = sessionKey("mesto_registered_push");
let queue: Promise<unknown> = Promise.resolve();
let generation = 0;
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => {});
  return next;
}

async function detach(session: string | null, token: string) {
  if (!session) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(API_URL + "/api/me/push-token", {
      method: "DELETE", headers: { Authorization: "Bearer " + session, "Content-Type": "application/json" },
      body: JSON.stringify({ token }), signal: controller.signal,
    });
    if (!res.ok && res.status !== 401) throw new Error("push unregister failed");
  } finally {
    clearTimeout(timer);
  }
}

export function unregisterPush() {
  generation++;
  return serial(async () => {
    const token = await SecureStore.getItemAsync(PUSH_KEY);
    if (token) await detach(await getToken(), token);
    await SecureStore.deleteItemAsync(PUSH_KEY);
  });
}

async function deviceAddress(deviceToken?: Notifications.DevicePushToken) {
  if (Platform.OS === "ios") {
    const result = deviceToken ?? await Notifications.getDevicePushTokenAsync();
    return { token: String(result.data), platform: "apns" };
  }
  if (STORE === "rustore" && process.env.EXPO_PUBLIC_RUSTORE_PUSH_PROJECT_ID) {
    const client = require("react-native-rustore-push").default;
    if (await client.checkPushAvailability()) {
      const token = await client.getToken();
      if (token) return { token: String(token), platform: "rustore" };
    }
  }
  const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID || Constants.easConfig?.projectId ||
    Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return null;
  return { token: (await Notifications.getExpoPushTokenAsync({ projectId, devicePushToken: deviceToken })).data, platform: Platform.OS };
}

export function usePushRegistration(enabled: boolean) {
  useEffect(() => {
    if (TICKET_SANDBOX || !enabled || !Device.isDevice) return;
    let alive = true;
    const gen = generation;
    let running = false;
    let again = false;
    let latest: Notifications.DevicePushToken | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const active = () => alive && generation === gen;
    const sync = async (ask = false) => {
      if (!active()) return;
      if (running) { again = true; return; }
      running = true;
      try {
        await ensureAndroidChannel();
        let permissions = await Notifications.getPermissionsAsync();
        if (permissions.status === "undetermined" && ask) permissions = await Notifications.requestPermissionsAsync();
        const address = permissions.granted ? await deviceAddress(latest) : null;
        await serial(async () => {
          if (!active()) return;
          const old = await SecureStore.getItemAsync(PUSH_KEY);
          if (address) {
            await api("/api/me/push-token", { body: address });
            await SecureStore.setItemAsync(PUSH_KEY, address.token);
          }
          if (old && old !== address?.token) await detach(await getToken(), old);
          if (!address) await SecureStore.deleteItemAsync(PUSH_KEY);
        });
      } catch {
        if (active()) { clearTimeout(timer); timer = setTimeout(() => void sync(), 60000); }
      } finally {
        running = false;
        if (again && active()) { again = false; void sync(); }
      }
    };
    void sync(true);
    const foreground = AppState.addEventListener("change", state => { if (state === "active") void sync(); });
    const changed = Notifications.addPushTokenListener(token => { latest = token; void sync(); });
    let ruSubscription: { remove(): void } | undefined;
    if (Platform.OS === "android" && STORE === "rustore" && process.env.EXPO_PUBLIC_RUSTORE_PUSH_PROJECT_ID) {
      try {
        const ru = require("react-native-rustore-push");
        ru.default.createPushEmitter();
        ruSubscription = ru.eventEmitter.addListener("ON_NEW_TOKEN", () => void sync());
      } catch {}
    }
    return () => { alive = false; clearTimeout(timer); foreground.remove(); changed.remove(); ruSubscription?.remove(); };
  }, [enabled]);
}

// Один и тот же тап не обрабатываем дважды (getLastNotificationResponseAsync
// может вернуть уже обработанный ответ).
const handled = new Set<string>();

function openFromResponse(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const data = response.notification.request.content.data as { url?: unknown; type?: unknown; eventId?: unknown; fromUserId?: unknown } | undefined;
  let url = typeof data?.url === "string" ? data.url : "/notifications";
  // «Оцени встречу» — сразу на оценку, а не на страницу встречи.
  if (data?.type === "review_request" && typeof data.eventId === "string") url = `/reviews?event=${data.eventId}`;
  if (data?.type === "heart" || data?.type === "heart_mutual") url = heartDestination(data.fromUserId, data.url);
  if (!url.startsWith("/")) return;
  // Небольшая пауза — чтобы навигатор успел смонтироваться при холодном старте.
  setTimeout(() => {
    try {
      router.push(url as Href);
    } catch {}
  }, 250);
}

/**
 * Тап по push-уведомлению → переход на экран из data.url
 * ("/event/<id>", "/chat/<id>", "/notifications"…). Включается, когда
 * пользователь вошёл и навигация уже отрисована.
 */
export function useNotificationTaps(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    Notifications.getLastNotificationResponseAsync()
      .then((r) => {
        if (alive) openFromResponse(r);
      })
      .catch(() => {});
    const sub = Notifications.addNotificationResponseReceivedListener((r) => openFromResponse(r));
    return () => {
      alive = false;
      sub.remove();
    };
  }, [enabled]);
}
