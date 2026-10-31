import type { ChatListItemData } from "@/components/chat/ChatListItem";

// A short-lived UI snapshot only. The list always revalidates with the server.
// No disk/localStorage: login and logout perform full navigation and discard it.
type ChatTab = "ev" | "pm" | "ar";
let snapshot: { items: ChatListItemData[]; tab: ChatTab; at: number } | null = null;
const MAX_AGE = 5 * 60_000;

export function readChatList() {
  return snapshot && Date.now() - snapshot.at < MAX_AGE ? snapshot : null;
}
export function rememberChatList(items: ChatListItemData[], tab: ChatTab) {
  snapshot = { items, tab, at: Date.now() };
}
export function clearChatList() { snapshot = null; }
export function markCachedChatRead(id: string) {
  if (!snapshot) return;
  snapshot.items = snapshot.items.map((item) => item.conversationId === id ? { ...item, unreadCount: 0 } : item);
}
