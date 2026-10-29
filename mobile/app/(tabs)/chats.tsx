import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Avatar } from "@/components/ui";
import { Aurora, Glass, Grad, Mosya, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { isOnline, ms } from "@/components/chat/types";
import { api } from "@/lib/api";
import { animateNext, tapLight } from "@/lib/feedback";
import { plural } from "@/lib/format";
import { colors, FONT, f } from "@/lib/theme";
import { useGuide } from "@/lib/guide";

interface ChatItem {
  conversationId: string;
  unreadCount: number;
  eventId: string | null;
  eventTitle: string | null;
  eventStatus: string | null;
  eventPhotoUrl: string | null;
  otherUser: { id: string; name: string; avatarUrl: string | null; lastActiveAt?: string | null } | null;
  otherMembersCount: number;
  lastMessage: { content: string; createdAt: string; isMine: boolean; senderName: string | null } | null;
  isLastMessageRead?: boolean;
  isLastMessagePartlyRead?: boolean;
}

type Tab = "events" | "direct" | "archive";
const TABS: { key: Tab; label: string }[] = [
  { key: "events", label: "Встречи" },
  { key: "direct", label: "Личные" },
  { key: "archive", label: "Архив" },
];

const closed = (c: ChatItem) => c.eventStatus === "completed" || c.eventStatus === "cancelled";
const tabOf = (c: ChatItem): Tab => (closed(c) ? "archive" : c.eventId ? "events" : "direct");

/** Время в списке: сегодня — 14:05, вчера — «Вчера», на этой неделе — день, иначе 12.10. */
function when(iso?: string) {
  if (!iso) return "";
  const d = new Date(ms(iso));
  const now = new Date();
  if (now.toDateString() === d.toDateString()) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (y.toDateString() === d.toDateString()) return "Вчера";
  if (now.getTime() - d.getTime() < 6 * 86400_000) return ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"][d.getDay()]!;
  return `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function Ticks({ item }: { item: ChatItem }) {
  if (!item.lastMessage?.isMine) return null;
  const dbl = item.isLastMessageRead || item.isLastMessagePartlyRead;
  return (
    <View style={{ flexDirection: "row", marginRight: 3, opacity: item.isLastMessageRead ? 1 : 0.6 }}>
      <Icon name="check" size={13} color={dbl ? colors.violet : colors.grey} strokeWidth={2.4} />
      {dbl ? (
        <View style={{ marginLeft: -7 }}>
          <Icon name="check" size={13} color={colors.violet} strokeWidth={2.4} />
        </View>
      ) : null}
    </View>
  );
}

export default function ChatsScreen() {
  useGuide("chats");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [tab, setTab] = useState<Tab>("events");
  const tabInited = useRef(false);
  const focused = useRef(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: ChatItem[] }>("/api/conversations");
      setItems(r.items);
      // Первая загрузка: открываем вкладку, где есть непрочитанное (или хоть что-то).
      if (!tabInited.current) {
        tabInited.current = true;
        const first = TABS.find((t) => r.items.some((c) => tabOf(c) === t.key && c.unreadCount > 0)) ?? TABS.find((t) => r.items.some((c) => tabOf(c) === t.key));
        if (first) setTab(first.key);
      }
    } catch {}
    setLoaded(true);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      load();
      return () => {
        focused.current = false;
      };
    }, [load])
  );

  // Пока список открыт — обновляем раз в 15 секунд (новые сообщения, «в сети»).
  useEffect(() => {
    const t = setInterval(() => {
      if (focused.current && AppState.currentState === "active") load();
    }, 15000);
    return () => clearInterval(t);
  }, [load]);

  const counts = useMemo(() => {
    const c: Record<Tab, number> = { events: 0, direct: 0, archive: 0 };
    for (const it of items) c[tabOf(it)] += it.unreadCount > 0 ? 1 : 0;
    return c;
  }, [items]);
  const shown = useMemo(() => items.filter((c) => tabOf(c) === tab), [items, tab]);

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <FlatList
        data={shown}
        keyExtractor={(c) => c.conversationId}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: insets.bottom + 120, gap: 10 }}
        ListHeaderComponent={
          <View>
            <Title plain="Твои " em="чаты" size={30} style={{ marginBottom: 12, marginLeft: 4 }} />
            <Glass strong style={styles.tabs}>
              {TABS.map((t) => {
                const on = t.key === tab;
                return (
                  <Pressable
                    key={t.key}
                    style={styles.tabBtn}
                    onPress={() => {
                      if (on) return;
                      tapLight();
                      animateNext();
                      setTab(t.key);
                    }}
                  >
                    {on ? <Grad style={StyleSheet.absoluteFill} /> : null}
                    <Text style={[styles.tabText, on && { color: "#fff" }]}>{t.label}</Text>
                    {counts[t.key] > 0 ? (
                      <View style={[styles.tabDot, on && { backgroundColor: "#fff" }]}>
                        <Text style={[styles.tabDotText, on && { color: colors.violet }]}>{counts[t.key]}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </Glass>
          </View>
        }
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.violet}
          />
        }
        renderItem={({ item }) => {
          const group = !!item.eventId;
          const online = !group && isOnline(item.otherUser?.lastActiveAt);
          const unread = item.unreadCount > 0;
          return (
            <Pressable onPress={() => router.push(`/chat/${item.conversationId}`)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <Glass strong style={[styles.row, closed(item) && { opacity: 0.8 }]}>
                <View>
                  {group ? (
                    item.eventPhotoUrl ? (
                      <Image source={{ uri: item.eventPhotoUrl }} style={styles.avatar} />
                    ) : (
                      <Grad style={[styles.avatar, { alignItems: "center", justifyContent: "center" }]}>
                        <Icon name="people" size={24} color="#fff" />
                      </Grad>
                    )
                  ) : (
                    <Avatar uri={item.otherUser?.avatarUrl} name={item.otherUser?.name} size={54} />
                  )}
                  {online ? <View style={styles.onlineDot} /> : null}
                </View>
                <View style={{ flex: 1, gap: 3 }}>
                  <View style={styles.between}>
                    <Text style={styles.name} numberOfLines={1}>
                      {item.eventTitle ?? item.otherUser?.name ?? "Чат"}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Ticks item={item} />
                      <Text style={[styles.time, unread && { color: colors.violet }]}>{when(item.lastMessage?.createdAt)}</Text>
                    </View>
                  </View>
                  <View style={styles.between}>
                    <Text style={[styles.last, unread && { color: colors.ink2 }]} numberOfLines={1}>
                      {item.lastMessage
                        ? `${item.lastMessage.isMine ? "Ты: " : group && item.lastMessage.senderName ? `${item.lastMessage.senderName}: ` : ""}${item.lastMessage.content}`
                        : group
                          ? `${item.otherMembersCount + 1} ${plural(item.otherMembersCount + 1, "участник", "участника", "участников")} · поздоровайся первым`
                          : "Нет сообщений"}
                    </Text>
                    {unread ? (
                      <Grad style={styles.badge}>
                        <Text style={styles.badgeText}>{item.unreadCount > 99 ? "99+" : item.unreadCount}</Text>
                      </Grad>
                    ) : null}
                  </View>
                </View>
              </Glass>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Mosya pose={tab === "archive" ? "sit" : "phone"} size={150} />
              <Text style={styles.emptyTitle}>{tab === "archive" ? "Архив пуст" : "Пока тихо"}</Text>
              <Text style={styles.emptyText}>
                {tab === "events"
                  ? "Чат встречи появится, когда тебя примут на встречу или ты создашь свою"
                  : tab === "direct"
                    ? "Личные чаты появятся, когда ты напишешь человеку или он тебе"
                    : "Здесь будут чаты прошедших встреч — их можно перечитать"}
              </Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", borderRadius: 22, padding: 4, marginBottom: 6 },
  tabBtn: { flex: 1, height: 38, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 },
  tabText: { fontSize: 14.5, ...f("600"), color: colors.ink2 },
  tabDot: { minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center", paddingHorizontal: 5 },
  tabDotText: { fontSize: 11, ...f("700"), color: "#fff" },
  row: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 26, alignItems: "center" },
  avatar: { width: 54, height: 54, borderRadius: 18 },
  onlineDot: { position: "absolute", right: -1, bottom: -1, width: 14, height: 14, borderRadius: 7, backgroundColor: colors.ok, borderWidth: 2.5, borderColor: "#fff" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { fontSize: 16, ...f("500"), color: colors.ink, flex: 1 },
  time: { fontFamily: FONT, fontSize: 12, color: colors.grey },
  last: { fontFamily: FONT, fontSize: 14, color: colors.grey, flex: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontSize: 12, ...f("600") },
  empty: { alignItems: "center", marginTop: 50, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, ...f("500"), color: colors.ink },
  emptyText: { fontFamily: FONT, fontSize: 14, color: colors.grey, textAlign: "center" },
});
