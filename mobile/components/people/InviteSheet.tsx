import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Image } from "expo-image";
import { Btn, Mosya } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { api, type ApiError } from "@/lib/api";
import { tapOk, tapWarn } from "@/lib/feedback";
import { formatEventDate } from "@/lib/format";
import { suggestMeet } from "@/lib/interests";
import { colors, eventIcon, FONT } from "@/lib/theme";

interface MyEvent {
  id: string;
  title: string;
  eventDate: string;
  eventTime: string;
  placeName: string | null;
  status: string;
  category: { slug: string; name: string } | null;
  isBusiness: boolean;
  photoUrl: string | null;
  role: "organizer" | "participant";
}

function inviteError(e: unknown, name: string): string {
  const err = e as ApiError;
  const limit = (err.data as { limit?: number } | undefined)?.limit ?? 5;
  switch (err.code) {
    case "no_shared_event":
    case "not_your_event":
      return "Позвать можно только на свою встречу";
    case "event_unavailable":
      return "Эта встреча уже закрыта — выбери другую";
    case "event_full":
      return "На этой встрече не осталось мест";
    case "already_member":
      return `${name} уже идёт на эту встречу`;
    case "already_invited":
      return `${name} уже приглашён на эту встречу — позвать можно один раз`;
    case "invite_limit":
      return `За сутки можно позвать не больше ${limit} человек. Попробуй завтра`;
    default:
      return err.message || "Не получилось — попробуй ещё раз";
  }
}

