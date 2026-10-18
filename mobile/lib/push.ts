import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { api } from "./api";
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
    lightColor: "#6C3BFF",
    sound: "default",
  });
}

/**
 * Android-сборка для RuStore: пуши через RuStore Push (работает в России без Google и VPN).
 * Модуль подключаем лениво — на iPhone и в сборке для Google Play его нет.
 */
let ruStoreListening = false;
async function registerRuStorePush(): Promise<boolean> {
  if (Platform.OS !== "android" || STORE !== "rustore") return false;
  if (!process.env.EXPO_PUBLIC_RUSTORE_PUSH_PROJECT_ID) return false;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require("react-native-rustore-push") as {
      default: {
        checkPushAvailability: () => Promise<boolean>;
        getToken: () => Promise<string>;
        createPushEmitter: () => void;
      };
      eventEmitter: { addListener: (event: string, cb: (payload: unknown) => void) => unknown };
    };
    const client = mod.default;
    if (!(await client.checkPushAvailability())) return false; // нет приложения RuStore на телефоне
    const send = (token: string) =>
      api("/api/me/push-token", { body: { token, platform: "rustore" } }).catch(() => {});
    const token = await client.getToken();
    if (token) await send(token);
    if (!ruStoreListening) {
      ruStoreListening = true;
      client.createPushEmitter();
      // RuStore может выдать новый токен — сразу сообщаем серверу.
      mod.eventEmitter.addListener("ON_NEW_TOKEN", (t) => {
        if (typeof t === "string" && t) void send(t);
      });
    }
    return true;
  } catch {
    return false;
  }
}

/** Спрашивает разрешение на уведомления и отправляет push-токен (RuStore или Expo) на сервер. */
export async function registerForPush(): Promise<void> {
  await ensureAndroidChannel().catch(() => {});
  if (!Device.isDevice) return;
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;
  if (await registerRuStorePush()) return;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  if (!projectId) return; // появится после `eas init`
  const { data: token } = await Notifications.getExpoPushTokenAsync({ projectId });
  await api("/api/me/push-token", { body: { token, platform: Platform.OS } }).catch(() => {});
}

// Один и тот же тап не обрабатываем дважды (getLastNotificationResponseAsync
// может вернуть уже обработанный ответ).
const handled = new Set<string>();

function openFromResponse(response: Notifications.NotificationResponse | null | undefined) {
  if (!response) return;
  const id = response.notification.request.identifier;
  if (handled.has(id)) return;
  handled.add(id);
  const data = response.notification.request.content.data as { url?: unknown; type?: unknown; eventId?: unknown } | undefined;
  let url = typeof data?.url === "string" ? data.url : "/notifications";
  // «Оцени встречу» — сразу на оценку, а не на страницу встречи.
  if (data?.type === "review_request" && typeof data.eventId === "string") url = `/reviews?event=${data.eventId}`;
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
