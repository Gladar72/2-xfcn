import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/** POST /api/me/push-token { token, platform } — мобильное приложение регистрирует Expo Push токен. */
export async function POST(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  if (!/^Expo(nent)?PushToken\[[^\]]+\]$/.test(token)) {
    return NextResponse.json({ error: "invalid_token" }, { status: 422 });
  }
  const platform = body?.platform === "ios" || body?.platform === "android" ? body.platform : null;
  await createAdminClient()
    .from("push_tokens")
    .upsert({ token, user_id: user.userId, platform, updated_at: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}
