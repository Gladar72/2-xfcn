import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { Image } from "expo-image";
import { Aurora, Glass, Mosya, RoundBtn, Title } from "@/components/brand";
import { Icon, type IconName } from "@/components/Icon";
import { Chip } from "@/components/ui";
import { Creature } from "@/components/k/Creature";
import { api } from "@/lib/api";
import { colors, FONT, f } from "@/lib/theme";
import { useGuide } from "@/lib/guide";

/** Ответ GET /api/notifications (app/api/notifications/route.ts). */
interface NotificationItem {
  id: string;
  type: string;
  isRead: boolean;
  createdAt: string;
  text: string;
  linkEventId: string | null;
  linkConversationId: string | null;
  event: {
    id: string;
    title: string;
    photoUrl: string | null;
    eventDate: string;
    eventTime: string;
    isBusiness: boolean;
    status: string;
  } | null;
  ticketCode: string | null;
  eventConversationId: string | null;
  linkUserId?: string | null;
  fromAvatarUrl?: string | null;
}

type Tab = "all" | "events" | "chats";

const MEETING_TYPES = new Set([
  "new_application",
  "application_accepted",
  "application_rejected",
  "event_reminder",
  "event_soon",
  "review_request",
  "boost_suggestion",
  "share_nudge",
  "heart",
  "heart_mutual",
  "meet_hint",
]);

/** Короткий заголовок карточки по типу — сам текст приходит с сервера. */
const TYPE_META: Record<string, { label: string; icon: IconName }> = {
  new_application: { label: "Новый отклик", icon: "people" },
  application_accepted: { label: "Ты в деле!", icon: "check" },
  application_rejected: { label: "Заявка не подтверждена", icon: "close" },
  event_reminder: { label: "Скоро встреча", icon: "clock" },
  event_soon: { label: "Встречаемся через 2 часа", icon: "clock" },
  review_request: { label: "Оцени встречу", icon: "star" },
  boost_suggestion: { label: "Мало откликов", icon: "up" },
  share_nudge: { label: "Поделись событием", icon: "up" },
  heart: { label: "Вам поставили сердечко", icon: "people" },
  heart_mutual: { label: "Это взаимно!", icon: "people" },
  meet_hint: { label: "Хочет на встречу", icon: "people" },
  subscription_expiring: { label: "Подписка", icon: "wallet" },
  subscription_expired: { label: "Подписка", icon: "wallet" },
  new_message: { label: "Сообщение", icon: "chat" },
};

