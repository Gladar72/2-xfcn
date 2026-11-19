import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { Alert, AppState, Linking } from "react-native";
import { api, getToken } from "./api";
import { getMyId } from "./me";

const REFRESH_MS = 10 * 60_000;
const REMINDER_MS = 7 * 24 * 60 * 60_000;
let lastUpdate: { user: string; at: number } | null = null;
let pending: { session: string; work: Promise<boolean> } | null = null;

/** Saving a coarse point is permitted only while the app is in use, in the same signed-in session. */
async function savePosition(session: string): Promise<boolean> {
  const pos = await Location.getLastKnownPositionAsync({ maxAge: REFRESH_MS }).catch(() => null)
    ?? await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
  if (AppState.currentState !== "active" || session !== await getToken()) return false;
  const grid = (n: number) => Math.round(n / 0.005) * 0.005;
  await api("/api/me/location", { body: { lat: grid(pos.coords.latitude), lon: grid(pos.coords.longitude) } });
  lastUpdate = { user: session, at: Date.now() };
  return true;
}

export async function refreshLocationSilently(): Promise<boolean> {
  try {
    if (AppState.currentState !== "active") return false;
    const session = await getToken();
    if (!session || (lastUpdate?.user === session && Date.now() - lastUpdate.at < REFRESH_MS)) return false;
    if (pending?.session === session) return pending.work;
    const work = (async () => {
      const perm = await Location.getForegroundPermissionsAsync();
      return perm.granted ? savePosition(session) : false;
    })().catch(() => false);
    pending = { session, work };
    try { return await work; } finally { if (pending?.work === work) pending = null; }
  } catch { return false; }
}

/** An in-app reminder precedes the OS request. Only an explicit tap requests permission. */
export async function dueLocationReminder(): Promise<string | null> {
  const [user, perm] = await Promise.all([getMyId(), Location.getForegroundPermissionsAsync()]);
  if (!user || perm.status !== "undetermined" || !perm.canAskAgain) return null;
  const key = `location_reminder_${user}`;
  const shown = Number(await SecureStore.getItemAsync(key)) || 0;
  return !shown || Date.now() - shown >= REMINDER_MS ? key : null;
}
export async function markLocationReminder(key: string) {
  await SecureStore.setItemAsync(key, String(Date.now()));
}

export async function shareLocation(): Promise<boolean> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (!current.granted && !current.canAskAgain) {
      Alert.alert("Доступ к геопозиции", "Чтобы показывать расстояние, разреши «Месту» доступ при использовании приложения.", [
        { text: "Не сейчас", style: "cancel" },
        { text: "Настройки", onPress: () => { Linking.openSettings().catch(() => {}); } },
      ]);
      return false;
    }
    const perm = current.granted ? current : await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return false;
    const session = await getToken();
    return session ? await savePosition(session) : false;
  } catch { return false; }
}
