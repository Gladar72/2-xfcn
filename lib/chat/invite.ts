/** Приглашение на встречу внутри личного чата хранится как служебный текст сообщения. */
const RE = /^\[\[invite:([0-9a-f-]{36})\]\]$/;

export function inviteContent(eventId: string) {
  return `[[invite:${eventId}]]`;
}

export function parseInvite(content: string | null | undefined): string | null {
  const m = content?.trim().match(RE);
  return m?.[1] ?? null;
}

/** Стикер (Мося, иконка интереса) — тоже служебный текст: [[sticker:mosya_wave]]. */
const STICKER_RE = /^\[\[sticker:([a-z0-9_]{1,40})\]\]$/;

export function parseSticker(content: string | null | undefined): string | null {
  const m = content?.trim().match(STICKER_RE);
  return m?.[1] ?? null;
}

/** Короткий текст для списка чатов и уведомлений: приглашение, стикер, фото, удалённое. */
export function previewText(content: string | null | undefined, opts: { deleted?: boolean; hasImage?: boolean } = {}): string {
  if (opts.deleted) return "Сообщение удалено";
  if (parseInvite(content)) return "📅 Приглашение на встречу";
  if (parseSticker(content)) return "Стикер";
  return content || (opts.hasImage ? "📷 Фото" : "📷 Фото");
}
