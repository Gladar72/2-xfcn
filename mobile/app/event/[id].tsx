import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import * as Clipboard from "expo-clipboard";
import { Sheet } from "@/components/Sheet";
import { useLocalSearchParams, useFocusEffect, router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { EventPin } from "@/components/map/EventPin";
import { Camera, Map, Marker } from "@maplibre/maplibre-react-native";
import { MAP_STYLE } from "@/lib/map";
import { coverUri } from "@/lib/covers";
import { Aurora, Btn, Glass, Grad, Pill, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { ConfirmSheet } from "@/components/Sheet";
import { OrganizerQuestion } from "@/components/event/OrganizerQuestion";
import { OrganizerPanel } from "@/components/event/OrganizerPanel";
import { ShareSheet } from "@/components/event/ShareSheet";
import { manageErrorText, tapOk, tapWarn } from "@/lib/feedback";
import { api, type ApiError } from "@/lib/api";
import { costShort, formatEventDate, seatsLeft } from "@/lib/format";
import { openRoute } from "@/lib/route";
import { FireButton } from "@/components/Fire";
import { CATEGORY_SHORT, colors, eventIcon, FONT, SERIF, f } from "@/lib/theme";
import { anonymousTag, type EventDetail } from "@/lib/types";
import { useGuide } from "@/lib/guide";
import { Creature } from "@/components/k/Creature";
import { FadeImage } from "@/components/k/FadeImage";
import { Press } from "@/components/k/Press";

const APPLY_ERRORS: Record<string, string> = {
  event_full: "Мест больше нет",
  already_applied: "Ты уже отправил заявку",
  applications_limit_reached: "Достигнут лимит заявок на твоём тарифе",
  blocked: "Нельзя записаться на эту встречу",
};

type Detail = EventDetail & {
  fireCount?: number;
  myFire?: boolean;
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
  const { width, height } = useWindowDimensions();
  const coverHeight = Math.max(560, Math.min(height * 0.78, 680));
  const titleOffset = Math.max(400, Math.min(height * 0.62, 540));
  const previewSize = Math.max(24, Math.min(52, Math.floor((width - 68 - 5 * 8) / 6)));
  const [joinPhase, setJoinPhase] = useState<"confirm" | "done" | null>(null);
  const applying = useRef(false);
  const removing = useRef(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [whoOpen, setWhoOpen] = useState(false);
  const [whoCount, setWhoCount] = useState(30);
  const [questionOpen, setQuestionOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const load = useCallback(() => {
    return api<Detail>(`/api/events/${id}`).then(setEvent).catch((e) => setError((e as Error).message));
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

  function askRemove(person: { id: string; name: string }) {
    if (!event || event.viewerStatus !== "organizer" || removing.current) return;
    Alert.alert(`Убрать ${person.name}?`, "Человек выйдет из встречи и чата, место освободится.", [
      { text: "Отмена", style: "cancel" },
      { text: "Убрать", style: "destructive", onPress: async () => {
        if (removing.current) return;
        removing.current = true;
        setRemovingId(person.id);
        try {
          await api(`/api/events/${id}/members/${person.id}`, { method: "DELETE" });
          tapOk();
          await load();
        } catch (e) {
          Alert.alert("Не получилось", manageErrorText(e));
        } finally {
          removing.current = false;
          setRemovingId(null);
        }
      } },
    ]);
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
    if (applying.current) return;
    applying.current = true;
    setBusy(true);
    try {
      await api("/api/applications", { body: { eventId: id } });
      setEvent((previous) => previous ? { ...previous, viewerStatus: "pending" } : null);
      setJoinPhase("done");
      tapOk();
      await load();
    } catch (e) {
      setJoinPhase(null);
      const err = e as ApiError;
      if (err.code === "already_applied") await load();
      if (err.code === "applications_limit_reached") {
        Alert.alert("Лимит заявок", "На твоём тарифе заявки закончились. Перейди на тариф побольше — и откликайся дальше.", [
          { text: "Позже", style: "cancel" },
          { text: "Тарифы", onPress: () => router.push("/subscription") },
        ]);
      } else {
        Alert.alert("Не получилось", APPLY_ERRORS[err.code] ?? err.message);
      }
    } finally {
      applying.current = false;
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

  const contactLabel = event.isBusiness && !event.hasChat
    ? event.viewerStatus === "organizer" ? "Личные сообщения" : "Задать вопрос организатору"
    : event.isBusiness ? "Чат события" : "Чат встречи";

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
        return <Press style={styles.pendingCta} accessibilityLabel="Ждём ответа" onPress={() => Alert.alert("Заявка отправлена", "Ждём ответа организатора")}>
          <Icon name="clock" size={19} color="#fff" /><Text style={styles.pendingText}>Ждём ответа</Text>
        </Press>;
      case "rejected":
        return <Btn kind="o" title="Не в этот раз" disabled />;
      default:
        return <Btn kind="w" title={full ? "Мест нет" : "Я иду"} onPress={() => setJoinPhase("confirm")} loading={busy} disabled={full || !open} />;
    }
  })();

  // Все, кто идёт: организатор + участники (как EventParticipants мини-аппа).
  const people: { id: string; name: string; avatarUrl: string | null; anonymous?: boolean }[] = [
    ...(event.organizer ? [{ id: event.organizer.id, name: event.organizerHidden ? "Организатор" : event.organizer.name, avatarUrl: event.organizerHidden ? null : event.organizer.avatarUrl, anonymous: !!event.organizerHidden }] : []),
    ...event.participants.map((p) => ({ id: p.id, name: p.name, avatarUrl: p.avatarUrl, anonymous: !!p.anonymous })),
  ];
  function showPeople() {
    setWhoCount(30);
    setWhoOpen(true);
  }
  const organizerId = event.organizer?.id;
  const isOwner = event.viewerStatus === "organizer";
  const openPerson = (p: { id: string; name: string; avatarUrl: string | null; anonymous?: boolean }) => {
    setWhoOpen(false);
    if (p.anonymous) {
      Alert.alert("Анонимно", "Профиль откроется после одобрения заявки");
      return;
    }
    if (isOwner && p.id === organizerId) router.navigate("/(tabs)/profile");
    else router.navigate({ pathname: "/person/[id]", params: { id: p.id, name: p.name, avatar: p.avatarUrl ?? "" } } as unknown as Href);
  };
  const cover = coverUri(event.photoUrl);
  const placeText = event.address && event.placeName && event.address.toLowerCase().startsWith(event.placeName.toLowerCase()) ? event.address : [event.placeName, event.address].filter(Boolean).join(", ");

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <View pointerEvents="none" style={[styles.cover, { height: coverHeight }]}>
        {cover ? (
          <FadeImage uri={cover} width={width} height={coverHeight} from={0.48} to={1} focusY={0.5} style={StyleSheet.absoluteFill} />
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
                <EventPin photo={coverUri(event.isBusiness ? event.photoUrl : event.organizer?.avatarUrl)} icon={eventIcon(event)} />
              </Marker>
            </Map>
          </View>
        ) : (
          <Grad style={[StyleSheet.absoluteFill, styles.gfx]}>
            <Image source={{ uri: eventIcon(event) }} style={{ width: 200, height: 200 }} contentFit="contain" />
          </Grad>
        )}
        <LinearGradient colors={["transparent", "rgba(23,20,31,0.32)", "rgba(23,20,31,0.84)", colors.ink]} locations={[0.28, 0.48, 0.68, 1]} style={StyleSheet.absoluteFill} />
      </View>
      <ScrollView
        style={{ flex: 1 }}
        contentInsetAdjustmentBehavior="never"
        contentContainerStyle={{ paddingTop: titleOffset, paddingBottom: insets.bottom + 112 }}
        showsVerticalScrollIndicator={false}
      >
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
          {(() => {
            // Как в мини-аппе: последнее слово — второй строкой, Lora Italic; длинные — мельче (.k-tl2/.k-tl3).
            const t = event.title.trim();
            const i = t.lastIndexOf(" ");
            const parts = i > 2 && t.length <= 40 ? [t.slice(0, i), t.slice(i + 1)] : [t, ""];
            const size = t.length > 60 ? 26 : t.length > 30 ? 32 : 40;
            return (
              <Text style={[styles.title, { fontSize: size, lineHeight: Math.round(size * 1.08), letterSpacing: -0.035 * size, textShadowColor: "rgba(0,0,0,0.25)", textShadowRadius: 20 }]}>
                {parts[0]}
                {parts[1] ? <Text style={{ fontFamily: SERIF, fontSize: size * 1.08, letterSpacing: -0.01 * size }}>{"\n"}{parts[1]}</Text> : null}
              </Text>
            );
          })()}
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

          {/* Как в мини-аппе: три одинаковые плитки «Когда · Мест · Билет/Расходы» и под ними — кнопка «Чат события». */}
          <View style={styles.tiles}>
            <View style={styles.tile}>
              <View style={styles.tileHead}><Icon name="cal" size={14} color="rgba(255,255,255,0.6)" /><Text style={styles.tileLabel}>Когда</Text></View>
              <Text style={styles.tileVal} numberOfLines={1}>{formatEventDate(event.eventDate, event.eventTime).split(",").slice(-2).join(",").trim()}</Text>
              <Text style={styles.tileSub} numberOfLines={1}>
                {new Date(`${event.eventDate}T12:00:00`).toLocaleDateString("ru-RU", { day: "numeric", month: "short" }).replace(".", "")}
                {event.eventEndTime ? ` · до ${event.eventEndTime.slice(0, 5)}` : ""}
              </Text>
            </View>
            <View style={styles.tile}>
              <View style={styles.tileHead}><Icon name="people" size={14} color="rgba(255,255,255,0.6)" /><Text style={styles.tileLabel}>Мест</Text></View>
              <Text style={styles.tileVal} numberOfLines={1}>{event.seatsTaken + 1} из {event.seatsTotal + 1}</Text>
            </View>
            <View style={styles.tile}>
              <View style={styles.tileHead}><Icon name="wallet" size={14} color="rgba(255,255,255,0.6)" /><Text style={styles.tileLabel}>{event.isBusiness ? "Билет" : "Расходы"}</Text></View>
              <Text style={styles.tileVal} numberOfLines={2}>{costShort(event)}</Text>
            </View>
          </View>
          {(!event.isBusiness || event.hasChat || open) && (
            <Pressable onPress={() => {
              if (event.isBusiness && !event.hasChat) {
                if (event.viewerStatus === "organizer") router.navigate("/(tabs)/chats");
                else setQuestionOpen(true);
              } else if (event.conversationId) openChat();
              else Alert.alert("Чат встречи", "Общий чат откроется после одобрения заявки.");
            }} style={({ pressed }) => [styles.chatBar, { transform: [{ scale: pressed ? 0.97 : 1 }] }]} accessibilityRole="button" accessibilityLabel={contactLabel}>
              <Icon name="chat" size={20} color="#fff" />
              <Text style={styles.chatBarText}>{contactLabel}</Text>
            </Pressable>
          )}
          {/* .k-orgc: организатор (анонимно — капля Моси и «Почему?») */}
          {event.organizer ? (
            event.organizerHidden ? (
              <Pressable onPress={() => Alert.alert("Анонимная встреча", "Организатор увидит твоё фото и профиль сразу после отправки заявки. Его профиль и точный адрес откроются тебе после одобрения.")} style={({ pressed }) => [styles.blk, styles.org, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <View style={styles.orgAnon}><Creature size={44} variant="p" /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.orgName}>{`${anonymousTag(event.organizer.gender)} · анонимно`}</Text>
                  <Text style={styles.muted}>{event.organizer.ratingAvg ? `${event.organizer.ratingAvg.toFixed(1).replace(".", ",")} ★ · ` : ""}откроется после одобрения заявки</Text>
                </View>
                <View style={styles.why}><Text style={styles.whyText}>Почему?</Text></View>
              </Pressable>
            ) : (
              <Pressable onPress={() => router.push({ pathname: "/person/[id]", params: { id: event.organizer!.id, name: event.organizer!.name, avatar: event.organizer!.avatarUrl ?? "" } } as unknown as Href)} style={({ pressed }) => [styles.blk, styles.org, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
                <Avatar uri={event.organizer.avatarUrl} name={event.organizer.name} size={46} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.orgName} numberOfLines={1}>{`${event.isBusiness ? event.organizer.name : event.organizer.name.trim().split(/\s+/)[0]}${event.viewerStatus === "organizer" ? " · это ты" : ""} · организатор`}</Text>
                  <Text style={styles.muted}>
                    {[event.organizer.ratingAvg ? `${event.organizer.ratingAvg.toFixed(1).replace(".", ",")} ★` : null, `${event.organizer.completedMeetingsCount} ${event.organizer.completedMeetingsCount % 10 === 1 && event.organizer.completedMeetingsCount % 100 !== 11 ? "встреча" : [2, 3, 4].includes(event.organizer.completedMeetingsCount % 10) && ![12, 13, 14].includes(event.organizer.completedMeetingsCount % 100) ? "встречи" : "встреч"}`, event.isBusiness ? "заведение" : null].filter(Boolean).join(" · ")}
                  </Text>
                </View>
                <Icon name="chev" size={18} color="rgba(255,255,255,0.6)" />
              </Pressable>
            )
          ) : null}

          <View style={styles.blk}>
            <Pressable style={styles.whoHeader} onPress={showPeople} disabled={!people.length} accessibilityRole="button" accessibilityLabel={`Открыть список участников: ${people.length}`}>
              <Text style={styles.cardH}>{`${live ? "Уже на месте" : "Идут"} · ${event.seatsTaken + 1}`}</Text>
              {people.length > 0 && <Icon name="down" size={20} color="rgba(255,255,255,0.75)" />}
            </Pressable>
            <View style={{ flexDirection: "row", gap: 8, marginTop: 8, justifyContent: people.length > 5 ? "space-between" : "flex-start" }}>
              {people.slice(0, 5).map((p, i) => (
                <Pressable key={p.anonymous ? `anon-${i}` : p.id} onPress={() => openPerson(p)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.92 : 1 }] })}>
                  {p.anonymous ? <View style={[styles.anonAva, { width: previewSize, height: previewSize }]}><Creature size={previewSize - 4} variant="p" /></View> : <Avatar uri={p.avatarUrl} name={p.name} size={previewSize} />}
                </Pressable>
              ))}
              {people.length > 5 ? (
                <Pressable onPress={showPeople} style={({ pressed }) => [styles.moreAva, { width: previewSize, height: previewSize, transform: [{ scale: pressed ? 0.92 : 1 }] }]} accessibilityLabel={`Показать всех участников: ${people.length}`}>
                  <Text style={styles.moreAvaText}>+{people.length - 5}</Text>
                </Pressable>
              ) : null}
            </View>
            {!full && (event.viewerStatus === "none" || !event.viewerStatus) && open ? (
              <Pressable onPress={() => setJoinPhase("confirm")} style={({ pressed }) => [styles.freeChip, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
                <Text style={styles.freeText}>Свободных мест: {Math.max(0, event.seatsTotal - event.seatsTaken)}</Text>
              </Pressable>
            ) : null}
          </View>

          {event.description ? (
            <View style={styles.blk}>
              <Text style={styles.cardH}>{event.isBusiness ? "О событии" : "О встрече"}</Text>
              <Text style={[styles.desc, { marginTop: 6 }]}>{event.description}</Text>
            </View>
          ) : null}

          {/* Место: до одобрения анонимной — скрыто */}
          <View style={styles.blk}>
            {event.organizerHidden ? (
              <>
                <Text style={styles.cardH}>Место откроется после одобрения</Text>
                <Text style={[styles.desc, { marginTop: 4, color: "rgba(255,255,255,0.72)" }]}>Организатор и точный адрес видны только принятым участникам</Text>
              </>
            ) : (
              <>
                <Text style={styles.cardH}>Место</Text>
                <Text style={[styles.desc, { marginTop: 4 }]}>{placeText || "Место уточняется"}</Text>
                <View style={{ flexDirection: "row", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  {hasCoords ? (
                    <Pressable onPress={() => openRoute(event.latitude!, event.longitude!)} style={({ pressed }) => [styles.freeChip, styles.actChip, { marginTop: 0, transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
                      <Icon name="map" size={17} color="#fff" />
                      <Text style={styles.freeText}>Маршрут</Text>
                    </Pressable>
                  ) : null}
                  {event.address ? (
                    <Pressable
                      onPress={() => Clipboard.setStringAsync(placeText).then(() => { tapOk(); Alert.alert("", "Адрес скопирован"); }).catch(() => {})}
                      style={({ pressed }) => [styles.freeChip, { marginTop: 0, transform: [{ scale: pressed ? 0.95 : 1 }] }]}
                    >
                      <Text style={styles.freeText}>Скопировать адрес</Text>
                    </Pressable>
                  ) : null}
                </View>
                {hasCoords ? (
                  // Карта места — как в мини-аппе: метка с фото и временем; нажал — открывается большая карта.
                  <Pressable onPress={() => router.push({ pathname: "/(tabs)/map", params: { focus: event.id, business: event.isBusiness ? "only" : "", t: String(Date.now()) } } as unknown as Href)} accessibilityRole="button" accessibilityLabel="Открыть место на карте" style={styles.placeMap}>
                    <View style={StyleSheet.absoluteFill} pointerEvents="none">
                      <Map style={StyleSheet.absoluteFill} mapStyle={MAP_STYLE} logo={false} compass={false} dragPan={false} touchZoom={false} doubleTapZoom={false} touchRotate={false} touchPitch={false} attributionPosition={{ top: 8, left: 8 }}>
                        <Camera initialViewState={{ center: [event.longitude!, event.latitude!], zoom: 15.5 }} />
                        <Marker lngLat={[event.longitude!, event.latitude!]} anchor="bottom">
                          <View style={{ alignItems: "center" }}>
                            <View style={styles.pinTime}><Text style={styles.pinTimeText}>{event.eventTime.slice(0, 5)}</Text></View>
                            <EventPin photo={coverUri(event.isBusiness ? event.photoUrl ?? event.organizer?.avatarUrl : event.organizer?.avatarUrl)} icon={eventIcon(event)} />
                          </View>
                        </Marker>
                      </Map>
                    </View>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>

          {isOwner && <OrganizerPanel event={event} onChanged={load} />}

          {event.viewerStatus === "pending" && open && event.myApplicationId ? (
            <Pressable onPress={() => setConfirm("withdraw")} style={({ pressed }) => [styles.quietLink, pressed && { transform: [{ scale: 0.97 }] }]}>
              <Text style={styles.quietText}>Отозвать заявку</Text>
            </Pressable>
          ) : null}
          {event.viewerStatus === "accepted" && open && !started ? (
            <Pressable onPress={() => setConfirm("leave")} style={({ pressed }) => [styles.quietLink, pressed && { transform: [{ scale: 0.97 }] }]}>
              <Text style={styles.quietText}>{event.isBusiness ? "Отменить участие" : "Не смогу пойти"}</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
      <View pointerEvents="box-none" style={[styles.heroTop, { top: insets.top + 8 }]}>
        <RoundBtn onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)")}>
          <Icon name="back" />
        </RoundBtn>
        <RoundBtn onPress={share}><Icon name="share" /></RoundBtn>
      </View>

      {event.isBusiness && !event.hasChat && open && event.viewerStatus !== "organizer" ? (
        <OrganizerQuestion key={event.id} visible={questionOpen} eventId={event.id} title={event.title} onClose={() => setQuestionOpen(false)} />
      ) : null}
      <Sheet visible={whoOpen} onClose={() => setWhoOpen(false)}>
        <View style={styles.whoHeader}>
          <Text style={styles.whoTitle}>Кто идёт · {people.length}</Text>
          <Press accessibilityLabel="Закрыть список участников" onPress={() => setWhoOpen(false)} style={styles.sheetClose}><Icon name="close" /></Press>
        </View>
        <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 4, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
          {people.slice(0, whoCount).map((p, i) => (
            <View key={p.anonymous ? `a${i}` : p.id} style={styles.whoEntry}>
              <Pressable onPress={() => openPerson(p)} style={({ pressed }) => [styles.whoRow, pressed && { backgroundColor: "rgba(23,20,31,0.05)" }]}>
                {p.anonymous ? <View style={[styles.anonAva, { width: 44, height: 44 }]}><Creature size={40} variant="p" /></View> : <Avatar uri={p.avatarUrl} name={p.name} size={44} />}
                <Text style={styles.whoName} numberOfLines={1}>{p.anonymous ? p.name : p.name.trim().split(/\s+/)[0]}{i === 0 && event.organizer ? " · организатор" : ""}</Text>
                {!p.anonymous ? <Icon name="chev" size={18} color={colors.grey} /> : null}
              </Pressable>
              {isOwner && open && !started && p.id !== organizerId && <Press onPress={() => askRemove(p)} disabled={!!removingId} accessibilityLabel={`Убрать участника ${p.name}`} style={{ padding: 8 }}>
                <Text style={{ ...f("500"), color: colors.danger }}>{removingId === p.id ? "Убираем…" : "Убрать"}</Text>
              </Press>}
            </View>
          ))}
          {whoCount < people.length ? (
            <Btn kind="o" title={`Показать ещё · ${people.length - whoCount}`} onPress={() => setWhoCount((n) => n + 30)} style={{ marginTop: 10 }} />
          ) : null}
        </ScrollView>
      </Sheet>

      <Sheet visible={joinPhase !== null} onClose={() => { if (joinPhase === "done" || !applying.current) setJoinPhase(null); }}>
        <Text style={styles.whoTitle}>{joinPhase === "done" ? "Заявка отправлена" : "Отправить заявку?"}</Text>
        <Text style={styles.joinTitle}>{event.title}</Text>
        <Text style={styles.joinDetail}>{formatEventDate(event.eventDate, event.eventTime)} · {event.organizerHidden ? "Место откроется после одобрения" : event.placeName}</Text>
        <Text style={styles.joinDetail}>{joinPhase === "done" ? "Организатор посмотрит твой профиль и ответит." : event.isBusiness ? "После подтверждения придёт номер билета." : "Организатор увидит твою заявку и сможет подтвердить участие."}</Text>
        {joinPhase === "done" ? <Btn kind="k" title="Готово" onPress={() => setJoinPhase(null)} /> : <>
          <Btn title="Отправить заявку" onPress={apply} loading={busy} />
          <Btn kind="o" title="Не сейчас" onPress={() => setJoinPhase(null)} disabled={busy} />
        </>}
      </Sheet>

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
      <View style={[styles.footer, { bottom: Math.max(insets.bottom, 6) + 6 }]}>
        <Pressable onPress={share} style={styles.shareBtn} accessibilityLabel="Поделиться">
          <Icon name="share" color="#fff" size={20} />
        </Pressable>
        <FireButton eventId={event.id} count={event.fireCount} mine={event.myFire} />
        <View style={{ flex: 1, minWidth: 0 }}>{action}</View>
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
  tileSub: { fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.6)", marginTop: 2 },
  chatBar: { marginTop: 8, height: 56, borderRadius: 28, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  chatBarText: { fontSize: 16, ...f("500"), color: "#fff" },
  moreAva: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.5)" },
  moreAvaText: { fontSize: 15, ...f("500"), color: "#fff" },
  actChip: { flexDirection: "row", alignItems: "center", gap: 8 },
  placeMap: { height: 240, marginTop: 14, marginHorizontal: -16, marginBottom: -14, overflow: "hidden", backgroundColor: "#EEECF3" },
  pinTime: { paddingHorizontal: 8, height: 22, borderRadius: 11, backgroundColor: "#fff", justifyContent: "center", marginBottom: 4 },
  pinTimeText: { fontSize: 12, ...f("600"), color: "#17141F" },
  pendingCta: { minHeight: 56, borderRadius: 28, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, borderWidth: 1.5, borderColor: "#fff", backgroundColor: "rgba(255,255,255,0.16)" },
  pendingText: { flexShrink: 1, fontSize: 16, ...f("500"), color: "#fff", textAlign: "center" },
  whoHeader: { minHeight: 36, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  sheetClose: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.glass2 },
  joinTitle: { fontSize: 17, ...f("500"), color: colors.ink },
  joinDetail: { fontSize: 15, fontFamily: FONT, lineHeight: 21, color: colors.ink2 },
  whoTitle: { fontSize: 22, ...f("500"), color: colors.ink, letterSpacing: -0.4 },
  whoEntry: { flexDirection: "row", alignItems: "center", gap: 6 },
  whoRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 6, borderRadius: 16 },
  whoName: { flex: 1, fontFamily: FONT, fontSize: 16, color: colors.ink },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  cover: { position: "absolute", top: 0, left: 0, right: 0, overflow: "hidden", backgroundColor: colors.ink },
  heroText: { paddingHorizontal: 20, paddingBottom: 18, gap: 10 },
  gfx: { alignItems: "center", justifyContent: "center" },
  heroTop: { position: "absolute", left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" },
  body: { paddingHorizontal: 16, paddingTop: 6, gap: 10 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: "rgba(23,20,31,0.38)", borderWidth: 1, borderColor: "rgba(255,255,255,0.4)" },
  chipText: { color: W, fontSize: 13, ...f("500") },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.ok },
  title: { fontSize: 40, lineHeight: 42, ...f("300"), letterSpacing: -1.6, color: W },
  // Сетка 2×2: у всех плиток одинаковый размер, значок и подпись — текст переносится ровно, без «…».
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minHeight: 84, borderRadius: 20, padding: 10, gap: 4, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  tileChat: {},
  tileHead: { flexDirection: "row", alignItems: "center", gap: 4 },
  tileLabel: { fontFamily: FONT, fontSize: 11.5, color: W60 },
  tileVal: { fontSize: 15, ...f("500"), color: W },
  infoRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  infoSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(255,255,255,0.15)" },
  infoIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center" },
  infoText: { flex: 1, fontFamily: FONT, fontSize: 15, color: W },
  card: { borderRadius: 22, padding: 16, backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  cardH: { fontSize: 15, ...f("500"), color: W, marginBottom: 6 },
  desc: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: "rgba(255,255,255,0.82)" },
  org: { flexDirection: "row", alignItems: "center", gap: 12 },
  // .k-blk.k-gd из мини-аппа
  blk: { overflow: "hidden", borderRadius: 24, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: "#2B2834", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)" },
  orgAnon: { width: 46, height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  anonAva: { width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.14)", borderWidth: 2, borderColor: "rgba(255,255,255,0.6)", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  why: { height: 32, paddingHorizontal: 12, borderRadius: 16, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", justifyContent: "center" },
  whyText: { color: "#fff", fontSize: 13, ...f("500") },
  freeChip: { alignSelf: "flex-start", marginTop: 12, height: 36, paddingHorizontal: 14, borderRadius: 18, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)", justifyContent: "center" },
  freeText: { color: "#fff", fontSize: 14, ...f("500") },
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
  // Как кнопка: тёмное стекло во всю ширину, текст — розово-красный (действие отменяет участие).
  quietLink: { height: 50, borderRadius: 25, marginTop: 12, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.08)", borderWidth: 1, borderColor: "rgba(255,154,154,0.35)" },
  quietText: { fontSize: 15, ...f("500"), color: "#FF9A9A" },
  fade: { position: "absolute", left: 0, right: 0, bottom: 0 },
  footer: { position: "absolute", left: 12, right: 12, bottom: 0, flexDirection: "row", alignItems: "center", gap: 8, padding: 8, borderRadius: 38, backgroundColor: "rgba(23,20,31,0.9)", borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  shareBtn: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(255,255,255,0.12)", borderWidth: 1, borderColor: "rgba(255,255,255,0.22)" },
});
