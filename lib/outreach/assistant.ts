import { InlineKeyboard, type Api } from "grammy";
import type { createAdminClient } from "@/lib/supabase/admin";
import { firstMessageText, reminderText } from "@/lib/outreach/templates";

type Admin = ReturnType<typeof createAdminClient>;

/**
 * Помощник по охвату (пабликам и блогерам Тюмени).
 *
 * Писать с личного аккаунта владельца бот не может и не должен — сообщения
 * отправляет сам владелец. Помощник делает всё остальное, без ноутбука:
 *   • находит, кому писать в Telegram-канале (админ из описания канала);
 *   • каждое утро присылает в бот пачку — по 5 контактов на каждый аккаунт
 *     (Telegram / Instagram / ВК): готовый текст и кнопку, открывающую чат;
 *   • через 2 дня без ответа присылает карточку-напоминание;
 *   • сообщает, если у канала не нашёлся контакт или что-то сломалось.
 */

export const DAILY_PER_PLATFORM = 5;
const REMIND_AFTER_DAYS = 2;
const TYUMEN_OFFSET_HOURS = 5;

export type OutreachStatus = "new" | "queued" | "sent" | "replied" | "deal" | "live" | "no" | "skip" | "no_contact";

export interface OutreachContact {
  id: string;
  name: string;
  platform: "tg" | "ig" | "vk";
  kind: "public" | "blogger";
  prio: "A" | "B" | "C";
  reach: number | null;
  topic: string | null;
  handle: string | null;
  contact: string | null;
  greeting: string | null;
  acts: string | null;
  org_line: string | null;
  status: OutreachStatus;
  queued_at: string | null;
  sent_at: string | null;
  reminder_shown_at: string | null;
  reminded_at: string | null;
  note: string | null;
}

const PLATFORM_LABEL: Record<OutreachContact["platform"], string> = {
  tg: "Telegram",
  ig: "Instagram",
  vk: "ВКонтакте",
};

const STATUS_LABEL: Record<OutreachStatus, string> = {
  new: "в очереди",
  queued: "выдан, ждёт отправки",
  sent: "написали",
  replied: "ответили",
  deal: "договорились",
  live: "пост вышел",
  no: "отказ",
  skip: "пропущен",
  no_contact: "нет контакта",
};

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Начало сегодняшнего дня по Тюмени (UTC+5) — в UTC. */
function tyumenDayStart(now = new Date()): Date {
  const day = 24 * 60 * 60 * 1000;
  const offset = TYUMEN_OFFSET_HOURS * 60 * 60 * 1000;
  return new Date(Math.floor((now.getTime() + offset) / day) * day - offset);
}

function isBotUsername(u: string): boolean {
  return /bot$/i.test(u);
}

