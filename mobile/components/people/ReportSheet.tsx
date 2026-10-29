import { useState } from "react";
import { Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Btn } from "@/components/brand";
import { Icon, type IconName } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { api } from "@/lib/api";
import { tapOk, tapWarn } from "@/lib/feedback";
import { colors, FONT, f } from "@/lib/theme";

const REASONS: { id: string; label: string; icon: IconName }[] = [
  { id: "no_show", label: "Не пришёл на встречу", icon: "clock" },
  { id: "bad_behavior", label: "Неприятное поведение", icon: "flag" },
  { id: "fake_profile", label: "Фейковый профиль", icon: "mask" },
  { id: "block", label: "Заблокировать", icon: "lock" },
];

/** «Что случилось?» — жалоба или блокировка (POST /api/reports). */
export function ReportSheet({
  visible,
  person,
  eventId,
  onClose,
  onBlocked,
}: {
  visible: boolean;
  person: { id: string; name: string };
  eventId?: string;
  onClose: () => void;
  onBlocked: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function send(reason: string) {
    if (reason === "block") {
      Alert.alert(`Заблокировать ${person.name}?`, "Вы больше не увидите друг друга в ленте, людях и профилях.", [
        { text: "Отмена", style: "cancel" },
        { text: "Заблокировать", style: "destructive", onPress: () => void submit(reason) },
      ]);
      return;
    }
    await submit(reason);
  }

  async function submit(reason: string) {
    setBusy(reason);
    try {
      await api("/api/reports", { body: { userId: person.id, reason, eventId } });
      tapOk();
      if (reason === "block") {
        Alert.alert("Готово", "Заблокировали — больше не увидите друг друга");
        onBlocked();
      } else {
        Alert.alert("Спасибо", "Мы проверим");
        onClose();
      }
    } catch {
      tapWarn();
      Alert.alert("Не получилось", "Попробуй ещё раз");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Что случилось?</Text>
      <View style={{ gap: 8, marginVertical: 6 }}>
        {REASONS.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => send(r.id)}
            disabled={!!busy}
            style={({ pressed }) => [styles.row, { opacity: busy && busy !== r.id ? 0.5 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
          >
            <View style={[styles.ic, r.id === "block" && { backgroundColor: "rgba(229,72,77,0.12)" }]}>
              <Icon name={r.icon} size={18} color={r.id === "block" ? colors.danger : colors.violet} />
            </View>
            <Text style={[styles.label, r.id === "block" && { color: colors.danger }]}>{busy === r.id ? "Отправляем…" : r.label}</Text>
          </Pressable>
        ))}
      </View>
      <Btn kind="o" title="Отмена" onPress={onClose} disabled={!!busy} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, ...f("500"), color: colors.ink, letterSpacing: -0.5 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 18, padding: 12 },
  ic: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: FONT, fontSize: 15.5, color: colors.ink },
});
