/**
 * Рассылка событий чата через Supabase Realtime Broadcast (серверная сторона).
 *
 * Вместо postgres_changes (Realtime сам читает WAL и проверяет RLS для
 * каждого подписчика на каждую вставку — это главный потолок при тысячах
 * онлайн) сервер после сохранения сообщения сам отправляет его в приватный
 * канал "conversation:<id>". Слушать канал могут только участники диалога —
 * см. политику chat_members_receive_broadcast (миграция 0033).
 *
 * Ошибка рассылки не ломает отправку: сообщение уже сохранено в базе и
 * появится у собеседника при следующем открытии чата.
 */
export async function broadcastToConversation(
  conversationId: string,
  event: "message" | "read",
  payload: Record<string, unknown>
): Promise<void> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) return;

  try {
    const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({
        messages: [{ topic: `conversation:${conversationId}`, event, payload, private: true }],
      }),
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) console.error("[broadcast] failed", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.error("[broadcast] error", err);
  }
}
