import { Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";

/** Ошибки загрузки фото с сервера → понятный текст. */
export const PHOTO_ERRORS: Record<string, string> = {
  photo_rejected: "Это фото не прошло проверку — выбери другое",
  photo_too_large: "Фото слишком большое — выбери другое",
  photo_invalid: "Не получилось прочитать фото — выбери другое",
  photos_limit: "Можно загрузить до 3 фото",
  network: "Проблема с соединением",
};

/** Фото из галереи → JPEG до 1600 px → data URL (как в мини-приложении). */
export async function pickPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Нужен доступ к фото", "Разреши доступ к галерее в настройках телефона.");
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const resize = (a.width ?? 0) >= (a.height ?? 0) ? { width: Math.min(1600, a.width || 1600) } : { height: Math.min(1600, a.height || 1600) };
  const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}

/** Обложка встречи не заменяет фото организатора — нужно именно фото профиля. */
export function hasOrganizerPhoto(avatarUrl: unknown): avatarUrl is string {
  return typeof avatarUrl === "string" && avatarUrl.trim().length > 0;
}

export const ORGANIZER_PHOTO_MESSAGE =
  "Чтобы создать открытую встречу, добавь своё фото в профиль. Так люди увидят, кто их приглашает.";

/** Фото по ссылке (аватар из Telegram) → JPEG до 1200 px → data URL. null — не получилось. */
export async function photoFromUrl(url: string): Promise<string | null> {
  try {
    const FileSystem = await import("expo-file-system/legacy");
    const dest = `${FileSystem.cacheDirectory}tg-avatar-${Date.now()}.jpg`;
    const dl = await FileSystem.downloadAsync(url, dest);
    if (dl.status !== 200) return null;
    const out = await ImageManipulator.manipulateAsync(dl.uri, [{ resize: { width: 1200 } }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true });
    return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
  } catch {
    return null;
  }
}
