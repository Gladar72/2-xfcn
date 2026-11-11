import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Glass, RoundBtn } from "@/components/brand";
import { Image } from "expo-image";
import { Icon, type IconName } from "@/components/Icon";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { PLAN_NAME, PLAN_PRICE_RUB, untilLabel, type Subscription } from "@/lib/subscription";
import { interestIcon } from "@/lib/interests";
import { CAN_PAY } from "@/lib/store";
import { colors, FONT, SERIF, f } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";
import { useGuide } from "@/lib/guide";

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
  useGuide("profile");
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<MyProfile | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<MyProfile>("/api/me/profile").then(setMe).catch(() => {});
      api<Subscription>("/api/subscriptions").then(setSub).catch(() => {});
    }, [])
  );

  const pct = me ? completeness(me).pct : 0;
  const tip = me ? completeness(me).tip : "";

  const rating = me?.ratingAvg ? me.ratingAvg.toFixed(1).replace(".", ",") : null;

  const photos = me ? (me.photos?.length ? me.photos : me.avatarUrl ? [me.avatarUrl] : []) : [];
  const ints = me?.interests ?? [];
  const used = sub?.events?.used ?? 0;
  const limit = sub?.events?.limit ?? null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }} showsVerticalScrollIndicator={false}>
        {/* Как в прототипе: фото на весь верх растворяется в перламутре, имя по центру. */}
        <View style={styles.hero}>
          {me?.avatarUrl ? (
            <Image source={{ uri: me.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <LinearGradient colors={["#3F3A4E", "#AAA0FF"]} style={StyleSheet.absoluteFill} />
          )}
          <LinearGradient
            colors={["rgba(23,20,31,0.3)", "rgba(244,242,248,0)", "rgba(244,242,248,0)", "rgba(244,242,248,0.85)", colors.milk]}
            locations={[0, 0.22, 0.55, 0.86, 1]}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.heroTop, { top: insets.top + 8 }]}>
            <RoundBtn onPress={() => me && router.push(`/person/${me.id}?self=1` as Href)}>
              <Icon name="eye" />
            </RoundBtn>
            <RoundBtn onPress={() => router.push("/settings")}>
              <Icon name="gear" />
            </RoundBtn>
          </View>
        </View>

        <View style={styles.head}>
          <Text style={styles.name} numberOfLines={2}>
            {me ? `${me.name}, ${me.age}` : " "}
          </Text>
          <Text style={styles.meta}>
            {[me?.city, me ? `${me.completedMeetingsCount} ${plural(me.completedMeetingsCount, "встреча", "встречи", "встреч")}` : null, rating ? `${rating} ★` : null].filter(Boolean).join(" · ")}
          </Text>
          {ints.length ? (
            <View style={styles.chips}>
              {ints.slice(0, 6).map((i) => (
                <View key={i.id} style={styles.chip}>
                  <Image source={{ uri: interestIcon(i.name) }} style={{ width: 20, height: 20 }} contentFit="contain" />
                  <Text style={styles.chipText}>{i.name}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {sub ? (
            <Pressable onPress={() => router.push("/subscription")}>
              <Glass strong style={styles.plan}>
                <View style={styles.planRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.planSmall}>ТВОЙ ТАРИФ</Text>
                    <Text style={styles.planName}>
                      {sub.active ? PLAN_NAME[sub.plan ?? ""] ?? "—" : "Нет подписки"}
                      {sub.active && sub.plan && CAN_PAY ? <Text style={styles.planPrice}>{`  ${PLAN_PRICE_RUB[sub.plan]} ₽/мес`}</Text> : null}
                    </Text>
                  </View>
                  <View style={styles.planBtn}>
                    <Text style={styles.planBtnText}>{!CAN_PAY ? "Подробнее" : sub.active ? "Сменить" : "Выбрать"}</Text>
                  </View>
                </View>
                {sub.active ? (
                  <>
                    <View style={styles.track}>
                      <View style={[styles.trackOn, { width: `${limit ? Math.min(100, (used / limit) * 100) : 100}%` }]} />
                    </View>
                    <Text style={styles.muted}>
                      {limit ? `Встречи ${used} из ${limit}` : "Встречи без ограничений"}
                      {sub.periodEnd ? ` · до ${untilLabel(sub.periodEnd)}` : ""}
                    </Text>
                  </>
                ) : (
                  <Text style={styles.muted}>Подключи, чтобы создавать свои встречи</Text>
                )}
              </Glass>
            </Pressable>
          ) : null}

          <Pressable onPress={() => router.push("/profile-edit")} style={({ pressed }) => [styles.editBtn, pressed && { opacity: 0.85 }]}>
            <Text style={styles.editText}>Редактировать профиль</Text>
          </Pressable>
          {me && pct < 100 ? <Text style={[styles.muted, { textAlign: "center" }]}>Профиль заполнен на {pct}% — {tip}</Text> : null}

          <View style={styles.sectionRow}>
            <Text style={styles.section}>
              Мои <Text style={styles.sectionEm}>фото</Text>
            </Text>
            <Pressable onPress={() => router.push("/profile-edit")} style={styles.smallPill}>
              <Text style={styles.smallPillText}>Изменить</Text>
            </Pressable>
          </View>
          <View style={styles.grid}>
            {[0, 1, 2].map((i) =>
              photos[i] ? (
                <View key={i} style={styles.gridCell}>
                  <Image source={{ uri: photos[i] }} style={StyleSheet.absoluteFill} contentFit="cover" />
                </View>
              ) : (
                <Pressable key={i} onPress={() => router.push("/profile-edit")} style={[styles.gridCell, styles.gridAdd]}>
                  <Icon name="plus" size={22} color={colors.grey} />
                </Pressable>
              )
            )}
          </View>

          <Glass strong style={styles.list}>
            <Row icon="cal" label="Мои встречи" onPress={() => router.push("/my-events")} />
            <Row icon="people" label="Люди рядом" onPress={() => router.push("/people")} />
            <Row icon="bell" label="Уведомления" onPress={() => router.push("/notifications")} />
            <Row icon="star" label="Отзывы после встреч" onPress={() => router.push("/reviews")} />
            <Row icon="heart" label="Мои интересы" onPress={() => router.push("/interests")} />
            <Row icon="gift" label="Партнёрская программа" onPress={() => router.push("/partner")} />
            <Row icon="help" label="Помощь" onPress={() => router.push("/support")} last />
          </Glass>
        </View>
      </ScrollView>
    </View>
  );
}

function Row({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowSep, pressed && { opacity: 0.7 }]}>
      <View style={styles.rowIc}>
        <Icon name={icon} size={19} color={colors.ink} />
      </View>
      <Text style={styles.rowText} numberOfLines={1}>
        {label}
      </Text>
      <Icon name="chev" size={18} color={colors.grey} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: { height: 420, backgroundColor: colors.ink, overflow: "hidden" },
  heroTop: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  head: { alignItems: "center", paddingHorizontal: 20, marginTop: -110, gap: 8 },
  name: { fontSize: 42, lineHeight: 46, ...f("300"), color: colors.ink, letterSpacing: -1.6, textAlign: "center" },
  meta: { fontFamily: FONT, fontSize: 14, color: colors.grey },
  chips: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 4 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 999, paddingLeft: 8, paddingRight: 12, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(23,20,31,0.06)" },
  chipText: { fontFamily: FONT, fontSize: 14, color: colors.ink },
  body: { paddingHorizontal: 16, paddingTop: 18, gap: 12 },
  plan: { borderRadius: 24, padding: 16, gap: 10 },
  planRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  planSmall: { fontSize: 11, ...f("500"), color: colors.grey, letterSpacing: 1 },
  planName: { fontSize: 26, ...f("300"), color: colors.ink, letterSpacing: -0.6, marginTop: 2 },
  planPrice: { fontFamily: FONT, fontSize: 14, color: colors.grey, letterSpacing: 0 },
  planBtn: { height: 38, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colors.ink, justifyContent: "center" },
  planBtnText: { color: "#fff", fontSize: 14, ...f("500") },
  track: { height: 5, borderRadius: 3, backgroundColor: "rgba(23,20,31,0.1)", overflow: "hidden" },
  trackOn: { height: 5, borderRadius: 3, backgroundColor: colors.ink },
  editBtn: { height: 54, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.85)", borderWidth: 1, borderColor: "rgba(23,20,31,0.08)", alignItems: "center", justifyContent: "center" },
  editText: { fontSize: 16, ...f("500"), color: colors.ink },
  sectionRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 8 },
  section: { fontSize: 26, ...f("300"), color: colors.ink, letterSpacing: -0.6 },
  sectionEm: { fontFamily: SERIF, fontSize: 27 },
  smallPill: { height: 34, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.85)", justifyContent: "center" },
  smallPillText: { fontSize: 13.5, ...f("500"), color: colors.ink },
  grid: { flexDirection: "row", gap: 8 },
  gridCell: { flex: 1, aspectRatio: 0.78, borderRadius: 18, overflow: "hidden", backgroundColor: colors.pearl2 },
  gridAdd: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderStyle: "dashed", borderColor: "rgba(23,20,31,0.18)", backgroundColor: "rgba(255,255,255,0.5)" },
  muted: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  list: { borderRadius: 26, paddingHorizontal: 12, marginTop: 6 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  rowSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(23,20,31,0.15)" },
  rowIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontFamily: FONT, fontSize: 15, color: colors.ink },
});
