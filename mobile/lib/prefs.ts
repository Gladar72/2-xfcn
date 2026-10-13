import * as SecureStore from "expo-secure-store";

/** Личные настройки, которые живут только на телефоне (как localStorage в мини-приложении). */
const ANON_KEY = "mesto_anon_default";

export async function getAnonDefault(): Promise<boolean> {
  try {
    return (await SecureStore.getItemAsync(ANON_KEY)) === "1";
  } catch {
    return false;
  }
}

export async function setAnonDefault(v: boolean): Promise<void> {
  try {
    await SecureStore.setItemAsync(ANON_KEY, v ? "1" : "0");
  } catch {}
}