/** Ссылка, открывающая чат с тем, кому пишем. withText — с уже вставленным текстом (только Telegram). */
export function chatLink(c: OutreachContact, text?: string): string | null {
  if (c.platform === "tg") {
    if (!c.contact) return null;
    if (/^https?:\/\//.test(c.contact)) return c.contact;
    const u = c.contact.replace(/^@/, "");
    if (text && !isBotUsername(u)) return `https://t.me/${u}?text=${encodeURIComponent(text)}`;
    return `https://t.me/${u}`;
  }
  if (c.platform === "ig") {
    const u = (c.contact ?? c.handle ?? "").replace(/^@/, "");
    return u ? (/^https?:\/\//.test(u) ? u : `https://ig.me/m/${u}`) : null;
  }
  const v = c.contact ?? c.handle;
  if (!v) return null;
  return /^https?:\/\//.test(v) ? v : `https://vk.com/${v.replace(/^@/, "")}`;
}

function whoLine(c: OutreachContact): string {
  if (c.platform === "tg" && c.contact) {
    return /^https?:\/\//.test(c.contact) ? c.contact : `@${c.contact.replace(/^@/, "")}`;
  }
  if (c.platform === "ig") return `@${(c.contact ?? c.handle ?? "").replace(/^@/, "")} в директ`;
  return c.contact ?? (c.handle ? `vk.com/${c.handle}` : "—");
}

// ─── Поиск контакта в описании Telegram-канала ─────────────────────────

/**
 * Открывает публичную страницу t.me/<канал> и ищет в описании, кому писать:
 * сначала @username человека/бота, затем ссылку t.me/... (кроме самого канала).
 */
export async function findChannelContact(handle: string): Promise<string | null> {
  const channel = handle.replace(/^@/, "");
  const res = await fetch(`https://t.me/${channel}`, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; MestoBot/1.0)" },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const html = await res.text();
  // <div class="tgme_page_description" dir="auto">…</div> — после class бывают другие атрибуты.
  const m = html.match(/<div class="tgme_page_description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (!m) return null;
  const desc = m[1] ?? "";

  const mentions = Array.from(desc.replace(/<[^>]+>/g, " ").matchAll(/@([A-Za-z][A-Za-z0-9_]{3,31})/g))
    .map((x) => x[1] ?? "")
    .filter((u) => u && u.toLowerCase() !== channel.toLowerCase());
  if (mentions.length > 0) return mentions[0] ?? null;

  const links = Array.from(desc.matchAll(/href="(https?:\/\/(?:t|telegram)\.me\/[^"]+)"/g))
    .map((x) => x[1] ?? "")
    .filter((l) => {
      const path = l.replace(/^https?:\/\/(?:t|telegram)\.me\//, "").split(/[/?]/)[0] ?? "";
      return path && path.toLowerCase() !== channel.toLowerCase() && path.toLowerCase() !== "boost";
    });
  if (links.length === 0) return null;
  const first = links[0] ?? "";
  const path = first.replace(/^https?:\/\/(?:t|telegram)\.me\//, "");
  // t.me/username → просто username; приглашения (+…, joinchat) — оставляем ссылкой.
  return /^[A-Za-z][A-Za-z0-9_]{3,31}$/.test(path) ? path : first;
}

async function resolveMissingContacts(admin: Admin): Promise<{ found: string[]; missing: OutreachContact[] }> {
  const { data } = await admin
    .from("outreach_contacts")
    .select("*")
    .eq("platform", "tg")
    .eq("status", "new")
    .is("contact", null)
    .not("handle", "is", null)
    .limit(20);
  const found: string[] = [];
  const missing: OutreachContact[] = [];
  for (const c of (data ?? []) as OutreachContact[]) {
    let contact: string | null = null;
    try {
      contact = await findChannelContact(c.handle ?? "");
    } catch {
      contact = null;
    }
    if (contact) {
      await admin.from("outreach_contacts").update({ contact, updated_at: new Date().toISOString() }).eq("id", c.id);
      found.push(`${c.name} → ${contact}`);
    } else {
      await admin.from("outreach_contacts").update({ status: "no_contact", updated_at: new Date().toISOString() }).eq("id", c.id);
      missing.push({ ...c, status: "no_contact" });
    }
  }
  return { found, missing };
}

// ─── Карточки ──────────────────────────────────────────────────────────

function cardKeyboard(c: OutreachContact, stage: "first" | "reminder", text: string): InlineKeyboard {
  const kb = new InlineKeyboard();
  const link = chatLink(c, text);
  if (link) kb.url(c.platform === "tg" ? "✍️ Открыть чат (текст уже вставлен)" : "✍️ Открыть чат", link).row();
  if (stage === "first") {
    kb.text("✅ Отправил", `out:sent:${c.id}`).text("⏭ Пропустить", `out:skip:${c.id}`);
  } else {
    kb.text("✅ Напомнил", `out:rem:${c.id}`).row();
    kb.text("💬 Ответили", `out:rep:${c.id}`).text("❌ Отказ", `out:no:${c.id}`);
  }
  return kb;
}

/** Клавиатура под карточкой после смены статуса. */
export function keyboardAfter(c: Pick<OutreachContact, "id">, status: OutreachStatus): InlineKeyboard | undefined {
  if (status === "sent") {
    return new InlineKeyboard()
      .text("💬 Ответили", `out:rep:${c.id}`)
      .text("🤝 Договорились", `out:deal:${c.id}`)
      .row()
      .text("❌ Отказ", `out:no:${c.id}`);
  }
  if (status === "replied") {
    return new InlineKeyboard().text("🤝 Договорились", `out:deal:${c.id}`).text("❌ Отказ", `out:no:${c.id}`);
  }
  if (status === "deal") return new InlineKeyboard().text("📣 Пост вышел", `out:live:${c.id}`);
  return undefined;
}

async function sendCard(api: Api, chatId: number, c: OutreachContact, stage: "first" | "reminder", n: number): Promise<void> {
  const text = stage === "first" ? firstMessageText(c) : reminderText(c);
  const head =
    `${stage === "first" ? "✉️" : "🔔 Напомнить"} <b>${n}. ${escapeHtml(c.name)}</b> · ${PLATFORM_LABEL[c.platform]}` +
    (c.reach ? ` · ${c.reach.toLocaleString("ru-RU")} подп.` : "") +
    `\nКому: ${escapeHtml(whoLine(c))}` +
    (c.topic ? `\n<i>${escapeHtml(c.topic)}</i>` : "") +
    (c.platform !== "tg" ? "\nТекст ниже — нажми на него, чтобы скопировать." : "");
  const body = `${head}\n\n<pre>${escapeHtml(text)}</pre>`;
  const opts = { parse_mode: "HTML" as const, link_preview_options: { is_disabled: true } };
  try {
    await api.sendMessage(chatId, body, { ...opts, reply_markup: cardKeyboard(c, stage, text) });
  } catch {
    // Слишком длинная ссылка с текстом — шлём кнопку без вставленного текста.
    await api.sendMessage(chatId, body, { ...opts, reply_markup: cardKeyboard(c, stage, "") });
  }
}

// ─── Утренняя пачка ────────────────────────────────────────────────────

export interface OutreachRunResult {
  issued: number;
  reminders: number;
  found: string[];
  missing: string[];
  skippedPlatforms: string[];
}

export async function runOutreach(admin: Admin, api: Api, adminChatId: number, opts: { force?: boolean } = {}): Promise<OutreachRunResult> {
  const now = new Date();
  const dayStart = tyumenDayStart(now);
  const result: OutreachRunResult = { issued: 0, reminders: 0, found: [], missing: [], skippedPlatforms: [] };

  const resolved = await resolveMissingContacts(admin);
  result.found = resolved.found;
  result.missing = resolved.missing.map((c) => c.name);

  const { data: allRows } = await admin.from("outreach_contacts").select("*");
  const all = (allRows ?? []) as OutreachContact[];

  const batches: OutreachContact[] = [];
  for (const platform of ["tg", "ig", "vk"] as const) {
    const rows = all.filter((c) => c.platform === platform);
    const issuedToday = rows.some((c) => c.queued_at && new Date(c.queued_at) >= dayStart);
    if (issuedToday) {
      // Сегодняшняя пачка уже выдана: лимит не превышаем. По команде
      // /outreach просто показываем ещё не отправленные карточки заново.
      if (opts.force) {
        batches.push(...rows.filter((c) => c.status === "queued" && c.queued_at && new Date(c.queued_at) >= dayStart));
      } else {
        result.skippedPlatforms.push(PLATFORM_LABEL[platform]);
      }
      continue;
    }
    // Сначала то, что выдали раньше, но так и не отправили.
    const carry = rows
      .filter((c) => c.status === "queued" && (!c.queued_at || new Date(c.queued_at) < dayStart))
      .slice(0, DAILY_PER_PLATFORM);
    const prioRank = { A: 0, B: 1, C: 2 } as const;
    const fresh = rows
      .filter((c) => c.status === "new" && (platform === "tg" ? !!c.contact : !!(c.contact || c.handle)))
      .sort((a, b) => prioRank[a.prio] - prioRank[b.prio] || (b.reach ?? 0) - (a.reach ?? 0))
      .slice(0, Math.max(0, DAILY_PER_PLATFORM - carry.length));
    batches.push(...carry, ...fresh);
  }

  const reminders = all.filter(
    (c) =>
      c.status === "sent" &&
      !c.reminded_at &&
      c.sent_at &&
      now.getTime() - new Date(c.sent_at).getTime() >= REMIND_AFTER_DAYS * 24 * 60 * 60 * 1000 &&
      (!c.reminder_shown_at || new Date(c.reminder_shown_at) < dayStart)
  );

  const noContact = all.filter((c) => c.status === "no_contact");
  const counts = (s: OutreachStatus[]) => all.filter((c) => s.includes(c.status)).length;

  // Шапка дня.
  const lines = [
    "☀️ <b>Охват на сегодня</b>",
    batches.length
      ? `Написать: <b>${batches.length}</b> (по ${DAILY_PER_PLATFORM} с аккаунта — чтобы не словить спам-блок).`
      : "Новых контактов на сегодня нет.",
    reminders.length ? `Напомнить: <b>${reminders.length}</b> — молчат больше ${REMIND_AFTER_DAYS} дней.` : "",
    `Всего: написали ${counts(["sent", "replied", "deal", "live"])} · ответили ${counts(["replied", "deal", "live"])} · договорились ${counts(["deal", "live"])} · постов вышло ${counts(["live"])} · в очереди ${counts(["new", "queued"])}.`,
    "",
    "Открой чат кнопкой, нажми «Отправить» и вернись сюда — «✅ Отправил».",
  ].filter((l) => l !== "");
  await api.sendMessage(adminChatId, lines.join("\n"), { parse_mode: "HTML" });

  let n = 0;
  for (const c of batches) {
    n++;
    await sendCard(api, adminChatId, c, "first", n);
    // queued_at не сдвигаем, если карточку уже выдавали сегодня.
    const alreadyToday = c.status === "queued" && c.queued_at && new Date(c.queued_at) >= dayStart;
    if (!alreadyToday) {
      await admin
        .from("outreach_contacts")
        .update({ status: "queued", queued_at: now.toISOString(), updated_at: now.toISOString() })
        .eq("id", c.id);
    }
    result.issued++;
  }
  for (const c of reminders) {
    n++;
    await sendCard(api, adminChatId, c, "reminder", n);
    await admin
      .from("outreach_contacts")
      .update({ reminder_shown_at: now.toISOString(), updated_at: now.toISOString() })
      .eq("id", c.id);
    result.reminders++;
  }

  if (noContact.length > 0) {
    const list = noContact
      .slice(0, 15)
      .map((c) => `• ${escapeHtml(c.name)}${c.handle ? ` — t.me/${escapeHtml(c.handle)}` : ""}  <code>/oc ${c.id} @username</code>`)
      .join("\n");
    await api.sendMessage(
      adminChatId,
      "⚠️ <b>Не нашёл, кому писать</b> — в описании канала нет контакта. Открой канал, найди админа и пришли команду (нажми на неё, чтобы скопировать, и подставь username):\n\n" +
        list,
      { parse_mode: "HTML", link_preview_options: { is_disabled: true } }
    );
  }

  return result;
}

// ─── Кнопки под карточками и команды ───────────────────────────────────

const ACTION_STATUS: Record<string, OutreachStatus | "reminded"> = {
  sent: "sent",
  skip: "skip",
  rem: "reminded",
  rep: "replied",
  deal: "deal",
  live: "live",
  no: "no",
};

export async function applyOutreachAction(
  admin: Admin,
  action: string,
  id: string
): Promise<{ ok: boolean; label: string; status?: OutreachStatus }> {
  const target = ACTION_STATUS[action];
  if (!target) return { ok: false, label: "Неизвестное действие" };
  const now = new Date().toISOString();
  if (target === "reminded") {
    const { data } = await admin
      .from("outreach_contacts")
      .update({ reminded_at: now, updated_at: now })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    return data ? { ok: true, label: "🔔 Напомнили", status: "sent" } : { ok: false, label: "Контакт не найден" };
  }
  const patch: Record<string, string> = { status: target, updated_at: now };
  if (target === "sent") patch.sent_at = now;
  const { data } = await admin.from("outreach_contacts").update(patch).eq("id", id).select("id").maybeSingle();
  if (!data) return { ok: false, label: "Контакт не найден" };
  const icon: Partial<Record<OutreachStatus, string>> = {
    sent: "✅",
    skip: "⏭",
    replied: "💬",
    deal: "🤝",
    live: "📣",
    no: "❌",
  };
  return { ok: true, label: `${icon[target] ?? ""} ${STATUS_LABEL[target]}`.trim(), status: target };
}

/** /oc <id> <@username или ссылка> — задать контакт вручную. */
export async function setOutreachContact(admin: Admin, id: string, contact: string): Promise<boolean> {
  const value = contact.trim().replace(/^@/, "");
  const { data: row } = await admin.from("outreach_contacts").select("status").eq("id", id).maybeSingle();
  if (!row) return false;
  const status = row.status === "no_contact" ? "new" : row.status;
  await admin
    .from("outreach_contacts")
    .update({ contact: value, status, updated_at: new Date().toISOString() })
    .eq("id", id);
  return true;
}

export async function outreachStatsText(admin: Admin): Promise<string> {
  const { data } = await admin.from("outreach_contacts").select("name, platform, status");
  const rows = (data ?? []) as Pick<OutreachContact, "name" | "platform" | "status">[];
  const by = (s: OutreachStatus) => rows.filter((r) => r.status === s);
  const section = (title: string, s: OutreachStatus) => {
    const list = by(s);
    return list.length ? `\n<b>${title} (${list.length})</b>\n${list.map((r) => `• ${escapeHtml(r.name)}`).join("\n")}` : "";
  };
  return (
    "📊 <b>Охват — где мы</b>\n" +
    `Всего контактов: ${rows.length} · в очереди: ${by("new").length + by("queued").length}` +
    section("📣 Пост вышел", "live") +
    section("🤝 Договорились", "deal") +
    section("💬 Ответили", "replied") +
    section("✅ Написали, ждём", "sent") +
    section("⚠️ Нет контакта", "no_contact") +
    "\n\nКоманды: /outreach — пачка на сегодня, /oc id @user — указать контакт."
  );
}
