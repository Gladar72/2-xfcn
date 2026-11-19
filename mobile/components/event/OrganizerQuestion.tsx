import { useRef, useState } from "react";
import { Alert, StyleSheet, Text, TextInput } from "react-native";
import { uuid } from "expo-modules-core";
import { router, type Href } from "expo-router";
import { Sheet } from "@/components/Sheet";
import { Btn } from "@/components/brand";
import { api, type ApiError } from "@/lib/api";
import { colors, f } from "@/lib/theme";

export function OrganizerQuestion({ eventId, title, visible, onClose }: {
  eventId: string; title: string; visible: boolean; onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const retry = useRef<{ text: string; id: string } | null>(null);
  async function send() {
    const value = text.trim();
    if (!value || sending.current) return;
    sending.current = true;
    setBusy(true);
    try {
      if (retry.current?.text !== value) retry.current = { text: value, id: uuid.v4() };
      const result = await api<{ conversationId: string }>(`/api/events/${eventId}/question`, { method: "POST", body: { text: value, messageId: retry.current.id } });
      setText("");
      retry.current = null;
      onClose();
      router.push(`/chat/${result.conversationId}` as Href);
    } catch (err) {
      const code = (err as ApiError).code;
      Alert.alert("Вопрос не отправлен", code === "event_unavailable" ? "Личные вопросы для этого события закрыты." : code === "blocked" ? "Переписка недоступна." : "Попробуй ещё раз.");
    } finally {
      sending.current = false;
      setBusy(false);
    }
  }
  return <Sheet visible={visible} onClose={() => { if (!sending.current) onClose(); }}>
    <Text style={[f("600"), { fontSize: 21 }]}>Вопрос организатору</Text>
    <Text style={{ color: colors.grey }}>{title}</Text>
    <TextInput accessibilityLabel="Твой вопрос" placeholder="Что хочешь уточнить?" multiline maxLength={1500}
      value={text} onChangeText={setText} editable={!busy} style={styles.input} />
    <Btn title="Отправить лично" loading={busy} disabled={!text.trim() || busy} onPress={send} />
  </Sheet>;
}
const styles = StyleSheet.create({
  input: { minHeight: 90, maxHeight: 160, padding: 12, backgroundColor: "#fff", borderRadius: 16, color: colors.ink, fontSize: 16, textAlignVertical: "top" },
});
