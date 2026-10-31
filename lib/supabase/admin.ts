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
export function createAdminClient(options: { noStore?: boolean } = {}) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Отсутствуют NEXT_PUBLIC_SUPABASE_URL или SUPABASE_SERVICE_ROLE_KEY в переменных окружения"
    );
  }

  return createClient(url, serviceRoleKey, {
    // Notification delivery decisions must use current database state. A
    // force-dynamic route alone did not prevent Supabase reads from entering
    // Next's persistent fetch cache in production.
    ...(options.noStore ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) } } : {}),
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
