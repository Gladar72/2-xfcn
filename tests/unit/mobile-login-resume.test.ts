import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createTelegramAttempt, matchesDevice } from "@/lib/mobile/telegram-attempt";

const network = {
  call: vi.fn(),
  open: vi.fn(),
  store: new Map<string, string>(),
  listeners: new Set<(state: string) => void>(),
  state: "active",
};
const native = {
  Linking: { openURL: network.open },
  AppState: {
    get currentState() { return network.state; },
    addEventListener: (_: string, cb: (state: string) => void) => {
      network.listeners.add(cb);
      return { remove: () => network.listeners.delete(cb) };
    },
  },
};
const storage = {
  getItemAsync: async (key: string) => network.store.get(key) ?? null,
  setItemAsync: async (key: string, value: string) => { network.store.set(key, value); },
  deleteItemAsync: async (key: string) => { network.store.delete(key); },
};
class NetworkError extends Error { constructor(public status: number) { super("network"); } }
const client = ts.transpileModule(readFileSync("mobile/lib/telegramLogin.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// Новый экземпляр модуля имитирует холодный запуск iOS. Хранилище переживает перезапуск.
function launchClient() {
  const devices: Record<string, unknown> = {
    "react-native": native, "expo-secure-store": storage, "./api": { api: network.call, ApiError: NetworkError },
  };
  const exports = {};
  runInNewContext(client, { exports, require: (name: string) => devices[name], AbortController, Date, setTimeout, clearTimeout });
  return exports as {
    loginWithTelegram(): Promise<unknown>;
    resumeTelegramLogin(): Promise<unknown>;
    cancelTelegramLogin(): Promise<void>;
    finishTelegramLogin(): Promise<void>;
  };
}

const savedKey = "mesto_pending_telegram_login";
const signedIn = { status: "authenticated", token: "fixture-session", user: {} };
beforeEach(() => {
  vi.useFakeTimers();
  network.state = "active";
  network.listeners.clear();
  network.store.clear();
  network.call.mockReset();
  network.open.mockReset();
});
afterEach(() => { vi.useRealTimers(); });

test("the device can recover its confirmed attempt with its original linking context", () => {
  const attempt = createTelegramAttempt("fixture-ticket");
  expect(matchesDevice(attempt.token, attempt.proof, "fixture-ticket")).toBe(true);
  expect(matchesDevice(attempt.token, undefined, "fixture-ticket")).toBe(false);
  expect(matchesDevice(attempt.token, attempt.proof, "other-ticket")).toBe(false);
});

test("switching back to the app wakes the same login, including after a transient network error", async () => {
  const login = launchClient();
  const attempt = createTelegramAttempt();
  network.call.mockResolvedValueOnce({ ...attempt, botUrl: "https://t.me/example" })
    .mockRejectedValueOnce(new NetworkError(0)).mockResolvedValueOnce(signedIn);
  network.open.mockImplementation(async () => { network.state = "background"; });
  const result = login.loginWithTelegram();
  await vi.advanceTimersByTimeAsync(2000);
  expect(network.call).toHaveBeenCalledTimes(1);
  network.state = "active";
  for (const listener of [...network.listeners]) listener("active");
  await vi.advanceTimersByTimeAsync(950);
  expect(await result).toEqual(signedIn);
  expect(network.open).toHaveBeenCalledTimes(1);
  const polls = network.call.mock.calls.slice(1);
  expect(polls.map(([, opts]) => opts.body.proof)).toEqual([attempt.proof, attempt.proof]);
});

test("cold launch resumes the locally saved attempt without reopening Telegram", async () => {
  const attempt = createTelegramAttempt();
  network.store.set(savedKey, JSON.stringify({ ...attempt, expires: Date.now() + 60000 }));
  network.call.mockResolvedValue(signedIn);
  const login = launchClient();
  expect(await login.resumeTelegramLogin()).toEqual(signedIn);
  expect(network.open).not.toHaveBeenCalled();
  expect(network.store.has(savedKey)).toBe(true);
  await login.finishTelegramLogin();
  expect(network.store.has(savedKey)).toBe(false);
});

test("choosing another login method cancels the background attempt", async () => {
  network.state = "background";
  network.store.set(savedKey, JSON.stringify({ ...createTelegramAttempt(), expires: Date.now() + 60000 }));
  const login = launchClient();
  const result = login.resumeTelegramLogin();
  await vi.advanceTimersByTimeAsync(0);
  await login.cancelTelegramLogin();
  expect(await result).toBeNull();
  expect(network.call).not.toHaveBeenCalled();
  expect(network.listeners.size).toBe(0);
});
