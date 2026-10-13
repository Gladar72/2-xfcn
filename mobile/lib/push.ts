import { useEffect } from "react";
import { Platform } from "react-native";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { router, type Href } from "expo-router";
import { api } from "./api";

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

/** Спрашивает разрешение на уведомления и отправляет Expo Push токен на сервер. */
export async function registerForPush(): Promise<void> {
  await ensureAndroidChannel().catch(() => {});
  if (!Device.isDevice) return;
  let { status } = await Notifications.getPermissionsAsync();
  if (status !== "granted") status = (await Notifications.requestPermissionsAsync()).status;
  if (status !== "granted") return;
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
