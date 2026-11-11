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

/**
 * Можно ли оплатить тариф прямо в этой сборке. На iPhone оплаты пока нет: российскому
 * аккаунту разработчика Apple не открывает соглашение о платных приложениях (а с ним —
 * и подписки App Store, и ссылку на внешнюю оплату). Тариф, оформленный на Android
 * или в Telegram, на iPhone работает; первый месяц «Старт» у всех и так бесплатный.
 * Когда соглашение станет доступно — поставить true для appstore.
 */
export const CAN_PAY: boolean = STORE === "rustore";
