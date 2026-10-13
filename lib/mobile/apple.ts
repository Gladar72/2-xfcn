import { createPublicKey, type JsonWebKey, type KeyObject } from "node:crypto";
import jwt from "jsonwebtoken";

/**
 * Вход через Apple (Sign in with Apple) в iOS-приложении.
 * Приложение получает от Apple identityToken (JWT, подписан ключом Apple) и шлёт его сюда.
 * Проверяем подпись по открытым ключам Apple, издателя, получателя (bundle id) и nonce.
 * https://developer.apple.com/documentation/sign_in_with_apple/verifying_a_user
 */

const ISSUER = "https://appleid.apple.com";
const KEYS_URL = "https://appleid.apple.com/auth/keys";

export interface AppleIdentity {
  sub: string;
  email: string | null;
  emailVerified: boolean;
  privateEmail: boolean;
}

type AppleJwk = JsonWebKey & { kid: string };
let cache: { at: number; keys: AppleJwk[] } | null = null;

async function appleKeys(force = false): Promise<AppleJwk[]> {
  if (!force && cache && Date.now() - cache.at < 60 * 60 * 1000) return cache.keys;
  const res = await fetch(KEYS_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`apple_keys_${res.status}`);
  const data = (await res.json()) as { keys?: AppleJwk[] };
  cache = { at: Date.now(), keys: data.keys ?? [] };
  return cache.keys;
}

async function keyFor(kid: string): Promise<KeyObject | null> {
  let jwk = (await appleKeys()).find((k) => k.kid === kid);
  // Apple меняет ключи — если нужного нет в кэше, перечитываем один раз.
  if (!jwk) jwk = (await appleKeys(true)).find((k) => k.kid === kid);
  return jwk ? createPublicKey({ key: jwk, format: "jwk" }) : null;
}

function audiences(): string[] {
  const raw = process.env.APPLE_BUNDLE_ID ?? "ru.mesto.app";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const truthy = (v: unknown) => v === true || v === "true";

/** null — токен поддельный, просрочен, выдан другому приложению или nonce не совпал. */
export async function verifyAppleIdentityToken(token: string, nonce: string): Promise<AppleIdentity | null> {
  const decoded = jwt.decode(token, { complete: true });
  const kid = decoded && typeof decoded === "object" ? decoded.header.kid : undefined;
  if (!kid || decoded?.header.alg !== "RS256") return null;
  const key = await keyFor(kid);
  if (!key) return null;
  try {
    const p = jwt.verify(token, key, {
      algorithms: ["RS256"],
      issuer: ISSUER,
      audience: audiences() as [string, ...string[]],
    });
    if (typeof p === "string" || typeof p.sub !== "string" || !p.sub) return null;
    if (!nonce || p.nonce !== nonce) return null;
    const email = typeof p.email === "string" ? p.email.trim().toLowerCase() : null;
    return {
      sub: p.sub,
      email,
      emailVerified: truthy(p.email_verified),
      privateEmail: truthy(p.is_private_email),
    };
  } catch {
    return null;
  }
}
