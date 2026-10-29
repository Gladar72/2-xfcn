import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { Avatar } from "@/components/ui";
import { colors, FONT } from "@/lib/theme";
import { plural } from "@/lib/format";

/** Заявка из GET /api/events/[id]/applications. */
export interface Application {
  id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled" | "removed";
  createdAt: string;
  applicant: {
    id: string;
    name: string;
    avatarUrl: string | null;
    age: number | null;
    bio: string | null;
    /** Анонимная встреча: профиль откроется после одобрения. */
    anonymous?: boolean;
    ratingAvg: number;
    completedMeetingsCount: number;
  } | null;
}

export const APPLICATION_STATUS: Record<Application["status"], { label: string; color: string; bg: string }> = {
  pending: { label: "Ждёт ответа", color: "#C2410C", bg: "rgba(255,178,122,0.22)" },
  accepted: { label: "Принят", color: "#15803D", bg: "rgba(34,181,115,0.14)" },
  rejected: { label: "Отклонена", color: colors.grey, bg: "rgba(138,132,160,0.14)" },
  cancelled: { label: "Отменил сам", color: colors.grey, bg: "rgba(138,132,160,0.14)" },
  removed: { label: "Убран из встречи", color: colors.grey, bg: "rgba(138,132,160,0.14)" },
};

export function ratingLine(a: { ratingAvg: number; completedMeetingsCount: number }): string {
  const r = a.ratingAvg ? a.ratingAvg.toFixed(1).replace(".", ",") : "—";
  const n = a.completedMeetingsCount;
  return `★ ${r} · ${n} ${plural(n, "встреча", "встречи", "встреч")}`;
}

/** Карточка заявки: аватар, имя, рейтинг, пара строк о себе и кнопки «Отклонить / Принять». */
export function ApplicantRow({
  app,
  onDecide,
  onRemove,
  showStatus,
}: {
  app: Application;
  onDecide?: (app: Application, action: "accept" | "reject") => Promise<void>;
  onRemove?: (app: Application) => void;
  showStatus?: boolean;
}) {
  const [busy, setBusy] = useState<"accept" | "reject" | null>(null);
  const a = app.applicant;
  if (!a) return null;
  const st = APPLICATION_STATUS[app.status];

  async function decide(action: "accept" | "reject") {
    if (!onDecide || busy) return;
    setBusy(action);
    try {
      await onDecide(app, action);
    } finally {
      setBusy(null);
    }
  }

  return (
    <View style={styles.row}>
      <Pressable style={styles.head} disabled={!!a.anonymous} onPress={() => router.push(`/person/${a.id}` as Href)}>
        <Avatar uri={a.avatarUrl} name={a.name} size={48} />
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>
            {a.name}
            {a.age ? `, ${a.age}` : ""}
          </Text>
          <Text style={styles.meta}>{ratingLine(a)}</Text>
        </View>
        {showStatus ? (
          <View style={[styles.badge, { backgroundColor: st.bg }]}>
            <Text style={[styles.badgeText, { color: st.color }]}>{st.label}</Text>
          </View>
        ) : null}
      </Pressable>
      {a.bio && app.status === "pending" ? (
        <Text style={styles.bio} numberOfLines={3}>
          {a.bio}
        </Text>
      ) : null}
      {app.status === "pending" && onDecide ? (
        <View style={styles.btns}>
          <SmallBtn label="Отклонить" onPress={() => decide("reject")} loading={busy === "reject"} disabled={!!busy} />
          <SmallBtn label="Принять" primary onPress={() => decide("accept")} loading={busy === "accept"} disabled={!!busy} />
        </View>
      ) : null}
      {app.status === "accepted" && onRemove ? (
        <View style={styles.btns}>
          <SmallBtn label="Убрать из встречи" onPress={() => onRemove(app)} />
        </View>
      ) : null}
    </View>
  );
}

export function SmallBtn({
  label,
  onPress,
  primary,
  loading,
  disabled,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  loading?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.small,
        primary ? { backgroundColor: colors.violet } : { backgroundColor: "#fff", borderWidth: 1, borderColor: "rgba(108,59,255,0.18)" },
        { opacity: disabled && !loading ? 0.5 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
      ]}
    >
      <Text style={[styles.smallText, { color: primary ? "#fff" : colors.ink }]}>{loading ? "…" : label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: "rgba(255,255,255,0.8)", borderRadius: 22, padding: 12, gap: 10 },
  head: { flexDirection: "row", alignItems: "center", gap: 12 },
  name: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink },
  meta: { fontFamily: FONT, fontSize: 13, color: colors.grey, marginTop: 2 },
  bio: { fontFamily: FONT, fontSize: 14, lineHeight: 19, color: colors.ink2 },
  btns: { flexDirection: "row", gap: 8 },
  small: { flex: 1, height: 42, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  smallText: { fontFamily: FONT, fontSize: 15, fontWeight: "600" },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  badgeText: { fontFamily: FONT, fontSize: 12, fontWeight: "600" },
});
