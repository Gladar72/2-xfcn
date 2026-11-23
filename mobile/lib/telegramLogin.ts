import { AppState, Linking } from "react-native";
import * as SecureStore from "expo-secure-store";
import { sessionKey } from "./config";
import { api, ApiError } from "./api";
import type { AuthResult } from "./auth";

export type TelegramLoginResult = AuthResult & { phoneLinked?: string | null; phoneError?: string | null };
type Attempt = { token: string; proof?: string; expires: number; phoneTicket?: string | null };
const KEY = sessionKey("mesto_pending_telegram_login");
const TTL = 10 * 60_000;
let running: { controller: AbortController; promise: Promise<TelegramLoginResult | null> } | null = null;
let writes: Promise<void> = Promise.resolve();

function save(value: Attempt | null) {
  const write = writes.then(() => value
    ? SecureStore.setItemAsync(KEY, JSON.stringify(value))
    : SecureStore.deleteItemAsync(KEY));
  writes = write.catch(() => {});
  return write;
}

async function read(): Promise<Attempt | null> {
  await writes;
  const raw = await SecureStore.getItemAsync(KEY);
  if (raw) {
    try {
      const value: Attempt = JSON.parse(raw);
      if (/^[A-Za-z0-9]{16,40}$/.test(value.token) && value.expires > Date.now()) return value;
    } catch { /* Старая или незавершённая запись. */ }
    await save(null);
  }
  return null;
}

function waitForResume(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer);
      change.remove();
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    const change = AppState.addEventListener("change", state => { if (state === "active") finish(); });
    signal.addEventListener("abort", finish);
    if (signal.aborted) finish();
  });
}

async function run(startIfMissing: boolean, phoneTicket: string | null | undefined, signal: AbortSignal) {
  let attempt = await read();
  if (signal.aborted) return null;
  if (startIfMissing && attempt && (attempt.phoneTicket ?? null) !== (phoneTicket ?? null)) attempt = null;
  if (!attempt) {
    if (!startIfMissing) return null;
    const start = await api<{ token: string; proof?: string; botUrl: string }>("/api/auth/mobile/telegram/start", { body: { recoverable: true, phoneTicket: phoneTicket ?? undefined }, auth: false, signal });
    if (signal.aborted) return null;
    attempt = { token: start.token, proof: start.proof, expires: Date.now() + TTL, phoneTicket };
    await save(attempt);
    if (signal.aborted) return null;
    try {
      await Linking.openURL(start.botUrl);
    } catch (error) {
      if (!signal.aborted) await save(null);
      throw error;
    }
    await waitForResume(400, signal);
  }

  let failures = 0;
  while (!signal.aborted && Date.now() < attempt.expires) {
    if (AppState.currentState && AppState.currentState !== "active") {
      await waitForResume(attempt.expires - Date.now(), signal);
      continue;
    }
    try {
      const result = await api<TelegramLoginResult | { status: "pending" }>("/api/auth/mobile/telegram/poll", {
        body: { token: attempt.token, proof: attempt.proof, phoneTicket: attempt.phoneTicket ?? undefined }, auth: false, timeoutMs: 6500, signal,
      });
      if (signal.aborted) return null;
      if (result.status !== "pending") return result;
      failures = 0;
    } catch (error) {
      if (signal.aborted) return null;
      if (!(error instanceof ApiError) || (error.status !== 0 && error.status < 500)) {
        await save(null);
        throw error;
      }
      // В фоне iOS может отменить запрос. При возвращении проверяем тот же вход.
      if (AppState.currentState === "active" && ++failures >= 3) throw error;
    }
    await waitForResume(failures ? 850 : 1000, signal);
  }
  if (signal.aborted) return null;
  await save(null);
  throw new Error("Время подтверждения истекло. Нажми «Войти через Telegram» ещё раз.");
}

function attemptLogin(startIfMissing: boolean, phoneTicket?: string | null) {
  if (running) return running.promise;
  const controller = new AbortController();
  const promise = run(startIfMissing, phoneTicket, controller.signal)
    .catch(error => { if (controller.signal.aborted) return null; throw error; })
    .finally(() => { if (running?.controller === controller) running = null; });
  running = { controller, promise };
  return promise;
}

export function resumeTelegramLogin() {
  return attemptLogin(false);
}

export function finishTelegramLogin() {
  return save(null);
}

export function cancelTelegramLogin() {
  running?.controller.abort();
  running = null;
  return save(null);
}

export function loginWithTelegram(phoneTicket?: string | null) {
  return attemptLogin(true, phoneTicket);
}
