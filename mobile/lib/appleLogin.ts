import * as AppleAuthentication from "expo-apple-authentication";
import { Platform } from "react-native";
import { api } from "./api";
import type { AuthResult } from "./auth";

/**
 * Вход через Apple (только iPhone). Apple показывает своё окно с Face ID,
 * возвращает identityToken — сервер проверяет его подпись.
 * Имя Apple отдаёт только при самом первом входе — подставляем его в анкету.
 * null — если человек закрыл окно.
 */
export async function appleLoginAvailable(): Promise<boolean> {
  if (Platform.OS !== "ios") return false;
  try {
    return await AppleAuthentication.isAvailableAsync();
  } catch {
    return false;
  }
}

function randomNonce(): string {
  const abc = "0123456789abcdefghijklmnopqrstuvwxyz";
  let s = "";
  for (let i = 0; i < 32; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

export async function loginWithApple(): Promise<{ result: AuthResult; firstName: string | null } | null> {
  const nonce = randomNonce();
  let cred: AppleAuthentication.AppleAuthenticationCredential;
  try {
    cred = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.FULL_NAME, AppleAuthentication.AppleAuthenticationScope.EMAIL],
      nonce,
    });
  } catch (e) {
    if ((e as { code?: string }).code === "ERR_REQUEST_CANCELED") return null;
    throw new Error("Не получилось войти через Apple — попробуй ещё раз");
  }
  if (!cred.identityToken) throw new Error("Apple не прислал данные для входа — попробуй ещё раз");
  const result = await api<AuthResult>("/api/auth/mobile/apple", {
    body: { identityToken: cred.identityToken, nonce },
    auth: false,
  });
  return { result, firstName: cred.fullName?.givenName ?? null };
}
