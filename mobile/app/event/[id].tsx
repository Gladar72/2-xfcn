import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useFocusEffect, router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import MapView, { Marker } from "react-native-maps";
import { Aurora, Btn, Glass, Grad, Pill, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { ConfirmSheet } from "@/components/Sheet";
import { OrganizerPanel } from "@/components/event/OrganizerPanel";
import { manageErrorText, tapOk, tapWarn } from "@/lib/feedback";
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

type Detail = EventDetail & {
  isAnonymous?: boolean;
  organizerHidden?: boolean;
  isBusiness: boolean;
  /** Приглашение от организатора (POST /api/invites/:id). */
  myInvite?: { id: string; status: string; message: string | null } | null;
  /** Напоминание за 2 часа «Идёшь?» (POST /api/events/:id/rsvp). status: sent | going | not_going. */
  myRsvp?: { id: string; status: string } | null;
  /** Только организатору: кого он позвал и что ответили. */
  invites?: { id: string; status: string; user: { id: string; name: string; avatarUrl: string | null } }[];
  autoCompleteAt?: string;
  /** Своя заявка в ожидании — чтобы её можно было отозвать. */
  myApplicationId?: string | null;
  pendingApplicationsCount?: number;
  /** Номер билета (бизнес-встреча, участник принят). */
  ticketCode?: string | null;
  /** Чат встречи — для организатора и принятых участников. */
  conversationId?: string | null;
};

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "withdraw" | "leave">(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(() => {
    api<Detail>(`/api/events/${id}`).then(setEvent).catch((e) => setError((e as Error).message));
  }, [id]);
  // Перезагружаем при каждом возвращении на экран (после редактирования, заявок, чата).
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /** «Отозвать заявку» (pending) или «Не смогу пойти» (уже участник). */
  async function runConfirm() {
    if (!event || !confirm) return;
    setConfirmBusy(true);
    try {
      if (confirm === "withdraw") {
        if (!event.myApplicationId) throw new Error("Обнови экран и попробуй ещё раз");
        await api(`/api/applications/${event.myApplicationId}`, { method: "PATCH", body: { action: "cancel" } });
      } else {
        await api(`/api/events/${event.id}/ticket`, { method: "DELETE" });
      }
      tapOk();
      setConfirm(null);
      load();
    } catch (e) {
      tapWarn();
      setConfirm(null);
      Alert.alert("Не получилось", manageErrorText(e));
    } finally {
      setConfirmBusy(false);
    }
  }

  function openChat() {
    if (event?.conversationId) router.push(`/chat/${event.conversationId}` as Href);
    else router.navigate("/(tabs)/chats");
  }

  // «Поделиться»: mesto-go.ru/e/<id> — у кого есть приложение, встреча откроется сразу в нём,
  // у остальных — страница встречи с кнопками «Открыть в приложении» и «Открыть в Telegram».
  async function share() {
    if (!event) return;
    const link = `https://mesto-go.ru/e/${event.id}`;
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

  async function answerInvite(action: "accept" | "decline") {
    if (!event?.myInvite) return;
    setBusy(true);
    try {
      const r = await api<{ message?: string }>(`/api/invites/${event.myInvite.id}`, { body: { action } });
      if (r.message) Alert.alert(action === "accept" ? "Готово" : "Понял", r.message);
    } catch (e) {
      Alert.alert("Не получилось", (e as Error).message);
    } finally {
      setBusy(false);
      load();
    }
  }

  async function answerRsvp(answer: "going" | "not_going") {
    setBusy(true);
    try {
      const r = await api<{ message?: string }>(`/api/events/${id}/rsvp`, { body: { answer } });
      if (r.message) Alert.alert(answer === "going" ? "Отлично" : "Понял", r.message);
    } catch (e) {
      Alert.alert("Не получилось", (e as Error).message);
    } finally {
      setBusy(false);
      load();
    }
  }

  function confirmNotGoing() {
    Alert.alert("Точно не сможешь?", "Тебя уберут из встречи и чата, а место освободится.", [
      { text: "Отмена", style: "cancel" },
      { text: "Не смогу", style: "destructive", onPress: () => answerRsvp("not_going") },
    ]);
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
  const started = Date.now() >= new Date(event.startsAt).getTime();
  const live = Date.now() >= new Date(event.startsAt).getTime() && Date.now() < new Date(event.endsAt).getTime();
  const catLabel = event.isBusiness ? "Для бизнеса" : event.trainingType?.name ?? (event.category ? CATEGORY_SHORT[event.category.slug] ?? event.category.name : "Встреча");

  const action = (() => {
    if (event.status === "completed") return <Btn kind="o" title="Встреча завершена" disabled />;
    if (event.status === "cancelled") return <Btn kind="o" title="Встреча отменена" disabled />;
    switch (event.viewerStatus) {
      case "organizer":
        return open ? (
          event.hasChat && event.conversationId ? (
            <Btn kind="k" title="Чат встречи" icon={<Icon name="chat" color="#fff" size={20} />} onPress={openChat} />
          ) : (
            <Btn
              kind="o"
              title="Изменить встречу"
              icon={<Icon name="edit" size={20} color={colors.ink} />}
              onPress={() => router.push({ pathname: "/create", params: { id: event.id } })}
            />
          )
        ) : (
          <Btn kind="o" title="Это твоя встреча" disabled />
        );
      case "accepted":
        if (event.isBusiness && event.ticketCode) {
          return <Btn title="Открыть билет" icon={<Icon name="doc" color="#fff" size={20} />} onPress={() => router.push(`/ticket/${event.id}` as Href)} />;
        }
        return event.hasChat ? (
          <Btn kind="k" title="Ты в деле · открыть чат" icon={<Icon name="chat" color="#fff" size={20} />} onPress={openChat} />
        ) : (
          <Btn kind="ok" title="Ты в деле!" icon={<Icon name="check" color="#fff" size={20} />} />
        );
      case "pending":
        return <Btn kind="o" title="Заявка отправлена — ждём ответа" disabled />;
      case "rejected":
        return <Btn kind="o" title="Не в этот раз" disabled />;
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

          {event.myInvite?.status === "pending" && event.viewerStatus !== "accepted" && event.viewerStatus !== "organizer" && open ? (
            <Glass strong style={styles.banner}>
              <View style={styles.bannerHead}>
                <View style={styles.infoIc}>
                  <Icon name="gift" size={18} color={colors.violet} />
                </View>
                <Text style={styles.bannerTitle}>Тебя пригласили на эту встречу</Text>
              </View>
              {event.myInvite.message ? <Text style={styles.bannerText}>«{event.myInvite.message}»</Text> : null}
              <Text style={styles.bannerText}>Примешь — сразу попадёшь в участники и чат встречи, без заявки.</Text>
              <View style={styles.bannerBtns}>
                <Btn title="Пойду" onPress={() => answerInvite("accept")} loading={busy} style={{ flex: 1 }} />
                <Btn kind="o" title="Не смогу" onPress={() => answerInvite("decline")} disabled={busy} style={{ flex: 1 }} />
              </View>
            </Glass>
          ) : null}

          {event.myRsvp?.status === "sent" && event.viewerStatus === "accepted" && open ? (
            <Glass strong style={styles.banner}>
              <View style={styles.bannerHead}>
                <View style={styles.infoIc}>
                  <Icon name="clock" size={18} color={colors.violet} />
                </View>
                <Text style={styles.bannerTitle}>Встреча совсем скоро — ты идёшь?</Text>
              </View>
              <Text style={styles.bannerText}>Организатору важно знать, сколько человек придёт.</Text>
              <View style={styles.bannerBtns}>
                <Btn title="Иду" onPress={() => answerRsvp("going")} loading={busy} style={{ flex: 1 }} />
                <Btn kind="o" title="Не смогу" onPress={confirmNotGoing} disabled={busy} style={{ flex: 1 }} />
              </View>
            </Glass>
          ) : null}

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
            <Pressable disabled={event.organizerHidden} onPress={() => router.push(`/person/${event.organizer!.id}` as Href)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
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
            </Pressable>
          ) : null}

          {event.viewerStatus === "organizer" ? (
            <OrganizerPanel event={event} onChanged={load} />
          ) : event.participants.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.section}>Уже идут</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {event.participants.map((p) => (
                  <Pressable key={p.id} onPress={() => router.push(`/person/${p.id}` as Href)} style={{ alignItems: "center", width: 62, gap: 4 }}>
                    <Avatar uri={p.avatarUrl} name={p.name} size={52} />
                    <Text numberOfLines={1} style={styles.pName}>
                      {p.name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}

          {event.viewerStatus === "pending" && open && event.myApplicationId ? (
            <Pressable onPress={() => setConfirm("withdraw")} style={styles.quietLink} hitSlop={6}>
              <Text style={styles.quietText}>Отозвать заявку</Text>
            </Pressable>
          ) : null}
          {event.viewerStatus === "accepted" && open && !started ? (
            <Pressable onPress={() => setConfirm("leave")} style={styles.quietLink} hitSlop={6}>
              <Text style={styles.quietText}>{event.isBusiness ? "Отменить участие" : "Не смогу пойти"}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>

      <ConfirmSheet
        visible={confirm === "withdraw"}
        title="Отозвать заявку?"
        text="Организатор её больше не увидит. Подать заново можно в любой момент, пока есть места."
        confirm="Да, отозвать"
        busyText="Отзываем…"
        danger
        busy={confirmBusy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />
      <ConfirmSheet
        visible={confirm === "leave"}
        title={event.isBusiness ? "Отменить участие?" : "Точно не сможешь?"}
        text={
          event.isBusiness
            ? "Билет перестанет действовать, место освободится для других гостей."
            : "Тебя уберут из встречи и чата, а место освободится. Организатор получит уведомление."
        }
        confirm={event.isBusiness ? "Да, отменить" : "Не смогу"}
        busyText="Секунду…"
        danger
        busy={confirmBusy}
        onConfirm={runConfirm}
        onClose={() => setConfirm(null)}
      />

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
  banner: { borderRadius: 26, padding: 16, gap: 10 },
  bannerHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  bannerTitle: { flex: 1, fontFamily: FONT, fontSize: 17, fontWeight: "500", color: colors.ink, letterSpacing: -0.3 },
  bannerText: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.ink2 },
  bannerBtns: { flexDirection: "row", gap: 10, marginTop: 2 },
  quietLink: { alignSelf: "center", paddingVertical: 10 },
  quietText: { fontFamily: FONT, fontSize: 15, fontWeight: "500", color: colors.danger },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(246,242,255,0.92)" },
});
