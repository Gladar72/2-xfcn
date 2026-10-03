import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Stack, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { api } from "@/lib/api";
import { colors, font } from "@/lib/theme";

interface Message {
  id: string;
  senderId: string;
  content: string;
  imageUrl: string | null;
  createdAt: string;
}
interface Member {
  id: string;
  name: string;
}

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [title, setTitle] = useState("");
  const [names, setNames] = useState<Record<string, string>>({});
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = useRef<FlatList<Message>>(null);

  const load = useCallback(async () => {
    try {
      const r = await api<{ messages: Message[]; eventTitle: string | null; members?: Member[] }>(`/api/conversations/${id}/messages`);
      setMessages(r.messages);
      setTitle(r.eventTitle ?? "Чат");
      if (r.members) setNames(Object.fromEntries(r.members.map((m) => [m.id, m.name])));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    api<{ userId: string }>("/api/me").then((r) => setMe(r.userId)).catch(() => {});
    load();
    // Пока без realtime — обновляем каждые 4 секунды, пока экран открыт.
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [load]);

  async function send() {
    const content = text.trim();
    if (!content) return;
    setText("");
    try {
      await api(`/api/conversations/${id}/messages`, { body: { content } });
      await load();
    } catch (e) {
      setText(content);
      setError((e as Error).message);
    }
  }

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: colors.background }}>
      <Stack.Screen options={{ headerShown: true, title, headerBackTitle: "Чаты", headerTintColor: colors.accent }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <FlatList
          ref={list}
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          renderItem={({ item }) => {
            const mine = item.senderId === me;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                {!mine && names[item.senderId] ? <Text style={styles.sender}>{names[item.senderId]}</Text> : null}
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" /> : null}
                {item.content ? <Text style={[styles.text, mine && { color: "#fff" }]}>{item.content}</Text> : null}
              </View>
            );
          }}
        />
        {error ? <Text style={{ color: colors.danger, textAlign: "center", fontSize: font.xs }}>{error}</Text> : null}
        <View style={styles.inputRow}>
          <TextInput value={text} onChangeText={setText} placeholder="Сообщение" placeholderTextColor={colors.ink400} style={styles.input} multiline />
          <Pressable onPress={send} style={styles.send}>
            <Ionicons name="arrow-up" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  bubble: { maxWidth: "80%", borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8 },
  mine: { alignSelf: "flex-end", backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  theirs: { alignSelf: "flex-start", backgroundColor: "#fff", borderBottomLeftRadius: 6, borderWidth: 1, borderColor: colors.border },
  sender: { fontSize: font.xs, color: colors.accent, fontWeight: "700", marginBottom: 2 },
  text: { fontSize: font.base, color: colors.ink900 },
  image: { width: 220, height: 220, borderRadius: 12, marginBottom: 4 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, padding: 10, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#fff" },
  input: { flex: 1, minHeight: 40, maxHeight: 120, borderRadius: 20, backgroundColor: colors.lavender50, paddingHorizontal: 14, paddingVertical: 10, fontSize: font.base },
  send: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.accent, alignItems: "center", justifyContent: "center" },
});
