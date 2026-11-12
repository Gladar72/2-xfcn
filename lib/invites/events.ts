/** Small shared shape for the unified invitation picker. */
export interface InviteEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  photoUrl: string | null;
  category?: { slug: string } | null;
  placeName?: string | null;
  isBusiness?: boolean;
  isMine?: boolean;
  role?: "organizer" | "participant";
  myStatus?: "member" | "pending";
  myApplicationStatus?: string | null;
  status?: string;
}

export function ownsInviteEvent(event: InviteEvent) {
  return event.isMine || event.role === "organizer";
}

export function inviteEventLabel(event: InviteEvent): string {
  if (ownsInviteEvent(event)) return "Твоя встреча";
  if (event.myStatus === "member" || event.myApplicationStatus === "accepted") return "Ты идёшь";
  if (event.myStatus === "pending" || event.myApplicationStatus === "pending") return "Заявка отправлена";
  return event.isBusiness ? "Бизнес-событие" : "Событие города";
}

/** Own/attending meetings first; preserve source order and eliminate duplicates. */
export function invitationEvents(mine: InviteEvent[], city: InviteEvent[]): InviteEvent[] {
  const unique = new Map<string, InviteEvent>();
  for (const event of [...mine, ...city]) {
    if (event.status === "cancelled" || event.status === "completed") continue;
    if (!unique.has(event.id)) unique.set(event.id, event);
  }
  return [...unique.values()].sort((a, b) => priority(a) - priority(b));
}
function priority(event: InviteEvent) {
  return ownsInviteEvent(event) || event.myStatus === "member" || event.myApplicationStatus === "accepted" ? 0 : 1;
}
