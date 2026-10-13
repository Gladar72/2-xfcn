import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Aurora, Glass, Mosya, RoundBtn } from "@/components/brand";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { PLAN_NAME, untilLabel, type Subscription } from "@/lib/subscription";
import { colors, FONT } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";

/** Заполненность профиля — как в мини-приложении: 30 + 15 за фото (до 3) + 10 за «о себе» + 15 за 3+ интереса. */
function completeness(me: MyProfile): { pct: number; tip: string } {
  const photos = Math.min(3, me.photos?.length ?? (me.avatarUrl ? 1 : 0));
  const bio = me.bio?.trim() ? 10 : 0;
  const ints = (me.interests?.length ?? 0) >= 3 ? 15 : 0;
  const pct = 30 + 15 * photos + bio + ints;
  const tip = pct >= 100 ? "отлично!" : photos < 3 ? `добавь ещё ${3 - photos} фото` : !bio ? "добавь о себе" : "добавь интересы";
  return { pct, tip };
}

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<MyProfile | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const bar = useRef(new Animated.Value(0)).current;

  useFocusEffect(
    useCallback(() => {
      api<MyProfile>("/api/me/profile").then(setMe).catch(() => {});
      api<Subscription>("/api/subscriptions").then(setSub).catch(() => {});
    }, [])
  );

  const pct = me ? completeness(me).pct : 0;
  const tip = me ? completeness(me).tip : "";
  useEffect(() => {
    if (me) Animated.timing(bar, { toValue: pct, duration: 700, useNativeDriver: false }).start();
  }, [me, pct, bar]);

  const rating = me?.ratingAvg ? me.ratingAvg.toFixed(1).replace(".", ",") : null;

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 120, gap: 12 }} showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <Text style={styles.h1}>Профиль</Text>
          <RoundBtn onPress={() => router.push("/settings")}>
            <Icon name="gear" />
          </RoundBtn>
        </View>

        <View style={styles.card}>
          <LinearGradient colors={["#6C3BFF", "#A24DFF", "#FF6FA0"]} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
          <Mosya pose="glasses" size={96} style={styles.mosya} />
          <Pressable onPress={() => router.push("/profile-edit")} style={styles.avaRing}>
            <Avatar uri={me?.avatarUrl} name={me?.name} size={96} />
            <View style={styles.camBadge}>
              <Icon name="camera" size={14} color={colors.violet} />
            </View>
          </Pressable>
          <Text style={styles.name}>{me ? `${me.name}, ${me.age}` : " "}</Text>
          <Text style={styles.city}>
            {me?.city ?? ""}
            {me && rating ? ` · ★ ${rating} · ${me.ratingCount} ${plural(me.ratingCount, "оценка", "оценки", "оценок")}` : ""}
          </Text>
          {me?.bio ? (
            <Text style={styles.bio} numberOfLines={3}>
              {me.bio}
            </Text>
          ) : null}

          {me ? (
            <View style={styles.fill}>
              <View style={styles.fillRow}>
                <Text style={styles.fillText}>Профиль заполнен на {Math.min(100, pct)}%</Text>
                <Text style={styles.fillTip}>{tip}</Text>
              </View>
              <View style={styles.track}>
                <Animated.View style={[styles.trackOn, { width: bar.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"], extrapolate: "clamp" }) }]} />
              </View>
            </View>
          ) : null}

          <View style={styles.btns}>
            <Pressable onPress={() => me && router.push(`/person/${me.id}?self=1` as Href)} style={({ pressed }) => [styles.ghost, pressed && { opacity: 0.8 }]}>
              <Icon name="eye" size={16} color="#fff" />
              <Text style={styles.ghostText}>Как меня видят</Text>
            </Pressable>
            <Pressable onPress={() => router.push("/profile-edit")} style={({ pressed }) => [styles.solid, pressed && { opacity: 0.85 }]}>
              <Icon name="edit" size={16} color={colors.violet} />
              <Text style={styles.solidText}>Редактировать</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.stats}>
          <Stat value={me?.eventsOrganizedCount ?? 0} label="создано" />
          <Stat value={me?.eventsAttendedCount ?? 0} label="посещено" />
          <Stat value={me?.completedMeetingsCount ?? 0} label="состоялось" />
        </View>

        {sub ? (
          <Pressable onPress={() => router.push("/subscription")}>
            <Glass strong style={styles.sub}>
              <View style={[styles.rowIc, { backgroundColor: sub.active ? "rgba(34,181,115,0.14)" : colors.lav }]}>
                <Icon name="wallet" size={19} color={sub.active ? colors.ok : colors.violet} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowText}>{sub.active ? `Тариф «${PLAN_NAME[sub.plan ?? ""] ?? "—"}»` : "Нет подписки"}</Text>
                <Text style={styles.muted}>
                  {sub.active
                    ? `Активна до ${untilLabel(sub.periodEnd)}${sub.events?.limit ? ` · ${sub.events.used} из ${sub.events.limit} встреч` : ""}`
                    : "Подключи, чтобы создавать свои встречи"}
                </Text>
              </View>
            </Glass>
          </Pressable>
        ) : null}

        <Glass strong style={styles.list}>
          <Row icon="cal" label="Мои встречи" onPress={() => router.push("/my-events")} />
          <Row icon="people" label="Люди рядом" onPress={() => router.push("/people")} />
          <Row icon="bell" label="Уведомления" onPress={() => router.push("/notifications")} />
          <Row icon="star" label="Отзывы после встреч" onPress={() => router.push("/reviews")} />
          <Row icon="heart" label="Мои интересы" onPress={() => router.push("/interests")} />
          <Row icon="gift" label="Партнёрская программа" onPress={() => router.push("/partner")} />
          <Row icon="help" label="Помощь" onPress={() => router.push("/support")} />
          <Row icon="gear" label="Настройки" onPress={() => router.push("/settings")} last />
        </Glass>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <Glass strong style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.muted}>{label}</Text>
    </Glass>
  );
}

