import type { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export interface ChatAccess {
  /** Пользователь — участник чата. */
  member: boolean;
  blocked: boolean;
  /** Встреча завершена или отменена — чат только для чтения. */
  closed: boolean;
  name: string;
}

/** Единая проверка доступа для действий в чате (правка, удаление, реакции, «печатает»). */
export async function chatAccess(admin: Admin, conversationId: string, userId: string): Promise<ChatAccess> {
  const [{ data: member }, { data: conv }] = await Promise.all([
    admin
      .from("conversation_members")
      .select("id, is_blocked, users(name)")
      .eq("conversation_id", conversationId)
      .eq("user_id", userId)
      .maybeSingle(),
    admin.from("conversations").select("events(status)").eq("id", conversationId).maybeSingle(),
  ]);
  const status = (conv?.events as unknown as { status: string } | null)?.status;
  return {
    member: !!member,
    blocked: !!member?.is_blocked,
    closed: status === "completed" || status === "cancelled",
    name: (member?.users as unknown as { name: string } | null)?.name ?? "",
  };
}
