import { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Stack, useLocalSearchParams, router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Image } from "expo-image";
import MapView, { Marker } from "react-native-maps";
import { Avatar, Button } from "@/components/ui";
import { api, type ApiError } from "@/lib/api";
import { formatEventDate, seatsLeft } from "@/lib/format";
import { openRoute } from "@/lib/route";
import { colors, font, radius } from "@/lib/theme";
import type { EventDetail } from "@/lib/types";

const APPLY_ERRORS: Record<string, string> = {
  event_full: "Мест больше нет",
  already_applied: "Ты уже отправил заявку",
  applications_limit_reached: "Достигнут лимит заявок на твоём тарифе",
  blocked: "Нельзя записаться на эту встречу",
};

export default function EventScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<EventDetail>(`/api/events/${id}`).then(setEvent).catch((e) => setError((e as Error).message));
  }, [id]);
  useEffect(load, [load]);

  // «Поделиться»: системное окно (Telegram, WhatsApp, VK…). Ссылка ведёт в бота,
  // он присылает карточку встречи с кнопкой «Открыть встречу».
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
        {error ? <Text style={{ color: colors.ink600 }}>{error}</Text> : <ActivityIndicator color={colors.accent} />}
      </View>
    );
  }

  const hasCoords = event.latitude != null && event.longitude != null;
  const full = event.seatsTaken >= event.seatsTotal;
  const action = (() => {
    switch (event.viewerStatus) {
      case "organizer":
        return <Button title="Это твоя встреча" variant="soft" disabled />;
      case "accepted":
        return <Button title="Открыть чат встречи" onPress={() => router.push("/(tabs)/chats")} />;
      case "pending":
        return <Button title="Заявка отправлена" variant="soft" disabled />;
      case "rejected":
        return <Button title="Заявка не подтверждена" variant="soft" disabled />;
      default:
        return <Button title={full ? "Мест нет" : "Я иду"} onPress={apply} loading={busy} disabled={full || event.status !== "active"} />;
    }
  })();

  return (
    <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
      <Stack.Screen
        options={{
          title: event.category?.name ?? "Встреча",
          headerRight: () => (
            <Pressable onPress={share} hitSlop={10} accessibilityLabel="Поделиться встречей">
              <Ionicons name="share-outline" size={24} color={colors.accent} />
            </Pressable>
          ),
        }}
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        {event.photoUrl ? (
          <Image source={{ uri: event.photoUrl }} style={styles.hero} contentFit="cover" />
        ) : hasCoords ? (
          <MapView
            style={styles.hero}
            pointerEvents="none"
            initialRegion={{ latitude: event.latitude!, longitude: event.longitude!, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          >
            <Marker coordinate={{ latitude: event.latitude!, longitude: event.longitude! }} pinColor={colors.accent} />
          </MapView>
        ) : null}

        <View style={styles.body}>
          <Text style={styles.title}>{event.title}</Text>
          <Text style={styles.meta}>🗓 {formatEventDate(event.eventDate, event.eventTime)}{event.eventEndTime ? ` – ${event.eventEndTime.slice(0, 5)}` : ""}</Text>
          {event.placeName || event.address ? <Text style={styles.meta}>📍 {[event.placeName, event.address].filter(Boolean).join(", ")}</Text> : null}
          <Text style={styles.meta}>👥 {seatsLeft(event.seatsTotal, event.seatsTaken)} из {event.seatsTotal}</Text>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
            {hasCoords ? (
              <Button title="Маршрут ↗" variant="soft" onPress={() => openRoute(event.latitude!, event.longitude!)} style={{ flex: 1 }} />
            ) : null}
            <Button title="Поделиться" variant="soft" onPress={share} style={{ flex: 1 }} />
          </View>

          {event.description ? <Text style={styles.desc}>{event.description}</Text> : null}

          {event.organizer ? (
            <View style={styles.card}>
              <Avatar uri={event.organizer.avatarUrl} name={event.organizer.name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={styles.orgName}>{event.organizer.name}, {event.organizer.age}</Text>
                <Text style={styles.meta}>
                  Организатор · ★ {event.organizer.ratingAvg?.toFixed?.(1) ?? "—"} · встреч: {event.organizer.completedMeetingsCount}
                </Text>
              </View>
            </View>
          ) : null}

          {event.participants.length > 0 ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.section}>Уже идут</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {event.participants.map((p) => (
                  <View key={p.id} style={{ alignItems: "center", width: 64 }}>
                    <Avatar uri={p.avatarUrl} name={p.name} size={48} />
                    <Text numberOfLines={1} style={{ fontSize: font.xs, color: colors.ink600 }}>{p.name}</Text>
                  </View>
                ))}
              </View>
            </View>
          ) : null}
        </View>
      </ScrollView>
      <View style={styles.footer}>{action}</View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { width: "100%", aspectRatio: 1.4 },
  body: { padding: 16, gap: 8 },
  title: { fontSize: font.title + 2, fontWeight: "800", color: colors.ink900 },
  meta: { fontSize: font.sm, color: colors.ink600 },
  desc: { fontSize: font.base, color: colors.ink900, lineHeight: 22, marginTop: 8 },
  card: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: "#fff", borderRadius: radius.card, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
  orgName: { fontSize: font.base, fontWeight: "700", color: colors.ink900 },
  section: { fontSize: font.base, fontWeight: "800", color: colors.ink900, marginTop: 8 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: "#fff" },
});
