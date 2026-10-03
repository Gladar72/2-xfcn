import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, getToken, setToken, setUnauthorizedHandler } from "./api";

/**
 * Состояние входа. После проверки телефона или Telegram сервер отвечает либо
 * сессией (authenticated), либо «пропуском на регистрацию» (ticket) — тогда
 * показываем анкету.
 */
export type AuthResult =
  | { status: "authenticated"; token: string; user: unknown }
  | { status: "needs_registration"; ticket: string; telegramProfile?: { firstName: string | null; photoUrl: string | null } };

interface AuthState {
  ready: boolean;
  signedIn: boolean;
  ticket: string | null;
  prefillName: string | null;
  handleAuthResult: (r: AuthResult) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [ticket, setTicket] = useState<string | null>(null);
  const [prefillName, setPrefillName] = useState<string | null>(null);

  const signOut = useCallback(async () => {
    await setToken(null);
    setTicket(null);
    setSignedIn(false);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => void signOut());
    (async () => {
      const token = await getToken();
      if (token) {
        try {
          await api("/api/me");
          setSignedIn(true);
        } catch (e) {
          // Нет сети — всё равно пускаем внутрь с сохранённой сессией.
          if ((e as { status?: number }).status === 0) setSignedIn(true);
        }
      }
      setReady(true);
    })();
    return () => setUnauthorizedHandler(null);
  }, [signOut]);

  const handleAuthResult = useCallback(async (r: AuthResult) => {
    if (r.status === "authenticated") {
      await setToken(r.token);
      setTicket(null);
      setSignedIn(true);
    } else {
      setTicket(r.ticket);
      setPrefillName(r.telegramProfile?.firstName ?? null);
    }
  }, []);

  const value = useMemo(
    () => ({ ready, signedIn, ticket, prefillName, handleAuthResult, signOut }),
    [ready, signedIn, ticket, prefillName, handleAuthResult, signOut]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth вне AuthProvider");
  return v;
}
