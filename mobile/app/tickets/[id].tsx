import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Pressable, RefreshControl, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Glass, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Avatar, Chip } from "@/components/ui";
import { api } from "@/lib/api";
import { manageErrorText, tapLight, tapOk, tapWarn } from "@/lib/feedback";
import { colors, FONT } from "@/lib/theme";

interface Ticket {
  userId: string;
  name: string;
  avatarUrl: string | null;
  ticketCode: string | null;
  checkedInAt: string | null;
}
interface Resp {
  event: { id: string; title: string; eventDate: string; eventTime: string; isBusiness: boolean };
  tickets: Ticket[];
}
type Filter = "all" | "wait" | "came";

/** Номер из кода «MKS-007» — для сортировки и поиска по цифрам. */
function codeNum(code: string | null): number {
  const m = code?.match(/(\d+)\s*$/);
  return m ? Number(m[1]) : Number.MAX_SAFE_INTEGER;
}

/** «Билеты гостей» — отметка на входе (app/(app)/events/[id]/tickets). */
export default function TicketsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<Resp>(`/api/events/${id}/tickets`));
      setError(null);
    } catch (e) {
      setError(manageErrorText(e));
    }
    setRefreshing(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const all = useMemo(() => [...(data?.tickets ?? [])].sort((a, b) => codeNum(a.ticketCode) - codeNum(b.ticketCode)), [data]);
  const came = all.filter((t) => t.checkedInAt).length;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((t) => {
      if (filter === "wait" && t.checkedInAt) return false;
      if (filter === "came" && !t.checkedInAt) return false;
      if (!q) return true;
      // Только цифры — ищем по номеру: «7» найдёт MKS-007.
      if (/^\d+$/.test(q)) return codeNum(t.ticketCode) === Number(q);
      return t.name.toLowerCase().includes(q) || (t.ticketCode ?? "").toLowerCase().includes(q);
    });
  }, [all, filter, query]);

  async function toggle(t: Ticket) {
    const next = !t.checkedInAt;
    setBusyId(t.userId);
    // Сразу показываем результат — на входе важна скорость.
    setData((d) => (d ? { ...d, tickets: d.tickets.map((x) => (x.userId === t.userId ? { ...x, checkedInAt: next ? new Date().toISOString() : null } : x)) } : d));
    next ? tapOk() : tapLight();
    try {
      const r = await api<{ checkedInAt: string | null }>(`/api/events/${id}/tickets`, { method: "PATCH", body: { userId: t.userId, checkedIn: next } });
      setData((d) => (d ? { ...d, tickets: d.tickets.map((x) => (x.userId === t.userId ? { ...x, checkedInAt: r.checkedInAt } : x)) } : d));
    } catch (e) {
      tapWarn();
      setData((d) => (d ? { ...d, tickets: d.tickets.map((x) => (x.userId === t.userId ? { ...x, checkedInAt: t.checkedInAt } : x)) } : d));
      Alert.alert("Не получилось", manageErrorText(e));
    } finally {
      setBusyId(null);
    }
  }

  function shareList() {
    const text = all.map((t, i) => `${i + 1}. ${t.ticketCode ?? "—"} — ${t.name} — ${t.checkedInAt ? "пришёл" : "не отмечен"}`).join("\n");
    Share.share({ message: `${data?.event.title ?? "Гости"}\n\n${text}` }).catch(() => {});
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <FlatList
        data={shown}
        keyExtractor={(t) => t.userId}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 8 }}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.violet}
            onRefresh={() => {
              setRefreshing(true);
              load();
            }}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: 12, marginBottom: 6 }}>
            <View style={styles.top}>
              <RoundBtn onPress={() => router.back()}>
                <Icon name="back" />
              </RoundBtn>
              {all.length ? (
                <Pressable onPress={shareList} style={styles.listBtn} hitSlop={6}>
                  <Icon name="share" size={16} color={colors.violet} />
                  <Text style={styles.listText}>Список</Text>
                </Pressable>
              ) : null}
            </View>
            <Title plain="Билеты " em="гостей" size={30} style={{ marginLeft: 4 }} />
            {data ? (
              <Text style={styles.sub} numberOfLines={2}>
                {data.event.title} · пришли {came} из {all.length}
              </Text>
            ) : null}
            {all.length ? (
              <>
                <Glass strong style={styles.search}>
                  <Icon name="search" size={18} color={colors.grey} />
                  <TextInput
                    value={query}
                    onChangeText={setQuery}
                    placeholder="Номер билета или имя"
                    placeholderTextColor={colors.grey}
                    style={styles.input}
                    returnKeyType="search"
                    autoCorrect={false}
                  />
                  {query ? (
                    <Pressable onPress={() => setQuery("")} hitSlop={8}>
                      <Icon name="close" size={16} color={colors.grey} />
                    </Pressable>
                  ) : null}
                </Glass>
                <View style={{ flexDirection: "row", gap: 8 }}>
                  <Chip label={`Все · ${all.length}`} active={filter === "all"} onPress={() => setFilter("all")} />
                  <Chip label={`Ждём · ${all.length - came}`} active={filter === "wait"} onPress={() => setFilter("wait")} />
                  <Chip label={`Пришли · ${came}`} active={filter === "came"} onPress={() => setFilter("came")} />
                </View>
              </>
            ) : null}
            {!data && !error ? <ActivityIndicator color={colors.violet} style={{ marginTop: 30 }} /> : null}
            {error ? <Text style={styles.sub}>{error}</Text> : null}
          </View>
        }
        ListEmptyComponent={
          data ? (
            <Glass strong style={styles.empty}>
              <Text style={styles.emptyTitle}>{all.length ? "Никого не нашли" : "Пока нет гостей"}</Text>
              <Text style={styles.sub}>{all.length ? "Проверь номер — например, 7 или MKS-007." : "Номера билетов появятся, когда ты примешь заявки."}</Text>
            </Glass>
          ) : null
        }
        renderItem={({ item: t }) => {
          const ok = !!t.checkedInAt;
          return (
            <Glass strong style={[styles.row, ok && styles.rowOk]}>
              <Avatar uri={t.avatarUrl} name={t.name} size={42} />
              <View style={{ flex: 1 }}>
                <Text style={styles.code}>{t.ticketCode ?? "без номера"}</Text>
                <Text style={styles.name} numberOfLines={1}>
                  {t.name}
                </Text>
              </View>
              <Pressable
                onPress={() => toggle(t)}
                disabled={busyId === t.userId}
                style={({ pressed }) => [styles.mark, ok ? styles.markOk : styles.markWait, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}
              >
                <Text style={[styles.markText, { color: ok ? "#fff" : colors.violet }]}>{ok ? "✓ Пришёл" : "Отметить"}</Text>
              </Pressable>
            </Glass>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.glass2, borderRadius: 999, paddingHorizontal: 14, height: 40 },
  listText: { fontFamily: FONT, fontSize: 14.5, fontWeight: "600", color: colors.violet },
  sub: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.grey, marginLeft: 4 },
  search: { borderRadius: 999, height: 48, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, fontFamily: FONT, fontSize: 16, color: colors.ink },
  row: { borderRadius: 22, padding: 10, flexDirection: "row", alignItems: "center", gap: 12 },
  rowOk: { backgroundColor: "rgba(34,181,115,0.10)" },
  code: { fontFamily: FONT, fontSize: 16, fontWeight: "700", color: colors.ink, letterSpacing: 0.5 },
  name: { fontFamily: FONT, fontSize: 14, color: colors.ink2, marginTop: 1 },
  mark: { height: 40, borderRadius: 999, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  markWait: { backgroundColor: colors.lav },
  markOk: { backgroundColor: colors.ok },
  markText: { fontFamily: FONT, fontSize: 14.5, fontWeight: "600" },
  empty: { borderRadius: 26, padding: 22, alignItems: "center", gap: 6 },
  emptyTitle: { fontFamily: FONT, fontSize: 18, fontWeight: "500", color: colors.ink },
});
