import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";
import { smokeApi, UI_SMOKE } from "./smoke";

/**
 * Клиент к тому же бэкенду, что и мини-приложение в Telegram (Next.js на Vercel).
 * Сессия — тот же JWT, только хранится в защищённом хранилище телефона
 * и уходит в заголовке Authorization: Bearer.
 */
const TOKEN_KEY = "mesto_session";

let cachedToken: string | null | undefined;
let onUnauthorized: (() => void) | null = null;

export async function getToken(): Promise<string | null> {
  if (cachedToken !== undefined) return cachedToken;
  const stored = await SecureStore.getItemAsync(TOKEN_KEY);
  if (cachedToken === undefined) cachedToken = stored;
  return cachedToken;
}

export async function setToken(token: string | null): Promise<void> {
  cachedToken = token;
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public data?: unknown) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  options: { method?: string; body?: unknown; auth?: boolean; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<T> {
  if (UI_SMOKE) return smokeApi(path) as T;
  const headers: Record<string, string> = { Accept: "application/json", "X-App-Platform": Platform.OS };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  const timeout = options.timeoutMs ?? (path.startsWith("/api/auth/mobile/") ? 15000 : undefined);
  const controller = new AbortController();
  const abort = () => controller.abort();
  const timer = timeout === undefined ? undefined : setTimeout(abort, timeout);
  options.signal?.addEventListener("abort", abort);
  if (options.signal?.aborted) abort();
  let res: Response;
  let data: Record<string, unknown> | null;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      signal: controller.signal,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const raw = await res.text();
    try {
      data = raw ? JSON.parse(raw) : null;
    } catch {
      data = null;
    }
  } catch {
    throw new ApiError(0, "network", "Нет связи с сервером. Проверь интернет и попробуй ещё раз.");
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", abort);
  }
  if (res.ok && !data && path.startsWith("/api/auth/mobile/")) {
    throw new ApiError(502, "invalid_response", "Сервис входа временно недоступен. Попробуй ещё раз.");
  }
  if (!res.ok) {
    if (res.status === 401 && headers.Authorization && headers.Authorization === `Bearer ${cachedToken}`) onUnauthorized?.();
    const code = (data?.error as string) ?? `http_${res.status}`;
    const message = (data?.message as string) ?? humanError(code);
    throw new ApiError(res.status, code, message, data);
  }
  return data as T;
}

function humanError(code: string): string {
  switch (code) {
    case "unauthorized":
      return "Нужно войти заново";
    case "too_many_requests":
      return "Слишком много запросов — подожди минуту";
    case "user_banned":
      return "Аккаунт заблокирован";
    default:
      return "Что-то пошло не так. Попробуй ещё раз";
  }
}
