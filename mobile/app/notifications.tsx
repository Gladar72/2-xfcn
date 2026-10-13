import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { Image } from "expo-image";
import { Aurora, Glass, Mosya, RoundBtn, Title } from "@/components/brand";
import { Icon, type IconName } from "@/components/Icon";
import { Chip } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, FONT } from "@/lib/theme";

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
  if (item.type === "new_message") return item.linkConversationId ? `/chat/${item.linkConversationId}` : "/chats";
  if (item.linkEventId) return `/event/${item.linkEventId}`;
  if (item.linkConversationId) return `/chat/${item.linkConversationId}`;
  return "/chats";
}

type Row = { kind: "label"; key: string; label: string } | { kind: "item"; key: string; item: NotificationItem };

export default function NotificationsScreen() {
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

  function open(item: NotificationItem) {
    if (!item.isRead) {
      setItems((prev) => prev.map((n) => (n.id === item.id ? { ...n, isRead: true } : n)));
      api("/api/notifications", { method: "PATCH", body: { ids: [item.id] } }).catch(() => {});
    }
    router.push(targetOf(item) as Href);
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
            <Title plain="Уведом" em="ления" size={30} style={{ marginLeft: 4 }} />
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
          const meta = TYPE_META[n.type] ?? { label: "Уведомление", icon: "bell" as IconName };
          const photo = n.event?.photoUrl;
          return (
            <Pressable onPress={() => open(n)} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
              <Glass strong style={[styles.row, !n.isRead && styles.unread]}>
                {photo ? (
                  <Image source={{ uri: photo }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.iconBox]}>
                    <Icon name={meta.icon} size={22} color={colors.violet} />
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <View style={styles.between}>
                    <Text style={styles.title} numberOfLines={1}>
                      {meta.label}
                    </Text>
                    <Text style={styles.time}>{timeAgo(n.createdAt)}</Text>
                  </View>
                  <Text style={styles.text} numberOfLines={3}>
                    {n.text}
                  </Text>
                  {n.ticketCode && n.type === "application_accepted" ? (
                    <Text style={styles.ticket}>🎟 Билет: {n.ticketCode}</Text>
                  ) : null}
                </View>
                {!n.isRead ? <View style={styles.dot} /> : null}
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
  label: { fontFamily: FONT, fontSize: 13, fontWeight: "500", color: colors.grey, marginTop: 6, marginLeft: 6 },
  row: { flexDirection: "row", gap: 12, padding: 12, borderRadius: 24, alignItems: "center" },
  unread: { borderWidth: 1, borderColor: "rgba(108,59,255,0.35)" },
  thumb: { width: 50, height: 50, borderRadius: 16 },
  iconBox: { backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
  title: { fontFamily: FONT, fontSize: 15.5, fontWeight: "500", color: colors.ink, flex: 1 },
  time: { fontFamily: FONT, fontSize: 12, color: colors.grey },
  text: { fontFamily: FONT, fontSize: 14, lineHeight: 19, color: colors.ink2 },
  ticket: { fontFamily: FONT, fontSize: 13, color: colors.violet, marginTop: 2 },
  dot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.pink },
  empty: { alignItems: "center", marginTop: 50, gap: 8, paddingHorizontal: 24 },
  emptyTitle: { fontFamily: FONT, fontSize: 19, fontWeight: "500", color: colors.ink },
  emptyText: { fontFamily: FONT, fontSize: 14, color: colors.grey, textAlign: "center" },
});