function Row({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowSep, pressed && { opacity: 0.7 }]}>
      <View style={styles.rowIc}>
        <Icon name={icon} size={19} color={colors.violet} />
      </View>
      <Text style={styles.rowText} numberOfLines={1}>
        {label}
      </Text>
      <Icon name="chev" size={18} color={colors.grey} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  h1: { fontFamily: FONT, fontSize: 30, fontWeight: "500", color: colors.ink, letterSpacing: -0.8 },
  card: { borderRadius: 32, padding: 20, paddingTop: 24, alignItems: "center", gap: 4, overflow: "hidden" },
  mosya: { position: "absolute", right: -6, top: -4, opacity: 0.95 },
  avaRing: { padding: 4, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.35)" },
  camBadge: { position: "absolute", right: 2, bottom: 2, width: 28, height: 28, borderRadius: 14, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  name: { fontFamily: FONT, fontSize: 24, fontWeight: "500", color: "#fff", marginTop: 8, letterSpacing: -0.5 },
  city: { fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.88)", textAlign: "center" },
  bio: { fontFamily: FONT, fontSize: 14, color: "#fff", textAlign: "center", marginTop: 6, opacity: 0.95 },
  fill: { alignSelf: "stretch", marginTop: 14, gap: 6 },
  fillRow: { flexDirection: "row", justifyContent: "space-between" },
  fillText: { fontFamily: FONT, fontSize: 13, color: "#fff", fontWeight: "500" },
  fillTip: { fontFamily: FONT, fontSize: 13, color: "rgba(255,255,255,0.85)" },
  track: { height: 8, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.25)", overflow: "hidden" },
  trackOn: { height: 8, borderRadius: 4, backgroundColor: "#fff" },
  btns: { flexDirection: "row", gap: 8, alignSelf: "stretch", marginTop: 14 },
  ghost: { flex: 1, height: 44, borderRadius: 999, borderWidth: 1, borderColor: "rgba(255,255,255,0.6)", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  ghostText: { fontFamily: FONT, fontSize: 14.5, fontWeight: "600", color: "#fff" },
  solid: { flex: 1, height: 44, borderRadius: 999, backgroundColor: "#fff", flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  solidText: { fontFamily: FONT, fontSize: 14.5, fontWeight: "600", color: colors.violet },
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderRadius: 22, paddingVertical: 12, alignItems: "center" },
  statValue: { fontFamily: FONT, fontSize: 22, fontWeight: "500", color: colors.ink },
  muted: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, marginTop: 1 },
  sub: { borderRadius: 24, padding: 12, flexDirection: "row", alignItems: "center", gap: 12 },
  list: { borderRadius: 26, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  rowSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(108,59,255,0.15)" },
  rowIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontFamily: FONT, fontSize: 15, color: colors.ink },
});
