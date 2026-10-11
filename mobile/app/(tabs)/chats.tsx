import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Avatar } from "@/components/ui";
import { Aurora, Glass, Grad, Mosya, Title } from "@/components/brand";
import { api } from "@/lib/api";
import { colors, FONT } from "@/lib/theme";

interface ChatItem {
  conversationId: string;
  unreadCount: number;
  eventTitle: string | null;
  eventStatus: string | null;
  eventPhotoUrl: string | null;
  otherUser: { name: string; avatarUrl: string | null } | null;
  otherMembersCount: number;
  lastMessage: { content: string; createdAt: string; isMine: boolean; senderName: string | null } | null;
}

function time(iso?: string) {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}` : `${d.getDate()}.${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export default function ChatsScreen() {
  const [items, setItems] = useState<ChatItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const insets = useSafeAreaInsets();

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: ChatItem[] }>("/api/conversations");
      setItems(r.items);
    } catch {}
    setLoaded(true);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <FlatList
        data={items}
        keyExtractor={(c) => c.conversationId}
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 16, paddingBottom: insets.bottom + 120, gap: 10 }}
        ListHeaderComponent={<Title plain="Твои " em="чаты" size={30} style={{ marginBottom: 10, marginLeft: 4 }} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.violet} />}
        renderItem={({ item }) => (
          <Pressable onPress={() => router.push(`/chat/${item.conversationId}`)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <Glass strong style={styles.row}>
              {item.eventPhotoUrl ? (
                <Image source={{ uri: item.eventPhotoUrl }} style={styles.avatar} />
              ) : (
                <Avatar uri={item.otherUser?.avatarUrl} name={item.eventTitle ?? item.otherUser?.name} size={54} />
              )}
              <View style={{ flex: 1, gap: 3 }}>
                <View style={styles.between}>
                  <Text style={styles.name} numberOfLines={1}>{item.eventTitle ?? item.otherUser?.name ?? "Чат"}</Text>
                  <Text style={styles.time}>{time(item.lastMessage?.createdAt)}</Text>
                </View>
                <View style={styles.between}>
                  <Text style={styles.last} numberOfLines={1}>
                    {item.lastMessage ? `${item.lastMessage.isMine ? "Ты: " : item.lastMessage.senderName ? `${item.lastMessage.senderName}: ` : ""}${item.lastMessage.content}` : "Нет сообщений"}
                  </Text>
                  {item.unreadCount > 0 ? (
                    <Grad style={styles.badge}>
                      <Text style={styles.badgeText}>{item.unreadCount}</Text>
                    </Grad>
                  ) : null}
                </View>
              </View>
            </Glass>
          </Pressable>
        )}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Mosya pose="phone" size={150} />
              <Text style={styles.emptyTitle}>Пока тихо</Text>
              <Text style={styles.emptyText}>Чаты появятся, когда ты пойдёшь на встречу или тебе напишут</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 26, alignItems: "center" },
  avatar: { width: 54, height: 54, borderRadius: 18 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink, flex: 1 },
  time: { fontFamily: FONT, fontSize: 12, color: colors.grey },
  last: { fontFamily: FONT, fontSize: 14, color: colors.grey, flex: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { fontFamily: FONT, color: "#fff", fontSize: 12, fontWeight: "600" },
  empty: { alignItems: "center", marginTop: 50, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: FONT, fontSize: 19, fontWeight: "500", color: colors.ink },
  emptyText: { fontFamily: FONT, fontSize: 14, color: colors.grey, textAlign: "center" },
});
