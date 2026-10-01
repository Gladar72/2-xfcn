import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { processSubscriptionExpiry } from "@/lib/subscriptions/expiry";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/subscriptions
 *
 * Раз в час (см. vercel.json): продление Премиума партнёрам, напоминание
 * за 3 дня до окончания подписки и выключение просроченных подписок.
 * Логика — lib/subscriptions/expiry.ts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const result = await processSubscriptionExpiry(createAdminClient(), getBot().api);
  return NextResponse.json(result);
}
