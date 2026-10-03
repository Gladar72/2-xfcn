import { useCallback, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

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
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      <Text style={styles.title}>Чаты</Text>
      <FlatList
        data={items}
        keyExtractor={(c) => c.conversationId}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.accent} />}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.conversationId}`)}>
            {item.eventPhotoUrl ? (
              <Image source={{ uri: item.eventPhotoUrl }} style={styles.avatar} />
            ) : (
              <Avatar uri={item.otherUser?.avatarUrl} name={item.eventTitle ?? item.otherUser?.name} size={52} />
            )}
            <View style={{ flex: 1, gap: 2 }}>
              <View style={styles.between}>
                <Text style={styles.name} numberOfLines={1}>{item.eventTitle ?? item.otherUser?.name ?? "Чат"}</Text>
                <Text style={styles.time}>{time(item.lastMessage?.createdAt)}</Text>
              </View>
              <View style={styles.between}>
                <Text style={styles.last} numberOfLines={1}>
                  {item.lastMessage ? `${item.lastMessage.isMine ? "Ты: " : item.lastMessage.senderName ? `${item.lastMessage.senderName}: ` : ""}${item.lastMessage.content}` : "Нет сообщений"}
                </Text>
                {item.unreadCount > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unreadCount}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        )}
        ListEmptyComponent={loaded ? <Text style={styles.empty}>Чаты появятся, когда ты пойдёшь на встречу</Text> : null}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.display, fontWeight: "800", color: colors.ink900, paddingHorizontal: 16, paddingVertical: 8 },
  row: { flexDirection: "row", gap: 12, paddingHorizontal: 16, paddingVertical: 10, alignItems: "center" },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  name: { fontSize: font.base, fontWeight: "700", color: colors.ink900, flex: 1 },
  time: { fontSize: font.xs, color: colors.ink400 },
  last: { fontSize: font.sm, color: colors.ink600, flex: 1 },
  badge: { minWidth: 22, height: 22, borderRadius: 11, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: "#fff", fontSize: font.xs, fontWeight: "800" },
  empty: { textAlign: "center", color: colors.ink600, marginTop: 40, paddingHorizontal: 24 },
});
