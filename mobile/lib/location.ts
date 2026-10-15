import * as Location from "expo-location";
import { api } from "./api";

/**
 * Примерная геопозиция для «Люди рядом» и «встречи рядом». На сервер уходит точка,
 * которую он сразу огрубляет до сетки ~500 м (/api/me/location) — точный адрес нигде не хранится.
 */
let sentAt = 0;
const EVERY_MS = 10 * 60e3;

async function send(): Promise<boolean> {
  const pos =
    (await Location.getLastKnownPositionAsync({ maxAge: 10 * 60e3 }).catch(() => null)) ??
    (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  await api("/api/me/location", { body: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
  sentAt = Date.now();
  return true;
}

/** Тихо обновить точку: только если разрешение уже дано и прошло больше 10 минут. true — точка обновилась. */
export async function refreshLocationSilently(): Promise<boolean> {
  if (Date.now() - sentAt < EVERY_MS) return false;
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return false;
    return await send();
  } catch {
    return false;
  }
}

/** По нажатию «Показать, кто рядом»: спросить разрешение (если нужно) и отправить точку. */
export async function shareLocation(): Promise<boolean> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (perm.status !== "granted") return false;
    return await send();
  } catch {
    return false;
  }
}
