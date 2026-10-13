import { useEffect, useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Aurora, Btn, Glass, Grad, Pill, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { cityEventIcon, cityTiles, hostOf, KIND_LABEL, type CityEvent } from "@/lib/cityEvents";
import { openRoute } from "@/lib/route";
import { colors, FONT } from "@/lib/theme";
import { useGuide } from "@/lib/guide";

/** Событие из городской афиши (app/(app)/city/[id]). «Найти компанию» — создать встречу с подставленными данными. */
export default function CityEventScreen() {
  useGuide("city");
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [e, setE] = useState<CityEvent | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    api<{ event?: CityEvent } & Partial<CityEvent>>(`/api/city-events/${id}`)
      .then((r) => setE((r.event ?? r) as CityEvent))
      .catch(() => setMissing(true));
  }, [id]);

  if (!e) {
    return (
      <View style={styles.center}>
        <Aurora />
        <View style={[styles.backAbs, { top: insets.top + 8 }]}>
          <RoundBtn onPress={() => router.back()}>
            <Icon name="back" />
          </RoundBtn>
        </View>
        {missing ? (
          <>
            <Text style={styles.h}>Событие не найдено</Text>
            <Text style={styles.muted}>Возможно, оно уже прошло.</Text>
          </>
        ) : (
          <ActivityIndicator color={colors.violet} />
        )}
      </View>
    );
  }

  const tiles = cityTiles(e);
  const kind = KIND_LABEL[e.kind ?? ""] ?? "Событие";

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          {e.photoUrl ? (
            <Image source={{ uri: e.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <Grad style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
              <Image source={{ uri: cityEventIcon(e.kind) }} style={{ width: 190, height: 190 }} contentFit="contain" />
            </Grad>
          )}
          <LinearGradient colors={["rgba(30,10,70,0.35)", "rgba(0,0,0,0)"]} locations={[0, 0.4]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={[styles.heroTop, { top: insets.top + 8 }]}>
            <RoundBtn onPress={() => router.back()}>
              <Icon name="back" />
            </RoundBtn>
          </View>
        </View>

        <View style={styles.body}>
          <View style={styles.badges}>
            <Pill label={kind} icon={<Image source={{ uri: cityEventIcon(e.kind) }} style={{ width: 20, height: 20 }} />} />
            <Pill kind="white" label="Что ещё в городе" />
          </View>
          <Text style={styles.title}>{e.title}</Text>

          <View style={styles.tiles}>
            <Glass strong style={styles.tile}>
              <Icon name="clock" size={18} color={colors.violet} />
              <Text style={styles.tileB}>{tiles.time}</Text>
              <Text style={styles.muted}>{tiles.day}</Text>
            </Glass>
            <Glass strong style={styles.tile}>
              <Icon name="wallet" size={18} color={colors.violet} />
              <Text style={styles.tileB}>{e.priceText ?? "—"}</Text>
              <Text style={styles.muted}>{e.priceText ? "по афише" : "у организатора"}</Text>
            </Glass>
          </View>

          {e.placeName || e.address ? (
            <Pressable disabled={e.latitude == null || e.longitude == null} onPress={() => openRoute(e.latitude!, e.longitude!)}>
              <Glass strong style={styles.place}>
                <View style={styles.ic}>
                  <Icon name="pin" size={18} color={colors.violet} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.placeName}>{e.placeName ?? "Место проведения"}</Text>
                  {e.address ? <Text style={styles.muted}>{e.address}</Text> : null}
                </View>
                {e.latitude != null ? <Icon name="route" size={20} color={colors.violet} /> : null}
              </Glass>
            </Pressable>
          ) : null}

          {e.description ? (
            <Glass strong style={styles.card}>
              <Text style={styles.desc}>{e.description}</Text>
            </Glass>
          ) : null}

          <Glass strong style={[styles.card, { flexDirection: "row", gap: 10 }]}>
            <Icon name="shield" size={18} color={colors.violet} />
            <Text style={[styles.note, { flex: 1 }]}>
              Это событие из городской афиши ({hostOf(e)}). Билеты и подробности — у организатора. А компанию можно найти здесь 😉
            </Text>
          </Glass>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        {e.sourceUrl ? (
          <Pressable onPress={() => Linking.openURL(e.sourceUrl).catch(() => {})} style={({ pressed }) => [styles.round, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            <Icon name="share" size={22} color={colors.ink} />
          </Pressable>
        ) : null}
        <Btn
          title="Найти компанию"
          icon={<Icon name="people" size={20} color="#fff" />}
          style={{ flex: 1 }}
          onPress={() => router.push({ pathname: "/create", params: { fromCity: e.id, category: e.category } })}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 6, padding: 24 },
  backAbs: { position: "absolute", left: 16 },
  h: { fontFamily: FONT, fontSize: 20, fontWeight: "500", color: colors.ink },
  hero: { height: 330, borderBottomLeftRadius: 36, borderBottomRightRadius: 36, overflow: "hidden", backgroundColor: colors.violet },
  heroTop: { position: "absolute", left: 16 },
  body: { padding: 20, gap: 14 },
  badges: { flexDirection: "row", gap: 6, flexWrap: "wrap" },
  title: { fontFamily: FONT, fontSize: 27, lineHeight: 31, fontWeight: "500", letterSpacing: -0.8, color: colors.ink },
  tiles: { flexDirection: "row", gap: 10 },
  tile: { flex: 1, borderRadius: 22, padding: 14, gap: 4 },
  tileB: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink, marginTop: 4 },
  muted: { fontFamily: FONT, fontSize: 13, color: colors.grey },
  place: { borderRadius: 22, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
  ic: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  placeName: { fontFamily: FONT, fontSize: 15.5, fontWeight: "500", color: colors.ink },
  card: { borderRadius: 22, padding: 16 },
  desc: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: colors.ink2 },
  note: { fontFamily: FONT, fontSize: 13.5, lineHeight: 19, color: colors.ink2 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "rgba(246,242,255,0.92)" },
  round: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
});
