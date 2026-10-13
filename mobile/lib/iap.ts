import { Platform } from "react-native";
import * as IAP from "expo-iap";
import { api } from "./api";
import type { Plan } from "./subscription";

/**
 * Подписки App Store (только iPhone). Покупку проверяет сервер у Apple
 * (POST /api/subscriptions/apple/verify) — только после этого закрываем транзакцию.
 * appAccountToken = id пользователя: так Apple связывает продления с нашим аккаунтом.
 */
export const APPLE_SKU: Record<Plan, string> = {
  start: "ru.mesto.app.sub.start",
  medium: "ru.mesto.app.sub.medium",
  premium: "ru.mesto.app.sub.premium",
};
const SKUS = Object.values(APPLE_SKU);

export interface VerifyResult {
  active: boolean;
  plan: Plan;
  expiresAt: string | null;
}

let connecting: Promise<unknown> | null = null;
function connect() {
  if (!connecting) connecting = IAP.initConnection().catch((e) => ((connecting = null), Promise.reject(e)));
  return connecting;
}

/** Цены из App Store в валюте пользователя: { start: "299 ₽", … }. */
export async function loadApplePrices(): Promise<Partial<Record<Plan, string>>> {
  if (Platform.OS !== "ios") return {};
  await connect();
  const products = ((await IAP.fetchProducts({ skus: SKUS, type: "subs" })) ?? []) as unknown as {
    id?: string;
    productId?: string;
    displayPrice?: string;
  }[];
  const out: Partial<Record<Plan, string>> = {};
  for (const p of products) {
    const sku = p.id ?? p.productId;
    const plan = (Object.keys(APPLE_SKU) as Plan[]).find((k) => APPLE_SKU[k] === sku);
    if (plan && p.displayPrice) out[plan] = p.displayPrice;
  }
  return out;
}

type ApplePurchase = { id: string; productId: string; transactionId?: string | null };

async function verifyAndFinish(p: ApplePurchase): Promise<VerifyResult> {
  const transactionId = String(p.transactionId ?? p.id);
  const r = await api<VerifyResult>("/api/subscriptions/apple/verify", { body: { transactionId } });
  // Сервер записал покупку — теперь можно закрыть транзакцию в App Store.
  await IAP.finishTransaction({ purchase: p as never, isConsumable: false }).catch(() => {});
  return r;
}

const DEFERRED = "Покупка ждёт подтверждения (например, от владельца семейного доступа) — тариф включится автоматически";

function purchaseError(e: unknown): Error | null {
  const code = String((e as { code?: string }).code ?? "").toLowerCase();
  if (code.includes("cancel")) return null;
  if (code.includes("defer") || code.includes("pending")) return new Error(DEFERRED);
  return new Error("Покупка не прошла — попробуй ещё раз");
}

/** Идёт покупка из экрана тарифов — фоновый обработчик её не трогает. */
let buying = false;

/** Покупка тарифа. null — человек закрыл окно оплаты. */
export async function buyApple(plan: Plan, userId: string): Promise<VerifyResult | null> {
  await connect();
  const sku = APPLE_SKU[plan];
  buying = true;
  try {
    const purchase = await new Promise<ApplePurchase | null>((resolve, reject) => {
      const ok = IAP.purchaseUpdatedListener((p) => {
        if ((p as ApplePurchase).productId !== sku) return;
        done();
        resolve(p as unknown as ApplePurchase);
      });
      const fail = IAP.purchaseErrorListener((e) => {
        done();
        const err = purchaseError(e);
        if (err) reject(err);
        else resolve(null);
      });
      // Окно оплаты могли так и не завершить (отложенная покупка) — не держим кнопку вечно.
      const timer = setTimeout(() => {
        done();
        reject(new Error(DEFERRED));
      }, 5 * 60 * 1000);
      function done() {
        clearTimeout(timer);
        ok.remove();
        fail.remove();
      }
      // Ключ ios — для expo-iap 3.x; apple — для новых версий библиотеки.
      const request = { ios: { sku, appAccountToken: userId }, apple: { sku, appAccountToken: userId } };
      IAP.requestPurchase({ request, type: "subs" } as never).catch((e: unknown) => {
        done();
        const err = purchaseError(e);
        if (err) reject(err);
        else resolve(null);
      });
    });
    return purchase ? await verifyAndFinish(purchase) : null;
  } finally {
    buying = false;
  }
}

/**
 * Фоновый обработчик (запускается после входа): продления и покупки, прерванные
 * на полпути, StoreKit присылает при запуске — отправляем их на сервер и закрываем.
 */
let watcher: { remove: () => void } | null = null;
export function startAppleWatcher(): void {
  if (Platform.OS !== "ios" || watcher) return;
  connect()
    .then(() => {
      if (watcher) return;
      watcher = IAP.purchaseUpdatedListener((p) => {
        const purchase = p as unknown as ApplePurchase;
        if (buying || !SKUS.includes(purchase.productId)) return;
        verifyAndFinish(purchase).catch(() => {});
      });
    })
    .catch(() => {});
}

export function stopAppleWatcher(): void {
  watcher?.remove();
  watcher = null;
}

/** «Восстановить покупки» и дозавершение покупок, прерванных на полпути. */
export async function restoreApple(): Promise<VerifyResult | null> {
  if (Platform.OS !== "ios") return null;
  await connect();
  const list = ((await IAP.getAvailablePurchases()) ?? []) as unknown as ApplePurchase[];
  const ours = list.filter((p) => SKUS.includes(p.productId));
  let best: VerifyResult | null = null;
  let firstError: Error | null = null;
  for (const p of ours) {
    try {
      const r = await verifyAndFinish(p);
      if (r.active || !best) best = r;
    } catch (e) {
      firstError ??= e as Error;
    }
  }
  // Ничего не удалось применить — показываем причину (например, подписка другого профиля).
  if (!best && firstError) throw firstError;
  return best;
}
