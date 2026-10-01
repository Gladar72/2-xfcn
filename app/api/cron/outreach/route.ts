import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { escapeHtml, runOutreach } from "@/lib/outreach/assistant";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/outreach
 *
 * Каждое утро (см. vercel.json, ~10:00 по Тюмени): помощник по охвату
 * присылает владельцу в бот пачку — кому сегодня написать и напомнить.
 * Если что-то сломалось — присылает уведомление об ошибке.
 * Логика — lib/outreach/assistant.ts.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const adminId = Number((process.env.ADMIN_TELEGRAM_IDS ?? "").split(",")[0]?.trim());
  if (!adminId) return NextResponse.json({ error: "no_admin" }, { status: 500 });

  const api = getBot().api;
  try {
    const result = await runOutreach(createAdminClient(), api, adminId);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("outreach cron failed:", err);
    await api
      .sendMessage(adminId, `⚠️ Помощник по охвату не смог подготовить пачку на сегодня.\n\n<code>${escapeHtml(message)}</code>\n\nПопробуй команду /outreach — если не поможет, напиши Claude.`, {
        parse_mode: "HTML",
      })
      .catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
