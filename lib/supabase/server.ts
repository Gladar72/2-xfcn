import { createClient } from "@supabase/supabase-js";

/**
 * Клиент, который подставляет наш собственный session-JWT (см. lib/telegram/session.ts)
 * как Bearer-токен. Все запросы через него проходят через RLS как обычный
 * пользователь (auth.uid() = users.id из токена).
 *
 * Использовать в API routes для операций, где мы ХОТИМ, чтобы RLS отработал
 * как дополнительная проверка (например, чтение своего профиля, своих чатов).
 * Для операций, где решение принимает исключительно бизнес-логика backend
 * (проверка лимитов подписки, обработка платежей), используйте
 * lib/supabase/admin.ts.
 */
export function createUserScopedClient(sessionJwt: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Отсутствуют NEXT_PUBLIC_SUPABASE_URL или NEXT_PUBLIC_SUPABASE_ANON_KEY в переменных окружения"
    );
  }

  return createClient(url, anonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${sessionJwt}`,
      },
    },
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
