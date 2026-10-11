import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import MapView, { Marker } from "react-native-maps";
import { Aurora, Btn, Glass, Grad, Pill, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { api, type ApiError } from "@/lib/api";
import { costShort, formatEventDate, seatsLeft } from "@/lib/format";
import { openRoute } from "@/lib/route";
import { CATEGORY_SHORT, colors, eventIcon, FONT } from "@/lib/theme";
import type { EventDetail } from "@/lib/types";

const APPLY_ERRORS: Record<string, string> = {
  event_full: "Мест больше нет",
  already_applied: "Ты уже отправил заявку",
  applications_limit_reached: "Достигнут лимит заявок на твоём тарифе",
  blocked: "Нельзя записаться на эту встречу",
};

type Detail = EventDetail & { isAnonymous?: boolean; organizerHidden?: boolean; isBusiness: boolean };

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/events/${id}`).then(setEvent).catch((e) => setError((e as Error).message));
  }, [id]);
  useEffect(load, [load]);

  // «Поделиться»: ссылка ведёт в бота, он присылает карточку встречи с кнопкой «Открыть».
  async function share() {
    if (!event) return;
    const link = `https://t.me/Mesto_people_bot?start=e_${event.id}`;
    const when = formatEventDate(event.eventDate, event.eventTime);
    await Share.share({ message: `${event.title} — ${when}. Пойдёшь со мной? 🙌\n${link}` }).catch(() => {});
  }

  async function apply() {
    setBusy(true);
    try {
      await api("/api/applications", { body: { eventId: id } });
      load();
    } catch (e) {
      const err = e as ApiError;
      Alert.alert("Не получилось", APPLY_ERRORS[err.code] ?? err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!event) {
    return (
      <View style={styles.center}>
        <Aurora />
        {error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.violet} />}
      </View>
    );
  }

  const hasCoords = event.latitude != null && event.longitude != null && !event.organizerHidden;
  const full = event.seatsTaken >= event.seatsTotal;
  const open = event.status === "published" || event.status === "closed";
  const live = Date.now() >= new Date(event.startsAt).getTime() && Date.now() < new Date(event.endsAt).getTime();
  const catLabel = event.isBusiness ? "Для бизнеса" : event.trainingType?.name ?? (event.category ? CATEGORY_SHORT[event.category.slug] ?? event.category.name : "Встреча");

  const action = (() => {
    switch (event.viewerStatus) {
      case "organizer":
        return <Btn kind="o" title="Это твоя встреча" disabled />;
      case "accepted":
        return <Btn kind="k" title="Открыть чат встречи" icon={<Icon name="chat" color="#fff" size={20} />} onPress={() => router.navigate("/(tabs)/chats")} />;
      case "pending":
        return <Btn kind="o" title="Заявка отправлена — ждём ответа" disabled />;
      case "rejected":
        return <Btn kind="o" title="Заявку не подтвердили" disabled />;
      default:
        return <Btn title={full ? "Мест нет" : "Я иду"} onPress={apply} loading={busy} disabled={full || !open} />;
    }
  })();

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {event.photoUrl ? (
            <Image source={{ uri: event.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : hasCoords ? (
            <MapView
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
              initialRegion={{ latitude: event.latitude!, longitude: event.longitude!, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
            >
              <Marker coordinate={{ latitude: event.latitude!, longitude: event.longitude! }}>
                <Image source={{ uri: eventIcon(event) }} style={{ width: 54, height: 54 }} />
              </Marker>
            </MapView>
          ) : (
            <Grad style={[StyleSheet.absoluteFill, styles.gfx]}>
              <Image source={{ uri: eventIcon(event) }} style={{ width: 200, height: 200 }} contentFit="contain" />
            </Grad>
          )}
          <LinearGradient colors={["rgba(30,10,70,0.35)", "rgba(0,0,0,0)"]} locations={[0, 0.4]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.heroTop, { top: insets.top + 8 }]}>
            <RoundBtn onPress={() => router.back()}>
              <Icon name="back" />
            </RoundBtn>
            <View style={{ flexDirection: "row", gap: 8 }}>
              {hasCoords ? (
                <RoundBtn onPress={() => openRoute(event.latitude!, event.longitude!)}>
                  <Icon name="route" />
                </RoundBtn>
              ) : null}
              <RoundBtn onPress={share}>
                <Icon name="share" />
              </RoundBtn>
            </View>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.badges}>
            <Pill label={catLabel} />
            {live ? <Pill kind="live" label="Идёт сейчас" /> : null}
            {event.isAnonymous ? <Pill kind="dark" label="Анонимно" icon={<Icon name="mask" size={14} color="#fff" />} /> : null}
          </View>
          <Text style={styles.title}>{event.title}</Text>

          <Glass strong style={styles.info}>
            <InfoRow icon="cal" text={`${formatEventDate(event.eventDate, event.eventTime)}${event.eventEndTime ? ` – ${event.eventEndTime.slice(0, 5)}` : ""}`} />
            <InfoRow
              icon="pin"
              text={event.organizerHidden ? "Место откроется после одобрения заявки" : [event.placeName, event.address].filter(Boolean).join(", ") || "Место уточняется"}
            />
            <InfoRow icon="people" text={`${event.seatsTaken + 1} из ${event.seatsTotal + 1} · ${seatsLeft(event.seatsTotal, event.seatsTaken)}`} />
            <InfoRow icon="wallet" text={costShort(event)} last />
          </Glass>

          {event.description ? (
            <Glass strong style={styles.card}>
              <Text style={styles.desc}>{event.description}</Text>
            </Glass>
          ) : null}

          {event.organizer ? (
            <Glass strong style={[styles.card, styles.org]}>
              {event.organizerHidden ? (
                <View style={styles.maskAva}>
                  <Icon name="mask" color={colors.violet} />
                </View>
              ) : (
                <Avatar uri={event.organizer.avatarUrl} name={event.organizer.name} size={52} />
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.orgName}>
                  {event.organizerHidden ? "Анонимный организатор" : `${event.organizer.name}${event.organizer.age ? `, ${event.organizer.age}` : ""}`}
                </Text>
                <Text style={styles.muted}>
                  Организатор · ★ {event.organizer.ratingAvg ? event.organizer.ratingAvg.toFixed(1) : "—"} · встреч: {event.organizer.completedMeetingsCount}
                </Text>
              </View>
            </Glass>
          ) : null}

          {event.participants.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.section}>Уже идут</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {event.participants.map((p) => (
                  <View key={p.id} style={{ alignItems: "center", width: 62, gap: 4 }}>
                    <Avatar uri={p.avatarUrl} name={p.name} size={52} />
                    <Text numberOfLines={1} style={styles.pName}>
                      {p.name}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>{action}</View>
    </View>
  );
}

function InfoRow({ icon, text, last }: { icon: "cal" | "pin" | "people" | "wallet"; text: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoSep]}>
      <View style={styles.infoIc}>
        <Icon name={icon} size={18} color={colors.violet} />
      </View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { height: 360, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden", backgroundColor: colors.violet },
  gfx: { alignItems: "center", justifyContent: "center" },
  heroTop: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  body: { padding: 20, gap: 14 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  title: { fontFamily: FONT, fontSize: 28, lineHeight: 31, fontWeight: "500", letterSpacing: -0.8, color: colors.ink },
  info: { borderRadius: 26, paddingHorizontal: 14 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  infoSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(108,59,255,0.15)" },
  infoIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, fontFamily: FONT, fontSize: 15, color: colors.ink },
  card: { borderRadius: 26, padding: 16 },
  desc: { fontFamily: FONT, fontSize: 15.5, lineHeight: 22, color: colors.ink2 },
  org: { flexDirection: "row", alignItems: "center", gap: 12 },
  maskAva: { width: 52, height: 52, borderRadius: 26, backgroundColor: "#EDE5FF", alignItems: "center", justifyContent: "center" },
  orgName: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink },
  muted: { fontFamily: FONT, fontSize: 13, color: colors.grey, marginTop: 2 },
  section: { fontFamily: FONT, fontSize: 19, fontWeight: "500", color: colors.ink, letterSpacing: -0.4 },
  pName: { fontFamily: FONT, fontSize: 12, color: colors.ink2 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(246,242,255,0.92)" },
});
