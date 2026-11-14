import { Alert, Linking, Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import * as StoreReview from "expo-store-review";

/**
 * Просьба оценить приложение — в удачный момент и не чаще раза в 3 месяца.
 * iPhone: системное окно App Store (Apple разрешает только его).
 * Android (RuStore): наше окно «Нравится «Место»?» → страница приложения в RuStore.
 */
const K_LAUNCHES = "rv_launches";
const K_FIRST = "rv_first";
const K_LAST = "rv_last";
const K_TIMES = "rv_times";
const RUSTORE_URL = "https://www.rustore.ru/catalog/app/ru.mesto.app";
const DAY = 864e5;

async function num(k: string): Promise<number> {
  try {
    return Number((await SecureStore.getItemAsync(k)) ?? "0") || 0;
  } catch {
    return 0;
  }
}
async function put(k: string, v: number) {
  try {
    await SecureStore.setItemAsync(k, String(v));
  } catch {
    /* хранилище недоступно — просто не спросим */
  }
}

/** Вызывать при запуске приложения. */
export async function noteLaunch() {
  await put(K_LAUNCHES, (await num(K_LAUNCHES)) + 1);
  if (!(await num(K_FIRST))) await put(K_FIRST, Date.now());
}

/**
 * Удачный момент (опубликовал встречу, его приняли на встречу…).
 * Спрашиваем, если человек пользуется приложением хотя бы 2 дня и 4 запуска,
 * прошло 90 дней с прошлой просьбы и спрашивали меньше 3 раз.
 */
export async function maybeAskReview() {
  const now = Date.now();
  const [launches, first, last, times] = await Promise.all([num(K_LAUNCHES), num(K_FIRST), num(K_LAST), num(K_TIMES)]);
  if (launches < 4 || !first || now - first < 2 * DAY) return;
  if (times >= 3 || (last && now - last < 90 * DAY)) return;
  await put(K_LAST, now);
  await put(K_TIMES, times + 1);

  if (Platform.OS === "ios") {
    try {
      if (await StoreReview.isAvailableAsync()) await StoreReview.requestReview();
    } catch {
      /* окно недоступно — ничего страшного */
    }
    return;
  }
  // Небольшая пауза, чтобы окно не перекрывало переход на новый экран.
  setTimeout(() => {
    Alert.alert("Нравится «Место»?", "Поставь оценку в RuStore — это очень помогает нам расти 🧡", [
      { text: "Позже", style: "cancel" },
      { text: "Оценить", onPress: () => Linking.openURL(RUSTORE_URL).catch(() => {}) },
    ]);
  }, 1200);
}
