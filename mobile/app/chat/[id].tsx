import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Aurora, Glass, Grad, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { brandGradient, colors, FONT, gradientEnd, gradientStart } from "@/lib/theme";

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
  const insets = useSafeAreaInsets();

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
    <View style={{ flex: 1 }}>
      <Aurora />
      <Glass strong style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <RoundBtn onPress={() => router.back()} size={40}>
          <Icon name="back" />
        </RoundBtn>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {title}
        </Text>
      </Glass>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <FlatList
          ref={list}
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          renderItem={({ item }) => {
            const mine = item.senderId === me;
            const inner = (
              <>
                {!mine && names[item.senderId] ? <Text style={styles.sender}>{names[item.senderId]}</Text> : null}
                {item.imageUrl ? <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" /> : null}
                {item.content ? <Text style={[styles.text, mine && { color: "#fff" }]}>{item.content}</Text> : null}
              </>
            );
            return mine ? (
              <LinearGradient colors={brandGradient} start={gradientStart} end={gradientEnd} style={[styles.bubble, styles.mine]}>
                {inner}
              </LinearGradient>
            ) : (
              <Glass strong style={[styles.bubble, styles.theirs]}>
                {inner}
              </Glass>
            );
          }}
        />
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Glass strong style={styles.inputWrap}>
            <TextInput value={text} onChangeText={setText} placeholder="Сообщение" placeholderTextColor={colors.grey} style={styles.input} multiline />
          </Glass>
          <Pressable onPress={send} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.88 : 1 }] })}>
            <Grad style={styles.send}>
              <Icon name="send" color="#fff" size={20} />
            </Grad>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingBottom: 10, borderRadius: 0 },
  headerTitle: { flex: 1, fontFamily: FONT, fontSize: 17, fontWeight: "500", color: colors.ink },
  bubble: { maxWidth: "80%", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  mine: { alignSelf: "flex-end", borderBottomRightRadius: 6 },
  theirs: { alignSelf: "flex-start", borderBottomLeftRadius: 6 },
  sender: { fontFamily: FONT, fontSize: 12, color: colors.violet, fontWeight: "500", marginBottom: 2 },
  text: { fontFamily: FONT, fontSize: 15.5, color: colors.ink, lineHeight: 21 },
  image: { width: 220, height: 220, borderRadius: 14, marginBottom: 4 },
  error: { fontFamily: FONT, color: colors.danger, textAlign: "center", fontSize: 12 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  inputWrap: { flex: 1, borderRadius: 24, paddingHorizontal: 16, minHeight: 48, justifyContent: "center" },
  input: { fontFamily: FONT, minHeight: 44, maxHeight: 120, fontSize: 15.5, color: colors.ink, paddingVertical: 10 },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
