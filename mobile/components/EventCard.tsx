// Карточка встречи как в прототипе (k-hc): вертикальная обложка 3:4, сверху плашка
// «3 из 10 · бег» (или «анонимно», «идёт сейчас»), снизу на затемнении — название
// тонким Inter, строка «Сб, 08:00 · место» и белая кнопка «Я иду».
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { Icon } from "./Icon";
import { FireChip } from "./Fire";
import { CATEGORY_SHORT, colors, eventIcon, FONT, f } from "@/lib/theme";
import { dayShort } from "@/lib/format";
import { distanceShort } from "@/lib/interests";
import { type FeedEvent } from "@/lib/types";

const STATUS_LABEL = { pending: "Заявка отправлена", accepted: "Ты идёшь ✓", rejected: "Не подтвердили" } as const;

export function EventCard({ event: e, width = 300, height = 360 }: { event: FeedEvent; width?: number | `${number}%`; height?: number }) {
  const going = e.seatsTaken + 1;
  const max = e.seatsTotal + 1;
  const full = e.seatsTaken >= e.seatsTotal;
  const kind = e.isBusiness
    ? e.organizer?.name ?? "Афиша"
    : e.category?.slug === "training"
      ? (e.trainingType?.name ?? "тренировка").toLowerCase()
      : (CATEGORY_SHORT[e.category?.slug ?? ""] ?? "встреча").toLowerCase();
  const tag = e.isBusiness ? kind : `${full ? "мест нет" : `${going} из ${max}`} · ${e.isAnonymous ? "анонимно" : kind}`;
  const small = typeof width === "number" && width < 220;
  const place = e.organizerHidden ? "место после одобрения" : e.placeName ?? "";
  const dist = distanceShort(e.distanceM);

  return (
    <Pressable onPress={() => router.push(`/event/${e.id}`)} style={({ pressed }) => [styles.card, { width, height, transform: [{ scale: pressed ? 0.975 : 1 }] }]}>
      {e.photoUrl ? (
        <Image source={{ uri: e.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <LinearGradient colors={["#3F3A4E", "#17141F"]} style={[StyleSheet.absoluteFill, styles.gfx]}>
          <Image source={{ uri: eventIcon(e) }} style={styles.gfxIcon} contentFit="contain" tintColor="#fff" />
        </LinearGradient>
      )}
      <LinearGradient
        colors={["rgba(23,20,31,0.28)", "rgba(23,20,31,0)", "rgba(23,20,31,0.1)", "rgba(23,20,31,0.86)"]}
        locations={[0, 0.25, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.top}>
        <View style={styles.tag}>
          {e.isLive ? <View style={styles.live} /> : null}
          <Text style={styles.tagText} numberOfLines={1}>{e.isLive ? "идёт сейчас" : tag}</Text>
        </View>
        {e.isBoosted && !e.isLive ? (
          <View style={styles.upb} accessibilityLabel="В топе">
            <Icon name="up" size={14} color="#fff" />
          </View>
        ) : null}
        <FireChip eventId={e.id} count={e.fireCount} mine={e.myFire} style={e.isBoosted && !e.isLive ? null : { marginLeft: "auto" }} />
      </View>

      <View style={styles.bottom}>
        <Text style={[styles.title, small && { fontSize: 17, lineHeight: 20 }]} numberOfLines={2}>
          {e.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {dayShort(e.eventDate)}, {e.eventTime.slice(0, 5)}
          {place ? ` · ${place}` : ""}
          {dist ? ` · ${dist}` : ""}
        </Text>
        <View style={styles.go}>
          <Text style={styles.goText} numberOfLines={1}>{e.myApplicationStatus ? STATUS_LABEL[e.myApplicationStatus] : "Я иду"}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    overflow: "hidden",
    backgroundColor: colors.ink,
    shadowColor: "#17141F",
    shadowOpacity: 0.16,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
  gfx: { alignItems: "center", justifyContent: "center", paddingBottom: 60 },
  gfxIcon: { width: "46%", height: "46%", opacity: 0.9 },
  top: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  tag: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    height: 26,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(23,20,31,0.38)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.35)",
    maxWidth: "70%",
  },
  tagText: { color: "#fff", fontSize: 11.5, ...f("500") },
  live: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.ok },
  upb: { marginLeft: "auto", width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(23,20,31,0.38)", borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  bottom: { position: "absolute", left: 12, right: 12, bottom: 12, gap: 4 },
  title: { color: "#fff", fontSize: 21, lineHeight: 24, ...f("300"), letterSpacing: -0.6 },
  meta: { fontFamily: FONT, color: "rgba(255,255,255,0.82)", fontSize: 11.5 },
  go: { alignSelf: "flex-start", marginTop: 6, height: 30, paddingHorizontal: 14, borderRadius: 999, backgroundColor: "#fff", justifyContent: "center" },
  goText: { fontSize: 12.5, ...f("500"), color: colors.ink },
});
