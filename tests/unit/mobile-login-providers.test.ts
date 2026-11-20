import { createPublicKey, generateKeyPairSync } from "node:crypto";
import { NextRequest } from "next/server";
import jwt from "jsonwebtoken";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { POST as verifyEmail } from "@/app/api/auth/mobile/email/verify/route";
import { POST as verifyApple } from "@/app/api/auth/mobile/apple/route";
import { POST as poll } from "@/app/api/auth/mobile/telegram/poll/route";
import { createTelegramAttempt } from "@/lib/mobile/telegram-attempt";
import { hashOtp } from "@/lib/mobile/auth";
import { verifySessionToken } from "@/lib/telegram/session";

const db = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => db }));

const user = { id: "existing-profile", telegram_id: 10, telegram_username: "fixture", moderation_status: "ok" };
function query(data: unknown) {
  const result = { data, error: null };
  const builder = {
    ...result,
    select: () => builder, eq: () => builder, is: () => builder, update: () => builder,
    maybeSingle: async () => result,
  };
  return builder;
}
function request(body: unknown) {
  return new NextRequest("https://example.test/login", { method: "POST", body: JSON.stringify(body) });
}
beforeEach(() => {
  vi.stubEnv("SUPABASE_JWT_SECRET", "login-test-secret");
  db.from.mockReset();
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

test("a valid email code opens the existing profile", async () => {
  const email = "fixture@example.test";
  db.from.mockImplementation(table => table === "email_otps"
    ? query({ code_hash: hashOtp(email, "0123"), attempts: 0, expires_at: new Date(Date.now() + 60000).toISOString() })
    : query(user));
  const res = await verifyEmail(request({ email, code: "0123" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("authenticated");
  expect(verifySessionToken(body.token)?.sub).toBe(user.id);
});

test("a signed Apple identity for the app opens its linked profile", async () => {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const key = createPublicKey(privateKey).export({ format: "jwk" });
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ keys: [{ ...key, kid: "fixture" }] })));
  const identityToken = jwt.sign({ sub: "fixture-apple-user", nonce: "fixture-nonce" }, privateKey, {
    algorithm: "RS256", keyid: "fixture", audience: "ru.mesto.app", issuer: "https://appleid.apple.com", expiresIn: 120,
  });
  db.from.mockImplementation(() => query(user));
  const res = await verifyApple(request({ identityToken, nonce: "fixture-nonce" }));
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body.status).toBe("authenticated");
  expect(verifySessionToken(body.token)?.sub).toBe(user.id);
});

test("after a lost response only the initiating device can recover a confirmed login", async () => {
  const attempt = createTelegramAttempt();
  const row = { telegram_id: 10, username: "fixture", created_at: new Date(), confirmed_at: new Date(), used_at: new Date() };
  db.from.mockImplementation(table => query(table === "mobile_tg_logins" ? row : user));
  const res = await poll(request(attempt));
  expect(verifySessionToken((await res.json()).token)?.sub).toBe(user.id);
  expect((await poll(request({ token: attempt.token }))).status).toBe(403);
  expect((await poll(request({ token: "a".repeat(24) }))).status).toBe(410);
});
