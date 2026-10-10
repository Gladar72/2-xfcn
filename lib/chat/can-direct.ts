import type { createAdminClient } from "@/lib/supabase/admin";

type SupabaseClient = ReturnType<typeof createAdminClient>;

/**
 * Писать человеку лично можно, только если вы уже пересеклись на встрече:
 * оба в участниках одной встречи (организатор или одобренный участник).
 * Уже начатый личный чат (например, после приглашения) продолжается.
 */
export async function haveSharedEvent(admin: SupabaseClient, a: string, b: string): Promise<boolean> {
  const { data: mine } = await admin.from("event_members").select("event_id").eq("user_id", a).limit(500);
  const ids = (mine ?? []).map((r) => r.event_id as string);
  if (ids.length === 0) return false;
  const { data: both } = await admin.from("event_members").select("event_id").eq("user_id", b).in("event_id", ids).limit(1);
  return (both ?? []).length > 0;
}

export async function findDirectConversation(admin: SupabaseClient, a: string, b: string): Promise<string | null> {
  const { data: mine } = await admin
    .from("conversation_members")
    .select("conversation_id, conversations!inner(event_id)")
    .eq("user_id", a)
    .is("conversations.event_id", null);
  const ids = (mine ?? []).map((m) => m.conversation_id as string);
  if (ids.length === 0) return null;
  const { data: shared } = await admin.from("conversation_members").select("conversation_id").in("conversation_id", ids).eq("user_id", b).limit(1);
  return (shared?.[0]?.conversation_id as string | undefined) ?? null;
}

export async function canDirectMessage(admin: SupabaseClient, a: string, b: string): Promise<boolean> {
  if (await findDirectConversation(admin, a, b)) return true;
  return haveSharedEvent(admin, a, b);
}
