import { createClient } from "@supabase/supabase-js";

/**
 * Клиент с service_role ключом. ОБХОДИТ RLS ПОЛНОСТЬЮ.
 *
 * Используется ТОЛЬКО в серверном коде (API routes, server actions),
 * никогда не импортируется в клиентские компоненты.
 *
 * Именно этим клиентом backend проверяет лимиты подписки, создаёт
 * пользователей при первом входе, обрабатывает платежи и т.д. —
 * то есть всю бизнес-логику, которая не должна зависеть от RLS.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Отсутствуют NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в переменных окружения"
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
