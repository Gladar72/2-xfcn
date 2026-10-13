import jwt from "jsonwebtoken";
import type { Plan } from "@/lib/subscriptions/limits";

/**
 * Подписки через App Store (покупки внутри приложения на iPhone).
 *
 * Источник истины — App Store Server API: по номеру транзакции спрашиваем у Apple
 * её реальное состояние (запрос с нашим ключом по HTTPS — подделать ответ нельзя).
 * Клиенту и телу уведомлений не верим.
 *
 * Ключи (App Store Connect → Users and Access → Integrations → In-App Purchase):
 *   APPLE_IAP_KEY_ID, APPLE_IAP_ISSUER_ID, APPLE_IAP_PRIVATE_KEY (содержимое .p8).
 * APPLE_BUNDLE_ID — bundle id приложения (по умолчанию ru.mesto.app).
 */

/** Товары в App Store Connect (одна группа подписок, три уровня) → тариф. */
export const APPLE_PRODUCTS: Record<string, Plan> = {
  "ru.mesto.app.sub.start": "start",
  "ru.mesto.app.sub.medium": "medium",
  "ru.mesto.app.sub.premium": "premium",
};

/** Доля, которая доходит до нас после комиссии Apple (программа для малого бизнеса — 15%). */
export const APPLE_NET_SHARE = 0.85;

const PROD = "https://api.storekit.itunes.apple.com";
const SANDBOX = "https://api.storekit-sandbox.itunes.apple.com";

export function bundleId(): string {
  return process.env.APPLE_BUNDLE_ID?.split(",")[0]?.trim() || "ru.mesto.app";
}

export function appleIapConfigured(): boolean {
  return !!(process.env.APPLE_IAP_KEY_ID && process.env.APPLE_IAP_ISSUER_ID && process.env.APPLE_IAP_PRIVATE_KEY);
}

function apiToken(): string {
  const keyId = process.env.APPLE_IAP_KEY_ID;
  const issuer = process.env.APPLE_IAP_ISSUER_ID;
  const raw = process.env.APPLE_IAP_PRIVATE_KEY;
  if (!keyId || !issuer || !raw) throw new Error("Отсутствуют APPLE_IAP_KEY_ID / APPLE_IAP_ISSUER_ID / APPLE_IAP_PRIVATE_KEY");
  // В Vercel ключ часто вставляют одной строкой с \n.
  const key = raw.includes("\\n") ? raw.replace(/\\n/g, "\n") : raw;
  return jwt.sign({ bid: bundleId() }, key, {
    algorithm: "ES256",
    keyid: keyId,
    issuer,
    audience: "appstoreconnect-v1",
    expiresIn: 20 * 60,
  });
}

export interface AppleTransaction {
  transactionId: string;
  originalTransactionId: string;
  bundleId: string;
  productId: string;
  purchaseDate: number;
  expiresDate?: number;
  revocationDate?: number;
  appAccountToken?: string;
  environment: "Production" | "Sandbox";
  type?: string;
  /** Цена в тысячных долях валюты (есть в новых версиях API). */
  price?: number;
  currency?: string;
}

/** Payload JWS от Apple. Пришёл по HTTPS от самого Apple — подпись не перепроверяем. */
function decodeJws<T>(jws: string): T {
  const part = jws.split(".")[1];
  if (!part) throw new Error("apple_bad_jws");
  return JSON.parse(Buffer.from(part, "base64url").toString("utf8")) as T;
}

/** Запрос к App Store Server API: сначала боевой сервер, при «не найдено» — песочница (TestFlight). */
async function appleGet<T>(path: string): Promise<T | null> {
  const token = apiToken();
  for (const base of [PROD, SANDBOX]) {
    const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.status === 404) continue;
    if (!res.ok) throw new Error(`apple_api_${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    return (await res.json()) as T;
  }
  return null;
}

export async function getAppleTransaction(transactionId: string): Promise<AppleTransaction | null> {
  if (!/^\d{1,30}$/.test(transactionId)) return null;
  const r = await appleGet<{ signedTransactionInfo: string }>(`/inApps/v1/transactions/${transactionId}`);
  return r ? decodeJws<AppleTransaction>(r.signedTransactionInfo) : null;
}

/** Статусы подписки Apple: 1 — активна, 2 — истекла, 3 — повтор оплаты, 4 — льготный период, 5 — отозвана. */
export interface AppleSubscriptionState {
  status: number;
  transaction: AppleTransaction;
}

/** Самое свежее состояние подписки по originalTransactionId. */
export async function getAppleSubscriptionState(originalTransactionId: string): Promise<AppleSubscriptionState | null> {
  if (!/^\d{1,30}$/.test(originalTransactionId)) return null;
  const r = await appleGet<{
    data?: { lastTransactions?: { status: number; originalTransactionId: string; signedTransactionInfo: string }[] }[];
  }>(`/inApps/v1/subscriptions/${originalTransactionId}`);
  const items = (r?.data ?? []).flatMap((g) => g.lastTransactions ?? []);
  const mine = items.find((t) => t.originalTransactionId === originalTransactionId) ?? items[0];
  if (!mine) return null;
  return { status: mine.status, transaction: decodeJws<AppleTransaction>(mine.signedTransactionInfo) };
}

/** Уведомление App Store Server Notifications V2: достаём тип и originalTransactionId (дальше — перепроверка через API). */
export function readAppleNotification(signedPayload: string): {
  type: string;
  subtype?: string;
  originalTransactionId: string | null;
  transactionId: string | null;
} {
  const p = decodeJws<{ notificationType: string; subtype?: string; data?: { signedTransactionInfo?: string } }>(signedPayload);
  const t = p.data?.signedTransactionInfo ? decodeJws<AppleTransaction>(p.data.signedTransactionInfo) : null;
  return {
    type: p.notificationType,
    subtype: p.subtype,
    originalTransactionId: t?.originalTransactionId ?? null,
    transactionId: t?.transactionId ?? null,
  };
}
