import { Platform } from "react-native";

/**
 * Из какого магазина установлено приложение — от этого зависит оплата:
 *  appstore   — iPhone, подписка через App Store (покупки внутри приложения);
 *  rustore    — Android из RuStore, оплата картой/СБП через ЮKassa;
 *  googleplay — Android из Google Play: оплаты в приложении нет.
 * Android-сборка для Google Play собирается с EXPO_PUBLIC_STORE=googleplay (eas.json).
 */
export type Store = "appstore" | "rustore" | "googleplay";

export const STORE: Store =
  Platform.OS === "ios" ? "appstore" : process.env.EXPO_PUBLIC_STORE === "googleplay" ? "googleplay" : "rustore";
