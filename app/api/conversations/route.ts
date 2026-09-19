import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * GET /api/conversations
 * Список чатов текущего пользователя (кроме скрытых), с превью последнего
 * сообщения, unread count и данными собеседника (п.15 ТЗ).
 */
export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const admin = createAdminClient();

  const { data: memberships, error } = await admin
    .from("conversation_members")
    .select(
      `
      conversation_id, unread_count, is_hidden, is_blocked, is_favorite,
      conversations(id, event_id, events(title, status, is_business, category:categories(slug, name, emoji)))
      `
    )
    .eq("user_id", currentUser.userId)
    .eq("is_hidden", false)
    .order("conversation_id", { ascending: false });

  if (error) return NextResponse.json({ error: "fetch_failed" }, { status: 500 });

  const conversationIds = (memberships ?? []).map((m) => m.conversation_id);
  if (conversationIds.length === 0) return NextResponse.json({ items: [] });

  const [{ data: otherMembers }, { data: lastMessages }] = await Promise.all([
    admin
      .from("conversation_members")
      .select("conversation_id, last_read_at, users(id, name, avatar_url)")
      .in("conversation_id", conversationIds)
      .neq("user_id", currentUser.userId),
    admin
      .from("messages")
      .select("conversation_id, content, created_at, sender_id")
      .in("conversation_id", conversationIds)
      .order("created_at", { ascending: false }),
  ]);

  const otherMembersByConversation = new Map<
    string,
    { id: string; name: string; avatarUrl: string | null; lastReadAt: string | null }[]
  >();
  for (const m of otherMembers ?? []) {
    const user = m.users as unknown as { id: string; name: string; avatar_url: string | null } | null;
    if (!user) continue;
    const list = otherMembersByConversation.get(m.conversation_id) ?? [];
    list.push({ id: user.id, name: user.name, avatarUrl: user.avatar_url, lastReadAt: m.last_read_at as string | null });
    otherMembersByConversation.set(m.conversation_id, list);
  }

  const lastMessageByConversation = new Map<
    string,
    { content: string; createdAt: string; isMine: boolean }
  >();
  for (const msg of lastMessages ?? []) {
    if (!lastMessageByConversation.has(msg.conversation_id)) {
      lastMessageByConversation.set(msg.conversation_id, {
        content: msg.content,
        createdAt: msg.created_at,
        isMine: msg.sender_id === currentUser.userId,
      });
    }
  }

  const items = (memberships ?? []).map((m) => {
    const conversation = m.conversations as unknown as {
      id: string;
      event_id: string | null;
      events: {
        title: string;
        status: string;
        is_business: boolean;
        category: { slug: string; name: string; emoji: string | null } | null;
      } | null;
    } | null;
    const otherMembersList = otherMembersByConversation.get(m.conversation_id) ?? [];
    const lastMessage = lastMessageByConversation.get(m.conversation_id) ?? null;
    // "Прочитано" (двойная зелёная галочка в списке чатов, как в MessageBubble
    // внутри самого чата) имеет смысл только для СВОИХ последних сообщений —
    // для входящих у нас и так есть индикатор непрочитанного (unreadCount).
    // В групповом чате считаем прочитанным только когда ВСЕ остальные
    // участники увидели сообщение.
    const isLastMessageRead =
      !!lastMessage?.isMine &&
      otherMembersList.length > 0 &&
      otherMembersList.every((om) => om.lastReadAt && lastMessage.createdAt <= om.lastReadAt);

    return {
      conversationId: m.conversation_id,
      unreadCount: m.unread_count,
      isBlocked: m.is_blocked,
      isFavorite: m.is_favorite,
      eventTitle: conversation?.events?.title ?? null,
      eventStatus: conversation?.events?.status ?? null,
      category: conversation?.events?.category ?? null,
      isBusiness: conversation?.events?.is_business ?? false,
      // otherUser — для отображения аватара в списке: если участник один
      // (как раньше), показываем его фото; если несколько — компонент сам
      // решает показать иконку группы (см. otherMembersCount).
      otherUser: otherMembersList[0] ?? null,
      otherMembersCount: otherMembersList.length,
      lastMessage,
      isLastMessageRead,
    };
  });

  // Свежие сообщения — выше в списке
  items.sort((a, b) => {
    const aTime = a.lastMessage?.createdAt ?? "";
    const bTime = b.lastMessage?.createdAt ?? "";
    return bTime.localeCompare(aTime);
  });

  return NextResponse.json({ items });
}
