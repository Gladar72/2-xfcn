// Карточка встречи «hero» — как на главной мини-приложения: фото или 3D-иконка
// категории на градиенте, сверху «1 из 4» и «Анонимно», снизу стеклянная
// плашка с названием, временем, местом и ценой.
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";
import { router } from "expo-router";
import { Faces, Grad, Pill } from "./brand";
import { Icon } from "./Icon";
import { colors, eventIcon, FONT } from "@/lib/theme";
import { costShort, dayShort } from "@/lib/format";
import { distanceShort } from "@/lib/interests";
import type { FeedEvent } from "@/lib/types";

const STATUS_LABEL = { pending: "Заявка отправлена", accepted: "Ты идёшь", rejected: "Не подтвердили" } as const;

export function EventCard({ event: e, width = 300, height = 360 }: { event: FeedEvent; width?: number | `${number}%`; height?: number }) {
  const going = e.seatsTaken + 1;
  const max = e.seatsTotal + 1;
  const full = e.seatsTaken >= e.seatsTotal;

  return (
    <Pressable onPress={() => router.push(`/event/${e.id}`)} style={({ pressed }) => [styles.card, { width, height, transform: [{ scale: pressed ? 0.975 : 1 }] }]}>
      <Grad style={StyleSheet.absoluteFill} />
      {e.photoUrl ? (
        <Image source={{ uri: e.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.gfx]}>
          <Image source={{ uri: eventIcon(e) }} style={styles.gfxIcon} contentFit="contain" />
        </View>
      )}
      <LinearGradient
        colors={["rgba(60,20,140,0.28)", "rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(40,10,70,0.5)"]}
        locations={[0, 0.28, 0.5, 1]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <View style={styles.top}>
        <View style={styles.glassPill}>
          {e.isBusiness ? (
            <Text style={styles.glassText} numberOfLines={1}>{e.organizer?.name ?? "Бизнес событие"}</Text>
          ) : (
            <>
              <Faces people={e.goingPreview ?? []} size={22} ring="rgba(255,255,255,0.55)" />
              <Text style={styles.glassText}>{full ? `${going} · мест нет` : `${going} из ${max}`}</Text>
            </>
          )}
        </View>
        {e.isAnonymous ? (
          <View style={styles.glassPill}>
            <Text style={styles.glassText}>Анонимно</Text>
          </View>
        ) : null}
      </View>

      <View style={styles.badges}>
        {e.isLive ? <Pill kind="live" label="Идёт сейчас" /> : e.isBoosted ? <Pill kind="white" label="Поднято" icon={<Icon name="up" size={14} color={colors.violet} />} /> : null}
        {e.myApplicationStatus ? <Pill kind="white" label={STATUS_LABEL[e.myApplicationStatus]} /> : null}
      </View>

      <View style={styles.bar}>
        <BlurView intensity={30} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.barTint} />
        <Text style={styles.title} numberOfLines={2}>
          {e.title}
        </Text>
        <View style={styles.barRow}>
          <View style={styles.dt}>
            <Text style={styles.dtTime}>{e.eventTime.slice(0, 5)}</Text>
            <Text style={styles.dtDay}>{dayShort(e.eventDate)}</Text>
          </View>
          <View style={styles.place}>
            <Icon name="pin" size={15} color="#fff" />
            <Text style={styles.placeText} numberOfLines={1}>
              {e.organizerHidden ? "место — после одобрения" : e.placeName ?? "место уточняется"}
              {distanceShort(e.distanceM) ? ` · ${distanceShort(e.distanceM)}` : ""}
            </Text>
          </View>
          <View style={styles.price}>
            <Text style={styles.priceText} numberOfLines={1}>{costShort(e)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 32,
    overflow: "hidden",
    backgroundColor: colors.violet,
    shadowColor: "#5A28B4",
    shadowOpacity: 0.45,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 16 },
    elevation: 6,
  },
  gfx: { alignItems: "center", justifyContent: "center", paddingBottom: 70 },
  gfxIcon: { width: "62%", height: "62%" },
  top: { position: "absolute", top: 14, left: 14, right: 14, flexDirection: "row", justifyContent: "space-between", gap: 8 },
  glassPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.3)",
    maxWidth: "70%",
  },
  glassText: { fontFamily: FONT, color: "#fff", fontSize: 13, fontWeight: "500" },
  badges: { position: "absolute", top: 56, left: 14, gap: 6 },
  bar: { position: "absolute", left: 10, right: 10, bottom: 10, borderRadius: 24, overflow: "hidden", padding: 10, gap: 8 },
  barTint: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(40,16,90,0.32)", borderRadius: 24, borderWidth: 1, borderColor: "rgba(255,255,255,0.35)" },
  title: { fontFamily: FONT, color: "#fff", fontSize: 17, fontWeight: "500", letterSpacing: -0.2, paddingHorizontal: 4 },
  barRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  dt: { width: 52, height: 52, borderRadius: 18, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  dtTime: { fontFamily: FONT, fontSize: 15, fontWeight: "600", color: colors.ink },
  dtDay: { fontFamily: FONT, fontSize: 10.5, color: colors.grey, marginTop: 2 },
  place: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  placeText: { fontFamily: FONT, color: "#fff", fontSize: 12.5, opacity: 0.92, flexShrink: 1 },
  price: { height: 36, paddingHorizontal: 13, borderRadius: 999, backgroundColor: "#fff", justifyContent: "center", maxWidth: 110 },
  priceText: { fontFamily: FONT, fontSize: 13, fontWeight: "500", color: colors.ink },
});