/** «Позвать {name}»: советы Моси, свои ближайшие встречи, пара слов и отправка. */
export function InviteSheet({
  visible,
  person,
  onClose,
}: {
  visible: boolean;
  person: { id: string; name: string; interests: string[]; commonInterests: string[] };
  onClose: () => void;
}) {
  const [events, setEvents] = useState<MyEvent[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!visible) return;
    setPicked(null);
    api<{ items: MyEvent[] }>("/api/me/events?scope=upcoming")
      .then((r) => {
        const mine = (r.items ?? []).filter((e) => e.role === "organizer" && (e.status === "published" || e.status === "closed"));
        setEvents(mine);
        if (mine.length === 1) setPicked(mine[0]!.id);
      })
      .catch(() => setEvents([]));
  }, [visible]);

  const tip = suggestMeet(person.interests, person.commonInterests);

  function createNew(params: Record<string, string> = {}) {
    onClose();
    // Ждём, пока шторка уедет: на iOS новый экран-модалку нельзя открыть поверх ещё открытой шторки.
    setTimeout(() => router.push({ pathname: "/create", params: { ...params, invite: person.id, inviteName: person.name } }), 280);
  }

  async function send() {
    if (!picked) return;
    setSending(true);
    try {
      await api("/api/conversations/direct", { body: { userId: person.id, eventId: picked, message: message.trim() || undefined } });
      tapOk();
      setMessage("");
      onClose();
      Alert.alert("Позвал!", `${person.name} получит приглашение`);
    } catch (e) {
      tapWarn();
      Alert.alert("Не получилось", inviteError(e, person.name));
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Позвать {person.name}</Text>
      <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: 12, paddingBottom: 6 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {tip ? (
          <View style={styles.mosya}>
            <View style={styles.mosyaHead}>
              <Mosya pose="glasses" size={44} />
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Совет Моси</Text>
                <Text style={styles.mosyaText}>{tip.text}</Text>
              </View>
            </View>
            {tip.ideas.map((idea) => (
              <Pressable
                key={idea.title}
                onPress={() => createNew(idea.type ? { category: idea.category, type: idea.type } : { category: idea.category })}
                style={({ pressed }) => [styles.idea, { transform: [{ scale: pressed ? 0.98 : 1 }] }]}
              >
                <Image source={{ uri: idea.icon }} style={{ width: 34, height: 34 }} contentFit="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.ideaTitle}>{idea.title}</Text>
                  <Text style={styles.muted}>{idea.common ? "ваш общий интерес" : `любит: ${idea.interest.toLowerCase()}`} · создать и позвать</Text>
                </View>
                <Icon name="chev" size={18} color={colors.grey} />
              </Pressable>
            ))}
          </View>
        ) : null}

        <Text style={styles.section}>Или позови на свою встречу</Text>
        {events === null ? <ActivityIndicator color={colors.violet} /> : null}
        {events?.length === 0 ? <Text style={styles.muted}>У тебя пока нет ближайших встреч</Text> : null}
        {events?.map((e) => {
          const on = picked === e.id;
          return (
            <Pressable key={e.id} onPress={() => setPicked(e.id)} style={[styles.event, on && styles.eventOn]}>
              <View style={styles.evIc}>
                {e.photoUrl ? (
                  <Image source={{ uri: e.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                ) : (
                  <Image source={{ uri: eventIcon(e) }} style={{ width: 30, height: 30 }} contentFit="contain" />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.evTitle} numberOfLines={1}>
                  {e.title}
                </Text>
                <Text style={styles.muted} numberOfLines={1}>
                  {formatEventDate(e.eventDate, e.eventTime)}
                  {e.placeName ? ` · ${e.placeName}` : ""}
                </Text>
              </View>
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <Icon name="check" size={14} color="#fff" /> : null}</View>
            </Pressable>
          );
        })}
        <Pressable onPress={() => createNew()} style={styles.event}>
          <View style={[styles.evIc, { backgroundColor: colors.lav }]}>
            <Icon name="plus" size={20} color={colors.violet} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.evTitle}>Новая встреча</Text>
            <Text style={styles.muted}>создать — приглашение уйдёт само</Text>
          </View>
          <Icon name="chev" size={18} color={colors.grey} />
        </Pressable>

        {events && events.length > 0 ? (
          <>
            <TextInput
              value={message}
              onChangeText={setMessage}
              placeholder="Пару слов от тебя (необязательно)"
              placeholderTextColor={colors.grey}
              maxLength={300}
              multiline
              style={styles.input}
            />
            <Text style={styles.hint}>Одного человека на встречу можно позвать один раз, всего — до 5 приглашений в сутки.</Text>
          </>
        ) : null}
        <Text style={styles.hint}>Для безопасности первая встреча — в людном месте. Написать лично можно после общей встречи.</Text>
      </ScrollView>
      {events && events.length > 0 ? <Btn title={sending ? "Отправляем…" : "Отправить приглашение"} onPress={send} loading={sending} disabled={!picked} /> : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: FONT, fontSize: 22, fontWeight: "500", color: colors.ink, letterSpacing: -0.5, marginBottom: 4 },
  mosya: { backgroundColor: "#fff", borderRadius: 22, padding: 12, gap: 8 },
  mosyaHead: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  label: { fontFamily: FONT, fontSize: 12, fontWeight: "600", color: colors.violet, textTransform: "uppercase", letterSpacing: 0.6 },
  mosyaText: { fontFamily: FONT, fontSize: 14, lineHeight: 19, color: colors.ink2, marginTop: 2 },
  idea: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.milk, borderRadius: 16, padding: 10 },
  ideaTitle: { fontFamily: FONT, fontSize: 15, fontWeight: "500", color: colors.ink },
  section: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink, marginTop: 4 },
  muted: { fontFamily: FONT, fontSize: 13, color: colors.grey },
  event: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 18, padding: 10, borderWidth: 1.5, borderColor: "transparent" },
  eventOn: { borderColor: colors.violet },
  evIc: { width: 46, height: 46, borderRadius: 14, overflow: "hidden", backgroundColor: "#EDE5FF", alignItems: "center", justifyContent: "center" },
  evTitle: { fontFamily: FONT, fontSize: 15, fontWeight: "500", color: colors.ink },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5, borderColor: "rgba(108,59,255,0.3)", alignItems: "center", justifyContent: "center" },
  radioOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  input: { backgroundColor: "#fff", borderRadius: 18, padding: 14, minHeight: 70, fontFamily: FONT, fontSize: 15, color: colors.ink, textAlignVertical: "top" },
  hint: { fontFamily: FONT, fontSize: 12.5, lineHeight: 17, color: colors.grey },
});
