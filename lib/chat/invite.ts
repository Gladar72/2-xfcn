/** Приглашение на встречу внутри личного чата хранится как служебный текст сообщения. */
const RE = /^\[\[invite:([0-9a-f-]{36})\]\]$/;

export function inviteContent(eventId: string) {
  return `[[invite:${eventId}]]`;
}

export function parseInvite(content: string | null | undefined): string | null {
  const m = content?.trim().match(RE);
  return m?.[1] ?? null;
}
