import * as SecureStore from "expo-secure-store";
import { API_URL } from "./config";

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
  cachedToken = await SecureStore.getItemAsync(TOKEN_KEY);
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
  options: { method?: string; body?: unknown; auth?: boolean } = {}
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (options.auth !== false) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method: options.method ?? (options.body !== undefined ? "POST" : "GET"),
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "network", "Нет связи с сервером. Проверь интернет");
  }
  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    if (res.status === 401 && options.auth !== false) onUnauthorized?.();
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