const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  if (d.toDateString() === today.toDateString()) return "Сегодня";
  if (d.toDateString() === yesterday.toDateString()) return "Вчера";
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "только что";
  if (min < 60) return `${min} мин назад`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} ч назад`;
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Куда ведёт тап — как на веб-экране уведомлений, но по маршрутам приложения. */
function targetOf(item: NotificationItem): string {
  if (item.type === "subscription_expiring" || item.type === "subscription_expired") return "/profile";
  if (item.type === "heart") return "/profile?hearts=1";
  if ((item.type === "heart_mutual" || item.type === "meet_hint" || item.type === "new_follower") && item.linkUserId) return `/person/${item.linkUserId}`;
  if (item.type === "review_request") return item.linkEventId ? `/reviews?event=${item.linkEventId}` : "/reviews";
  if (item.type === "new_message") return item.linkConversationId ? `/chat/${item.linkConversationId}` : "/chats";
  if (item.linkEventId) return `/event/${item.linkEventId}`;
  if (item.linkConversationId) return `/chat/${item.linkConversationId}`;
  return "/chats";
}

type Row = { kind: "label"; key: string; label: string } | { kind: "item"; key: string; item: NotificationItem };

export default function NotificationsScreen() {
  useGuide("notifications");
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<Tab>("all");

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: NotificationItem[] }>("/api/notifications");
      setItems(r.items ?? []);
      // Как в веб-версии: при открытии экрана всё отмечается прочитанным.
      // Подсветка непрочитанных остаётся до следующего обновления списка.
      if ((r.items ?? []).some((n) => !n.isRead)) {
        api("/api/notifications", { method: "PATCH", body: {} }).catch(() => {});
      }
    } catch {}
    setLoaded(true);
    setRefreshing(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const rows = useMemo<Row[]>(() => {
    const filtered =
      tab === "all"
        ? items
        : tab === "chats"
        ? items.filter((n) => n.type === "new_message")
        : items.filter((n) => MEETING_TYPES.has(n.type));
    const out: Row[] = [];
    let last = "";
    for (const item of filtered) {
      const label = dayLabel(item.createdAt);
      if (label !== last) {
        out.push({ kind: "label", key: `l-${label}-${item.id}`, label });
        last = label;
      }
      out.push({ kind: "item", key: item.id, item });
    }
    return out;
  }, [items, tab]);

  function open(item: NotificationItem, target = targetOf(item)) {
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      api("/api/notifications", { method: "PATCH", body: { ids: [item.id] } }).catch(() => {});
    }
    router.push(target as Href);
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <FlatList
        data={rows}
        keyExtractor={(r) => r.key}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 10 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
            tintColor={colors.violet}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 14, marginBottom: 4 }}>
            <RoundBtn onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)"))}>
              <Icon name="back" />
            </RoundBtn>
            <Title plain="Уведомления" size={36} style={{ marginLeft: 4, marginTop: 4 }} />
            <View style={styles.tabs}>
              <Chip label="Все" active={tab === "all"} onPress={() => setTab("all")} />
              <Chip label="Встречи" active={tab === "events"} onPress={() => setTab("events")} />
              <Chip label="Чаты" active={tab === "chats"} onPress={() => setTab("chats")} />
            </View>
          </View>
        }
        renderItem={({ item: row }) => {
          if (row.kind === "label") return <Text style={styles.label}>{row.label}</Text>;
          const n = row.item;
          const rich = n.event && (n.type === "application_accepted" || n.type === "event_soon") && n.event.status !== "cancelled";
          if (rich && n.event) {
            const e = n.event;
            const ticket = e.isBusiness ? n.ticketCode : null;
            const confirmed = n.type === "application_accepted";
            return (
              <View style={styles.rich}>
                <View style={styles.status}>
                  <Icon name={confirmed ? "check" : "clock"} size={16} color={confirmed ? "#AAE7CE" : "#D7CBFF"} />
                  <Text style={styles.statusText}>{confirmed ? "Участие подтверждено" : "Встреча через 2 часа"}</Text>
                </View>
                <Text style={styles.richTitle}>{e.title}</Text>
                <Text style={styles.richSub}>{dayLabel(e.eventDate)}, {e.eventTime.slice(0, 5)}</Text>
                {ticket && (
                  <Pressable accessibilityRole="button" accessibilityLabel={`Открыть билет ${ticket}`} onPress={() => open(n, `/ticket/${e.id}`)}
                    style={({ pressed }) => [styles.ticketPass, pressed && { opacity: 0.85 }]}>
                    <Icon name="ticket" size={26} color={colors.ink} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={styles.ticketCode}>Билет № {ticket}</Text>
                      <Text style={styles.ticketAction}>Открыть билет</Text>
                    </View>
                    <Icon name="chev" size={18} color={colors.ink} />
                  </Pressable>
                )}
                <View style={styles.richActions}>
                  <Pressable accessibilityRole="button" onPress={() => open(n, `/event/${e.id}`)} style={styles.richBtn}>
                    <Text style={styles.richBtnText}>Открыть встречу</Text>
                  </Pressable>
                  {!ticket && <Pressable accessibilityRole="button" onPress={() => open(n, n.eventConversationId ? `/chat/${n.eventConversationId}` : "/chats")} style={styles.richBtn}>
                    <Icon name="chat" size={16} color="#fff" /><Text style={styles.richBtnText}>Чат</Text>
                  </Pressable>}
                </View>
              </View>
            );
          }
          const avatar = !n.event?.photoUrl ? n.fromAvatarUrl : null;
          const photo = n.event?.photoUrl ?? avatar;
          const m = n.text.match(/^(.+?)([:—].*)$/);
          return (
            <Pressable onPress={() => open(n)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <Glass strong style={[styles.row, !n.isRead && styles.unread]}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.iconBox]}>
                    <Creature size={42} variant="e" />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.text}>
                    <Text style={{ ...f("500"), color: colors.ink }}>{m ? m[1] : n.text}</Text>
                    {m ? m[2] : ""}
                  </Text>
                  <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
                </View>
              </Glass>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          loaded ? (
            <View style={styles.empty}>
              <Mosya pose="think" size={150} />
              <Text style={styles.emptyTitle}>Пока тихо</Text>
              <Text style={styles.emptyText}>Здесь появятся заявки, ответы организаторов и напоминания о встречах</Text>
            </View>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: "row", gap: 8 },
  label: { fontSize: 13, ...f("500"), color: colors.grey, marginTop: 6, marginLeft: 6 },
  // .nt из мини-аппа
  row: { flexDirection: "row", gap: 12, padding: 10, borderRadius: 22, alignItems: "flex-start" },
  unread: { borderWidth: 1.5, borderColor: "rgba(155,92,255,0.5)" },
  thumb: { width: 46, height: 46, borderRadius: 23 },
  iconBox: { backgroundColor: "#EFE8FF", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  // .ntrich
  rich: { borderRadius: 24, padding: 16, backgroundColor: "#17141F", overflow: "hidden", gap: 4 },
  status: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
  statusText: { color: "#E7E3EC", fontSize: 13, ...f("500") },
  richTitle: { color: "#fff", fontSize: 19, ...f("600") },
  richSub: { color: "#D5D1DA", fontSize: 14, fontFamily: FONT },
  ticketPass: { marginTop: 8, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: "#F4F1FA", flexDirection: "row", alignItems: "center", gap: 12 },
  ticketCode: { color: colors.ink, ...f("600"), fontSize: 17 },
  ticketAction: { color: "#554769", ...f("500"), fontSize: 13 },
  richActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  richBtn: { minHeight: 44, flexDirection: "row", gap: 6, paddingHorizontal: 14, borderRadius: 22, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)", alignItems: "center", justifyContent: "center" },
  richBtnText: { color: "#fff", fontSize: 14, ...f("500") },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { fontSize: 15.5, ...f("500"), color: colors.ink, flex: 1 },
  time: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, marginTop: 3 },
  text: { fontFamily: FONT, fontSize: 14.5, lineHeight: 21, color: colors.ink },
  ticket: { fontFamily: FONT, fontSize: 13, color: colors.violet, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pink },
  empty: { alignItems: "center", marginTop: 50, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, ...f("500"), color: colors.ink },
  emptyText: { fontFamily: FONT, fontSize: 14, color: colors.grey, textAlign: "center" },
});
