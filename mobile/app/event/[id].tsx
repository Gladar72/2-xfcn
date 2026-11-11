import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useFocusEffect, router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";
import { MAP_STYLE } from "@/lib/map";
import { Aurora, Btn, Glass, Grad, Pill, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { ConfirmSheet } from "@/components/Sheet";
import { OrganizerPanel } from "@/components/event/OrganizerPanel";
import { ShareSheet } from "@/components/event/ShareSheet";
import { manageErrorText, tapOk, tapWarn } from "@/lib/feedback";
import { api, type ApiError } from "@/lib/api";
import { costShort, formatEventDate, seatsLeft } from "@/lib/format";
import { openRoute } from "@/lib/route";
import { CATEGORY_SHORT, colors, eventIcon, FONT, f } from "@/lib/theme";
import { anonymousTag, type EventDetail } from "@/lib/types";
import { useGuide } from "@/lib/guide";

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
  useGuide("event");
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<null | "withdraw" | "leave">(null);
  const [shareOpen, setShareOpen] = useState(false);
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

  // «Поделиться»: шторка со сторис-картинкой, Telegram, Instagram, WhatsApp, VK.
  // Ссылка mesto-go.ru/e/<id> — у кого есть приложение, встреча откроется сразу в нём.
  function share() {
    if (event) setShareOpen(true);
  }

  async function apply() {
    setBusy(true);
    try {
      await api("/api/applications", { body: { eventId: id } });
      load();
    } catch (e) {
      const err = e as ApiError;
      if (err.code === "applications_limit_reached") {
        Alert.alert("Лимит заявок", "На твоём тарифе заявки закончились. Перейди на тариф побольше — и откликайся дальше.", [
          { text: "Позже", style: "cancel" },
          { text: "Тарифы", onPress: () => router.push("/subscription") },
        ]);
      } else {
        Alert.alert("Не получилось", APPLY_ERRORS[err.code] ?? err.message);
      }
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
        return <Btn kind="w" title={full ? "Мест нет" : "Я иду"} onPress={apply} loading={busy} disabled={full || !open} />;
    }
  })();

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      {/* Как в прототипе: тёмная страница, обложка размыта на фоне. */}
      {event.photoUrl ? <Image source={{ uri: event.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" blurRadius={40} /> : null}
      <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(23,20,31,0.72)" }]} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {event.photoUrl ? (
            <Image source={{ uri: event.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : hasCoords ? (
            <View style={StyleSheet.absoluteFill} pointerEvents="none">
              <Map
                style={StyleSheet.absoluteFill}
                mapStyle={MAP_STYLE}
                logo={false}
                compass={false}
                dragPan={false}
                touchZoom={false}
                doubleTapZoom={false}
                touchRotate={false}
                touchPitch={false}
              >
                <Camera initialViewState={{ center: [event.longitude!, event.latitude!], zoom: 15 }} />
                <Marker lngLat={[event.longitude!, event.latitude!]} anchor="bottom">
                  <Image source={{ uri: eventIcon(event) }} style={{ width: 54, height: 54 }} />
                </Marker>
              </Map>
            </View>
          ) : (
            <Grad style={[StyleSheet.absoluteFill, styles.gfx]}>
              <Image source={{ uri: eventIcon(event) }} style={{ width: 200, height: 200 }} contentFit="contain" />
            </Grad>
          )}
          <LinearGradient colors={["rgba(23,20,31,0.35)", "rgba(23,20,31,0)", "rgba(23,20,31,0.15)", "rgba(23,20,31,0.95)"]} locations={[0, 0.25, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.heroText}>
            <View style={styles.badges}>
              <View style={styles.chip}>
                {live ? <View style={styles.liveDot} /> : <Image source={{ uri: eventIcon(event) }} style={{ width: 18, height: 18 }} tintColor="#fff" />}
                <Text style={styles.chipText}>
                  {live ? "Идёт сейчас · " : ""}
                  {catLabel}
                  {event.isAnonymous ? ` · ${anonymousTag(event.organizer?.gender).toLowerCase()}` : event.isBusiness ? "" : " · личная встреча"}
                </Text>
              </View>
            </View>
            <Text style={styles.title}>{event.title}</Text>
          </View>
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

          {/* Плитки как в прототипе: Когда · Мест · Расходы · Чат */}
          <View style={styles.tiles}>
            <View style={[styles.tile, { flex: 1.25 }]}>
              <View style={styles.tileHead}><Icon name="cal" size={13} color="rgba(255,255,255,0.6)" /><Text style={styles.tileLabel}>Когда</Text></View>
              <Text style={styles.tileVal} numberOfLines={1}>{formatEventDate(event.eventDate, event.eventTime)}</Text>
              {event.eventEndTime ? <Text style={styles.tileSub}>до {event.eventEndTime.slice(0, 5)}</Text> : null}
            </View>
            <View style={styles.tile}>
              <View style={styles.tileHead}><Icon name="people" size={13} color="rgba(255,255,255,0.6)" /><Text style={styles.tileLabel}>Мест</Text></View>
              <Text style={styles.tileVal}>{event.seatsTaken + 1} из {event.seatsTotal + 1}</Text>
            </View>
            <View style={styles.tile}>
              <View style={styles.tileHead}><Icon name="wallet" size={13} color="rgba(255,255,255,0.6)" /><Text style={styles.tileLabel}>{event.isBusiness ? "Билет" : "Расходы"}</Text></View>
              <Text style={styles.tileVal} numberOfLines={2}>{costShort(event)}</Text>
            </View>
            {event.hasChat && event.conversationId && (event.viewerStatus === "organizer" || event.viewerStatus === "accepted") ? (
              <Pressable onPress={openChat} style={[styles.tile, styles.tileChat]}>
                <Icon name="chat" size={20} color="#fff" />
                <Text style={styles.tileLabel}>Чат</Text>
              </Pressable>
            ) : null}
          </View>
          <View style={[styles.card, { paddingVertical: 4 }]}>
            <InfoRow
              icon="pin"
              text={event.organizerHidden ? "Место откроется после одобрения заявки" : (event.address && event.placeName && event.address.toLowerCase().startsWith(event.placeName.toLowerCase()) ? event.address : [event.placeName, event.address].filter(Boolean).join(", ")) || "Место уточняется"}
              last
            />
          </View>

          {event.description ? (
            <View style={styles.card}>
              <Text style={styles.cardH}>О встрече</Text>
              <Text style={styles.desc}>{event.description}</Text>
            </View>
          ) : null}

          {event.organizer ? (
            <Pressable disabled={event.organizerHidden} onPress={() => router.push(`/person/${event.organizer!.id}` as Href)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <View style={[styles.card, styles.org]}>
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
            </View>
            </Pressable>
          ) : null}

          {event.isAnonymous && event.viewerStatus !== "organizer" && event.viewerStatus !== "accepted" ? (
            <View style={styles.card}>
              <Text style={styles.muted}>
                Организатор увидит твоё фото и профиль сразу после отправки заявки. Его профиль и точный адрес откроются тебе после одобрения.
              </Text>
            </View>
          ) : null}

          {event.viewerStatus === "organizer" ? (
            <OrganizerPanel event={event} onChanged={load} />
          ) : event.participants.length > 0 ? (
            <View style={{ gap: 10 }}>
              <Text style={styles.section}>Идут · {event.participants.length + 1}</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12 }}>
                {event.participants.map((p, i) => (
                  // Анонимная встреча: других участников видно только условно — профиль не открывается.
                  <Pressable key={p.anonymous ? `anon-${i}` : p.id} disabled={!!p.anonymous} onPress={() => router.push(`/person/${p.id}` as Href)} style={{ alignItems: "center", width: 62, gap: 4 }}>
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

      <ShareSheet
        visible={shareOpen}
        onClose={() => setShareOpen(false)}
        eventId={event.id}
        title={event.title}
        when={formatEventDate(event.eventDate, event.eventTime)}
        version={`${event.photoUrl ?? ""}|${event.placeName ?? ""}|${event.seatsTaken}`}
      />

      {/* Затемнение под кнопкой, чтобы текст страницы не просвечивал. */}
      <LinearGradient pointerEvents="none" colors={["rgba(23,20,31,0)", "rgba(23,20,31,0.92)", "#17141F"]} locations={[0, 0.45, 1]} style={[styles.fade, { height: 120 + insets.bottom }]} />
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Pressable onPress={share} style={styles.shareBtn} accessibilityLabel="Поделиться">
          <Icon name="share" color="#fff" size={20} />
        </Pressable>
        <View style={{ flex: 1 }}>{action}</View>
      </View>
    </View>
  );
}

function InfoRow({ icon, text, last }: { icon: "cal" | "pin" | "people" | "wallet"; text: string; last?: boolean }) {
  return (
    <View style={[styles.infoRow, !last && styles.infoSep]}>
      <View style={styles.infoIc}>
        <Icon name={icon} size={18} color="#fff" />
      </View>
      <Text style={styles.infoText}>{text}</Text>
    </View>
  );
}

const W = "#fff";
const W60 = "rgba(255,255,255,0.6)";
const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { height: 520, overflow: "hidden", backgroundColor: colors.ink },
  heroText: { position: "absolute", left: 20, right: 20, bottom: 18, gap: 10 },
  gfx: { alignItems: "center", justifyContent: "center" },
  heroTop: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  body: { paddingHorizontal: 16, paddingTop: 6, gap: 10 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(23,20,31,0.38)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  chipText: { color: W, fontSize: 13, ...f("500") },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ok },
  title: { fontSize: 40, lineHeight: 42, ...f("300"), letterSpacing: -1.6, color: W },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minHeight: 74, borderRadius: 20, padding: 10, gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  tileChat: { flex: 0, width: 58, alignItems: "center", justifyContent: "center" },
  tileHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  tileLabel: { fontFamily: FONT, fontSize: 11.5, color: W60 },
  tileVal: { fontSize: 15, ...f("500"), color: W },
  tileSub: { fontFamily: FONT, fontSize: 11, color: W60 },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  infoSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.15)" },
  infoIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, fontFamily: FONT, fontSize: 15, color: W },
  card: { borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  cardH: { fontSize: 15, ...f("500"), color: W, marginBottom: 6 },
  desc: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: "rgba(255,255,255,0.82)" },
  org: { flexDirection: "row", alignItems: "center", gap: 12 },
  maskAva: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  orgName: { fontSize: 16, ...f("500"), color: W },
  muted: { fontFamily: FONT, fontSize: 13, color: W60, marginTop: 2 },
  section: { fontSize: 15, ...f("500"), color: W },
  pName: { fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.75)" },
  banner: { borderRadius: 26, padding: 16, gap: 10 },
  bannerHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  bannerTitle: { flex: 1, fontSize: 17, ...f("500"), color: colors.ink, letterSpacing: -0.3 },
  bannerText: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.ink2 },
  bannerBtns: { flexDirection: "row", gap: 10, marginTop: 2 },
  quietLink: { alignSelf: "center", paddingVertical: 10 },
  quietText: { fontSize: 15, ...f("500"), color: "#FF9A9A" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footer: { position: "absolute", left: 12, right: 12, bottom: 0, flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 10 },
  shareBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
});
