import { useEffect, useRef, useState } from "react";
import { Alert, Animated, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { Btn } from "@/components/brand";
import { Sheet } from "@/components/Sheet";
import { Avatar } from "@/components/ui";
import { tapLight, tapOk, tapWarn } from "@/lib/feedback";
import { sendReview, type ReviewInput, type ReviewTarget } from "@/lib/reviews";
import { colors, FONT } from "@/lib/theme";

const TOGGLES: { key: Exclude<keyof ReviewInput, "rating">; label: string }[] = [
  { key: "arrivedOnTime", label: "Пришёл(-ла) вовремя" },
  { key: "pleasantCommunication", label: "Приятное общение" },
  { key: "meetingHappened", label: "Встреча состоялась" },
  { key: "wouldMeetAgain", label: "Готов(а) встретиться снова" },
];

const FRESH: ReviewInput = { rating: 0, arrivedOnTime: true, pleasantCommunication: true, meetingHappened: true, wouldMeetAgain: true };

/** «Как прошла встреча с {name}?» — звёзды и четыре отметки (components/proto/ReviewSheet.tsx). */
export function ReviewSheet({
  target,
  onDone,
  onSkip,
}: {
  target: ReviewTarget | null;
  /** Отзыв ушёл — следующая шторка или закрыть. */
  onDone: (t: ReviewTarget) => void;
  /** «Отмена» — пропустить этого человека. */
  onSkip: (t: ReviewTarget) => void;
}) {
  const [form, setForm] = useState<ReviewInput>(FRESH);
  const [sending, setSending] = useState(false);
  const scales = useRef([0, 1, 2, 3, 4].map(() => new Animated.Value(1))).current;
  // Пока шторка уезжает, показываем того же человека (иначе панель «схлопнется»).
  const last = useRef<ReviewTarget | null>(null);
  if (target) last.current = target;
  const shown = target ?? last.current;

  // Новый человек — чистая форма.
  useEffect(() => {
    setForm(FRESH);
  }, [target?.eventId, target?.person.id]);

  function star(n: number) {
    tapLight();
    setForm((f) => ({ ...f, rating: n }));
    const s = scales[n - 1]!;
    s.setValue(0.6);
    Animated.spring(s, { toValue: 1, friction: 3, tension: 180, useNativeDriver: true }).start();
  }

  async function submit() {
    if (!target || !form.rating) return;
    setSending(true);
    try {
      await sendReview(target, form);
      tapOk();
      onDone(target);
    } catch (e) {
      tapWarn();
      Alert.alert("Не получилось отправить отзыв", (e as { code?: string }).code === "network" ? "Проблема с соединением." : "Попробуй ещё раз");
    } finally {
      setSending(false);
    }
  }

  return (
    <Sheet visible={!!target} onClose={() => target && !sending && onSkip(target)}>
      {shown ? (
        <>
          <View style={styles.head}>
            <Avatar uri={shown.person.avatarUrl} name={shown.person.name} size={56} />
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>
                Как прошла встреча <Text style={{ color: colors.violet }}>с {shown.person.name}?</Text>
              </Text>
              <Text style={styles.muted} numberOfLines={1}>
                {shown.eventTitle}
              </Text>
            </View>
          </View>

          <View style={styles.stars}>
            {[1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} onPress={() => star(n)} hitSlop={6}>
                <Animated.Text style={[styles.star, { color: n <= form.rating ? "#FFB020" : "rgba(22,18,31,0.15)", transform: [{ scale: scales[n - 1]! }] }]}>★</Animated.Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.toggles}>
            {TOGGLES.map((t, i) => (
              <View key={t.key} style={[styles.toggle, i > 0 && styles.sep]}>
                <Text style={styles.toggleText}>{t.label}</Text>
                <Switch
                  value={form[t.key]}
                  onValueChange={(v) => {
                    tapLight();
                    setForm((f) => ({ ...f, [t.key]: v }));
                  }}
                  trackColor={{ true: colors.violet, false: "rgba(22,18,31,0.15)" }}
                  thumbColor="#fff"
                />
              </View>
            ))}
          </View>

          <Btn title={sending ? "Отправляем…" : "Отправить"} onPress={submit} loading={sending} disabled={!form.rating} />
          <Btn kind="o" title="Отмена" onPress={() => target && onSkip(target)} disabled={sending} />
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 4 },
  title: { fontFamily: FONT, fontSize: 20, lineHeight: 24, fontWeight: "500", color: colors.ink, letterSpacing: -0.4 },
  muted: { fontFamily: FONT, fontSize: 13, color: colors.grey, marginTop: 2 },
  stars: { flexDirection: "row", justifyContent: "center", gap: 10, marginVertical: 6 },
  star: { fontSize: 44, lineHeight: 52 },
  toggles: { backgroundColor: "#fff", borderRadius: 20, paddingHorizontal: 14, marginBottom: 6 },
  toggle: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 10 },
  sep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(108,59,255,0.15)" },
  toggleText: { fontFamily: FONT, fontSize: 15, color: colors.ink },
});
