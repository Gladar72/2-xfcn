import { useCallback, useMemo, useState } from "react";
import { Alert, ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Glass, Mosya, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { ConfirmSheet } from "@/components/Sheet";
import { ApplicantRow, type Application } from "@/components/event/Applicant";
import { api, type ApiError } from "@/lib/api";
import { animateNext, manageErrorText, tapOk, tapWarn } from "@/lib/feedback";
import { colors, FONT } from "@/lib/theme";

interface Resp {
  event: { id: string; title: string; seatsTotal: number; seatsTaken: number };
  applications: Application[];
}

/** «Заявки на встречу» — все отклики и решения (app/(app)/events/[id]/applications). */
export default function ApplicationsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<Resp | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [remove, setRemove] = useState<Application | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<Resp>(`/api/events/${id}/applications`));
      setError(null);
    } catch (e) {
      setError((e as ApiError).code === "forbidden" ? "Это не твоя встреча." : "Не удалось загрузить заявки.");
    }
    setRefreshing(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const { fresh, decided } = useMemo(() => {
    const list = (data?.applications ?? []).filter((a) => a.applicant);
    return {
      fresh: list.filter((a) => a.status === "pending"),
      decided: list.filter((a) => a.status !== "pending").reverse(),
    };
  }, [data]);

  async function decide(app: Application, action: "accept" | "reject") {
    try {
      await api(`/api/applications/${app.id}`, { method: "PATCH", body: { action } });
      if (action === "accept") tapOk();
      animateNext();
      setData((d) =>
        d
          ? {
              event: { ...d.event, seatsTaken: d.event.seatsTaken + (action === "accept" ? 1 : 0) },
              applications: d.applications.map((a) => (a.id === app.id ? { ...a, status: (action === "accept" ? "accepted" : "rejected") as Application["status"] } : a)),
            }
          : d
      );
    } catch (e) {
      tapWarn();
      Alert.alert("Не получилось", manageErrorText(e));
      load();
    }
  }

  async function confirmRemove() {
    if (!remove?.applicant) return;
    setBusy(true);
    try {
      await api(`/api/events/${id}/members/${remove.applicant.id}`, { method: "DELETE" });
      tapOk();
      animateNext();
      setData((d) =>
        d
          ? {
              event: { ...d.event, seatsTaken: Math.max(0, d.event.seatsTaken - 1) },
              applications: d.applications.map((a) => (a.id === remove.id ? { ...a, status: "removed" as const } : a)),
            }
          : d
      );
      setRemove(null);
    } catch (e) {
      tapWarn();
      setRemove(null);
      Alert.alert("Не получилось", manageErrorText(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 12 }}
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
      >
        <RoundBtn onPress={() => router.back()}>
          <Icon name="back" />
        </RoundBtn>
        <Title plain="Заяв" em="ки" size={30} style={{ marginLeft: 4 }} />
        {data ? (
          <Text style={styles.sub} numberOfLines={2}>
            {data.event.title} · занято {data.event.seatsTaken + 1} из {data.event.seatsTotal + 1}
          </Text>
        ) : null}

        {!data && !error ? <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} /> : null}
        {error ? <Text style={styles.sub}>{error}</Text> : null}

        {data && fresh.length === 0 && decided.length === 0 ? (
          <Glass strong style={styles.empty}>
            <Mosya pose="wave" size={110} />
            <Text style={styles.emptyTitle}>Пока никто не откликнулся</Text>
            <Text style={styles.sub}>Поделись встречей — так заявки придут быстрее.</Text>
          </Glass>
        ) : null}

        {fresh.length > 0 ? (
          <View style={{ gap: 10 }}>
            <Text style={styles.section}>Новые заявки</Text>
            {fresh.map((a) => (
              <ApplicantRow key={a.id} app={a} onDecide={decide} />
            ))}
          </View>
        ) : null}

        {decided.length > 0 ? (
          <View style={{ gap: 10, marginTop: 6 }}>
            <Text style={styles.section}>Решения</Text>
            {decided.map((a) => (
              <ApplicantRow key={a.id} app={a} showStatus onRemove={setRemove} />
            ))}
          </View>
        ) : null}
      </ScrollView>

      <ConfirmSheet
        visible={!!remove}
        title={remove?.applicant ? `Убрать ${remove.applicant.name}?` : "Убрать участника?"}
        text="Человек выйдет из встречи и чата, место освободится."
        confirm="Да, убрать"
        busyText="Убираем…"
        danger
        busy={busy}
        onConfirm={confirmRemove}
        onClose={() => setRemove(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.grey, marginLeft: 4 },
  section: { fontFamily: FONT, fontSize: 19, fontWeight: "500", color: colors.ink, letterSpacing: -0.4, marginLeft: 4 },
  empty: { borderRadius: 26, padding: 22, alignItems: "center", gap: 8, marginTop: 10 },
  emptyTitle: { fontFamily: FONT, fontSize: 18, fontWeight: "500", color: colors.ink },
});
