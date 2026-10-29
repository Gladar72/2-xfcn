import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Aurora, Btn, Glass, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { ConfirmSheet } from "@/components/Sheet";
import { api } from "@/lib/api";
import { manageErrorText, tapOk, tapWarn } from "@/lib/feedback";
import { formatEventDate } from "@/lib/format";
import { openRoute } from "@/lib/route";
import { brandGradient, colors, FONT, gradientEnd, gradientStart, f } from "@/lib/theme";

interface TicketResp {
  ticketCode: string;
  checkedInAt: string | null;
  conversationId: string | null;
  event: {
    id: string;
    title: string;
    photoUrl: string | null;
    eventDate: string;
    eventTime: string;
    eventEndTime: string | null;
    placeName: string | null;
    address: string | null;
    latitude: number | null;
    longitude: number | null;
    status: string;
    organizerName: string | null;
    businessPricingType: string | null;
    businessPricingDetails: string | null;
  };
}

/** «Мой билет» на бизнес-встречу (app/(app)/events/[id]/ticket). */
export default function TicketScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [t, setT] = useState<TicketResp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const pop = useRef(new Animated.Value(0.9)).current;

  const load = useCallback(() => {
    api<TicketResp>(`/api/events/${id}/ticket`)
      .then(setT)
      .catch((e) => setError(manageErrorText(e)));
  }, [id]);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );
  useEffect(() => {
    if (t) Animated.spring(pop, { toValue: 1, damping: 12, stiffness: 160, useNativeDriver: true }).start();
  }, [t, pop]);

  async function cancel() {
    setBusy(true);
    try {
      await api(`/api/events/${id}/ticket`, { method: "DELETE" });
      tapOk();
      setConfirm(false);
      router.back();
    } catch (e) {
      tapWarn();
      setConfirm(false);
      Alert.alert("Не получилось", manageErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  if (!t) {
    return (
      <View style={styles.center}>
        <Aurora />
        {error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.violet} />}
      </View>
    );
  }

  const e = t.event;
  const pay =
    e.businessPricingType === "free" || !e.businessPricingDetails?.trim()
      ? "Вход свободный"
      : e.businessPricingType === "ticket"
      ? `Оплата ${e.businessPricingDetails.trim()} — организатору на месте`
      : e.businessPricingDetails.trim();
  const active = e.status === "published" || e.status === "closed";
  const hasCoords = e.latitude != null && e.longitude != null;

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 120, gap: 14 }}>
        <RoundBtn onPress={() => router.back()}>
          <Icon name="back" />
        </RoundBtn>

        <Animated.View style={{ transform: [{ scale: pop }] }}>
          <Glass strong style={styles.card}>
            <View style={styles.cover}>
              {e.photoUrl ? <Image source={{ uri: e.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              <LinearGradient
                colors={e.photoUrl ? (["rgba(0,0,0,0)", "rgba(20,8,50,0.7)"] as const) : brandGradient}
                start={e.photoUrl ? { x: 0, y: 0 } : gradientStart}
                end={e.photoUrl ? { x: 0, y: 1 } : gradientEnd}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.badge, t.checkedInAt && { backgroundColor: colors.ok }]}>
                <Icon name="check" size={14} color={t.checkedInAt ? "#fff" : colors.ok} />
                <Text style={[styles.badgeText, t.checkedInAt && { color: "#fff" }]}>{t.checkedInAt ? "Отмечен на входе" : "Участие подтверждено"}</Text>
              </View>
              <Text style={styles.title} numberOfLines={3}>
                {e.title}
              </Text>
            </View>

            <View style={styles.body}>
              <Row icon="cal" text={`${formatEventDate(e.eventDate, e.eventTime)}${e.eventEndTime ? ` – ${e.eventEndTime.slice(0, 5)}` : ""}`} />
              <Row icon="pin" text={[e.placeName, e.address].filter(Boolean).join(", ") || "Место уточняется"} />
              {e.organizerName ? <Row icon="user" text={`Организатор: ${e.organizerName}`} /> : null}
              <Row icon="wallet" text={pay} />
            </View>

            <View style={styles.perf}>
              {Array.from({ length: 18 }).map((_, i) => (
                <View key={i} style={styles.dot} />
              ))}
            </View>

            <Pressable
              onLongPress={() => Share.share({ message: `Мой билет: ${t.ticketCode} — ${e.title}` }).catch(() => {})}
              style={styles.codeBox}
            >
              <Text style={styles.codeLabel}>Номер билета</Text>
              <Text style={styles.code} selectable>
                {t.ticketCode}
              </Text>
              <Text style={styles.muted}>Назови номер организатору на входе</Text>
            </Pressable>
          </Glass>
        </Animated.View>

        {active && !t.checkedInAt ? (
          <Pressable onPress={() => setConfirm(true)} style={styles.cancel} hitSlop={6}>
            <Text style={styles.cancelText}>Отменить участие</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {t.conversationId ? (
          <Btn kind="k" title="Чат события" icon={<Icon name="chat" size={20} color="#fff" />} style={{ flex: 1 }} onPress={() => router.push(`/chat/${t.conversationId}` as Href)} />
        ) : null}
        {hasCoords ? (
          <Btn kind="o" title="Как добраться" icon={<Icon name="route" size={20} color={colors.ink} />} style={{ flex: 1 }} onPress={() => openRoute(e.latitude!, e.longitude!)} />
        ) : null}
      </View>

      <ConfirmSheet
        visible={confirm}
        title="Отменить участие?"
        text="Билет перестанет действовать, место освободится для других гостей."
        confirm="Да, отменить"
        busyText="Отменяем…"
        danger
        busy={busy}
        onConfirm={cancel}
        onClose={() => setConfirm(false)}
      />
    </View>
  );
}

function Row({ icon, text }: { icon: "cal" | "pin" | "user" | "wallet"; text: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.ic}>
        <Icon name={icon} size={16} color={colors.violet} />
      </View>
      <Text style={styles.rowText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { borderRadius: 30, overflow: "hidden" },
  cover: { height: 190, justifyContent: "flex-end", padding: 16, gap: 10, overflow: "hidden" },
  badge: { position: "absolute", top: 14, left: 14, flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 12.5, ...f("600"), color: colors.ok },
  title: { fontSize: 24, lineHeight: 28, ...f("500"), color: "#fff", letterSpacing: -0.5 },
  body: { padding: 16, gap: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  ic: { width: 30, height: 30, borderRadius: 10, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontFamily: FONT, fontSize: 14.5, color: colors.ink },
  perf: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 12 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(108,59,255,0.18)" },
  codeBox: { alignItems: "center", paddingVertical: 20, paddingHorizontal: 16, gap: 4 },
  codeLabel: { fontFamily: FONT, fontSize: 13, color: colors.grey, textTransform: "uppercase", letterSpacing: 1 },
  code: { fontSize: 40, ...f("800"), color: colors.violet, letterSpacing: 4 },
  muted: { fontFamily: FONT, fontSize: 13.5, color: colors.grey, textAlign: "center" },
  cancel: { alignSelf: "center", paddingVertical: 8 },
  cancelText: { fontSize: 15, ...f("500"), color: colors.danger },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "rgba(246,242,255,0.92)" },
});
