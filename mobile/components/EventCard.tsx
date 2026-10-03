import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router } from "expo-router";
import { Avatar } from "./ui";
import { colors, font, radius } from "@/lib/theme";
import { formatEventDate, seatsLeft } from "@/lib/format";
import type { FeedEvent } from "@/lib/types";

const STATUS_LABEL = { pending: "Заявка отправлена", accepted: "Ты идёшь", rejected: "Заявка не подтверждена" } as const;

export function EventCard({ event }: { event: FeedEvent }) {
  const full = event.seatsTaken >= event.seatsTotal;
  return (
    <Pressable
      onPress={() => router.push(`/event/${event.id}`)}
      style={({ pressed }) => [styles.card, event.isHighlighted && styles.highlight, pressed && { opacity: 0.9 }]}
    >
      {event.photoUrl ? <Image source={{ uri: event.photoUrl }} style={styles.photo} contentFit="cover" transition={150} /> : null}
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.category}>
            {event.category?.emoji ? `${event.category.emoji} ` : ""}
            {event.trainingType?.name ?? event.category?.name ?? "Встреча"}
          </Text>
          {event.isBusiness ? <Text style={styles.business}>Бизнес</Text> : null}
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.meta}>{formatEventDate(event.eventDate, event.eventTime)}</Text>
        {event.placeName || event.address ? (
          <Text style={styles.meta} numberOfLines={1}>
            📍 {event.placeName ?? event.address}
          </Text>
        ) : null}
        <View style={[styles.row, { marginTop: 10 }]}>
          <View style={[styles.row, { gap: 8, flex: 1 }]}>
            <Avatar uri={event.organizer?.avatarUrl} name={event.organizer?.name} size={28} />
            <Text style={styles.org} numberOfLines={1}>
              {event.organizer ? `${event.organizer.name}, ${event.organizer.age}` : ""}
            </Text>
          </View>
          <Text style={[styles.seats, full && { color: colors.ink400 }]}>
            {event.myApplicationStatus ? STATUS_LABEL[event.myApplicationStatus] : seatsLeft(event.seatsTotal, event.seatsTaken)}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: radius.card, overflow: "hidden", borderWidth: 1, borderColor: colors.border },
  highlight: { borderColor: colors.accentSoft, borderWidth: 2 },
  photo: { width: "100%", aspectRatio: 1.9 },
  body: { padding: 16, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  category: { fontSize: font.xs, color: colors.accent, fontWeight: "700" },
  business: { fontSize: font.xs, color: colors.orange, fontWeight: "700" },
  title: { fontSize: 18, fontWeight: "800", color: colors.ink900 },
  meta: { fontSize: font.sm, color: colors.ink600 },
  org: { fontSize: font.sm, color: colors.ink900, fontWeight: "600", flexShrink: 1 },
  seats: { fontSize: font.sm, color: colors.accent, fontWeight: "700" },
});
