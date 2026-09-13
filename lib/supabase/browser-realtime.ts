"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Клиент только для браузера — используется в чате для подписки на
 * Supabase Realtime. Работает от имени текущего пользователя (через RLS),
 * НИКОГДА не использует service_role.
 */
export function createBrowserRealtimeClient(sessionJwt: string): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const client = createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${sessionJwt}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Без этого Realtime не пройдёт через RLS — WebSocket авторизуется отдельно от обычных HTTP-запросов.
  client.realtime.setAuth(sessionJwt);

  return client;
}
