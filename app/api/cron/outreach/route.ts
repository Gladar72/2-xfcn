import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getBot } from "@/lib/telegram/bot";
import { escapeHtml } from "@/lib/outreach/assistant";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * GET /api/cron/outreach
 *
 * Каждое утро (см. vercel.json, ~10:00 по Тюмени): присылает владельцу
 * разовые напоминания (admin_reminders). Ежедневная пачка охвата отключена.
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
    const admin = createAdminClient();
    // Разовые напоминания владельцу (таблица admin_reminders) — до пачки охвата.
    const { data: due } = await admin
      .from("admin_reminders")
      .select("id, text")
      .is("sent_at", null)
      .lte("send_at", new Date().toISOString());
    for (const r of due ?? []) {
      await api.sendMessage(adminId, `⏰ Напоминание\n\n${r.text}`).catch((err) => console.error("admin reminder failed:", err));
      await admin.from("admin_reminders").update({ sent_at: new Date().toISOString() }).eq("id", r.id);
    }
    // Ежедневная пачка «кому написать про рекламу» ОТКЛЮЧЕНА по просьбе
    // владельца — с пабликами и блогерами он общается сам. Вручную её
    // по-прежнему можно получить командой /outreach.
    return NextResponse.json({ reminders: (due ?? []).length, outreach: "disabled" });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("outreach cron failed:", err);
    await api
      .sendMessage(adminId, `⚠️ Не получилось отправить утренние напоминания.\n\n<code>${escapeHtml(message)}</code>\n\nПопробуй команду /outreach — если не поможет, напиши Claude.`, {
        parse_mode: "HTML",
      })
      .catch(() => {});
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
