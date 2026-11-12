import type { createAdminClient } from "@/lib/supabase/admin";

/** Invitations must not bypass blocks, even if their lookup fails. */
export async function invitationBlocked(admin: ReturnType<typeof createAdminClient>, a: string, b: string): Promise<boolean> {
  const { data, error } = await admin.from("blocks").select("blocker_id")
    .or(`and(blocker_id.eq.${a},blocked_id.eq.${b}),and(blocker_id.eq.${b},blocked_id.eq.${a})`).limit(1);
  return !!error || !!data?.length;
}
