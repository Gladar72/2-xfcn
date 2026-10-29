import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Aurora, Glass, Grad, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { tapLight } from "@/lib/feedback";
import { stickerUrl } from "@/lib/stickers";
import { brandGradient, colors, FONT, gradientEnd, gradientStart, f } from "@/lib/theme";

/**
 * «Помощь»: Мося-помощник (ИИ) отвечает сразу, сложные вопросы уходят команде.
 * Ответ сотрудника приходит сюда и push-уведомлением.
 */

interface Ticket {
  id: string;
  message: string;
  botReply: string | null;
  adminReply: string | null;
  adminRepliedAt: string | null;
  createdAt: string;
}

type Bubble = { key: string; who: "me" | "mosya" | "team"; text: string; pending?: boolean };

const QUICK = ["Как создать встречу?", "Почему заявку не приняли?", "Как работает анонимность?", "Как оплатить подписку?", "Как стать партнёром?"];
const HELLO = "Привет! Я Мося — помогу разобраться с приложением. Спроси что угодно или выбери вопрос 👇";

function toBubbles(items: Ticket[]): Bubble[] {
  const out: Bubble[] = [{ key: "hello", who: "mosya", text: HELLO }];
  for (const t of items) {
    out.push({ key: `${t.id}-q`, who: "me", text: t.message });
    if (t.botReply) out.push({ key: `${t.id}-b`, who: "mosya", text: t.botReply });
    if (t.adminReply) out.push({ key: `${t.id}-a`, who: "team", text: t.adminReply });
  }
  return out;
}

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<Bubble[]>([{ key: "hello", who: "mosya", text: HELLO }]);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const list = useRef<FlatList<Bubble>>(null);
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    if (busyRef.current) return; // не затираем вопрос, на который Мося ещё отвечает
    try {
      const r = await api<{ items: Ticket[] }>("/api/support/history");
      setItems(toBubbles(r.items));
    } catch {}
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
    // Ответ сотрудника может прийти, пока экран открыт или приложение в фоне.
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") load();
    });
    const t = setInterval(() => {
      if (AppState.currentState === "active") load();
    }, 30000);
    return () => {
      sub.remove();
      clearInterval(t);
    };
  }, [load]);

  const ask = useCallback(
    async (message: string, human = false) => {
      const q = message.trim();
      if (!q || busy) return;
      tapLight();
      setText("");
      setBusy(true);
      busyRef.current = true;
      const k = `local-${Date.now()}`;
      setItems((prev) => [...prev, { key: `${k}-q`, who: "me", text: q }, { key: `${k}-p`, who: "mosya", text: "Печатаю…", pending: true }]);
      requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
      try {
        const r = await api<{ reply: string }>("/api/support/ask", { body: { message: q, human } });
        setItems((prev) => prev.map((b) => (b.key === `${k}-p` ? { key: `${k}-b`, who: "mosya", text: r.reply } : b)));
      } catch (e) {
        setItems((prev) => prev.map((b) => (b.key === `${k}-p` ? { key: `${k}-e`, who: "mosya", text: (e as Error).message || "Не получилось отправить — попробуй ещё раз" } : b)));
      } finally {
        busyRef.current = false;
        setBusy(false);
        requestAnimationFrame(() => list.current?.scrollToEnd({ animated: true }));
      }
    },
    [busy]
  );

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <Glass strong style={[styles.header, { paddingTop: insets.top + 6 }]}>
        <RoundBtn onPress={() => router.back()} size={40}>
          <Icon name="back" />
        </RoundBtn>
        <Image source={{ uri: stickerUrl("mosya_phone") }} style={styles.avatar} contentFit="contain" />
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Помощь</Text>
          <Text style={styles.sub}>Мося отвечает сразу, команда — в течение дня</Text>
        </View>
      </Glass>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
        {!loaded ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.violet} />
          </View>
        ) : (
          <FlatList
            ref={list}
            data={items}
            keyExtractor={(b) => b.key}
            contentContainerStyle={{ padding: 12, gap: 8 }}
            onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) =>
              item.who === "me" ? (
                <LinearGradient colors={brandGradient} start={gradientStart} end={gradientEnd} style={[styles.bubble, styles.mine]}>
                  <Text style={[styles.text, { color: "#fff" }]}>{item.text}</Text>
                </LinearGradient>
              ) : (
                <View style={[styles.bubble, styles.theirs, item.who === "team" && styles.team]}>
                  <Text style={[styles.from, item.who === "team" && { color: colors.ok }]}>{item.who === "team" ? "Команда МЕСТО" : "Мося"}</Text>
                  <Text style={[styles.text, item.pending && { color: colors.grey, fontStyle: "italic" }]}>{item.text}</Text>
                </View>
              )
            }
            ListFooterComponent={
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
                {QUICK.map((q) => (
                  <Pressable key={q} onPress={() => ask(q)} style={({ pressed }) => [styles.chip, pressed && { opacity: 0.6 }]}>
                    <Text style={styles.chipText}>{q}</Text>
                  </Pressable>
                ))}
                <Pressable onPress={() => ask(text.trim() || "Хочу поговорить с живым человеком", true)} style={({ pressed }) => [styles.chip, styles.chipHuman, pressed && { opacity: 0.6 }]}>
                  <Icon name="people" size={15} color={colors.violet} />
                  <Text style={[styles.chipText, { color: colors.violet }]}>Позвать человека</Text>
                </Pressable>
              </ScrollView>
            }
          />
        )}
        <View style={[styles.inputRow, { paddingBottom: Math.max(insets.bottom, 10) }]}>
          <Glass strong style={styles.inputWrap}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Напиши вопрос"
              placeholderTextColor={colors.grey}
              style={styles.input}
              multiline
              maxLength={1000}
            />
          </Glass>
          <Pressable onPress={() => ask(text)} disabled={busy || !text.trim()} style={({ pressed }) => ({ opacity: busy || !text.trim() ? 0.5 : 1, transform: [{ scale: pressed ? 0.88 : 1 }] })}>
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
  header: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 12, paddingBottom: 10, borderRadius: 0 },
  avatar: { width: 42, height: 42 },
  title: { fontSize: 17, ...f("600"), color: colors.ink },
  sub: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  bubble: { maxWidth: "84%", borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9 },
  mine: { alignSelf: "flex-end", borderBottomRightRadius: 6 },
  theirs: { alignSelf: "flex-start", borderBottomLeftRadius: 6, backgroundColor: "rgba(255,255,255,0.92)" },
  team: { borderWidth: 1.5, borderColor: "rgba(34,181,115,0.45)" },
  from: { fontSize: 12.5, ...f("600"), color: colors.violet, marginBottom: 2 },
  text: { fontFamily: FONT, fontSize: 15.5, color: colors.ink, lineHeight: 21 },
  chips: { gap: 8, paddingVertical: 10 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.9)", borderWidth: 1, borderColor: "rgba(108,59,255,0.14)" },
  chipHuman: { backgroundColor: colors.lav },
  chipText: { fontFamily: FONT, fontSize: 14, color: colors.ink2 },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  inputWrap: { flex: 1, borderRadius: 24, paddingHorizontal: 16, minHeight: 48, justifyContent: "center" },
  input: { fontFamily: FONT, minHeight: 44, maxHeight: 120, fontSize: 16, color: colors.ink, paddingVertical: 10 },
  send: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
});
