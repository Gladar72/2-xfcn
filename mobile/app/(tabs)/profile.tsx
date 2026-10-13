import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { Aurora, Glass, Mosya } from "@/components/brand";
import { Icon, type IconName } from "@/components/Icon";
import { Avatar } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { colors, FONT } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";

export default function ProfileScreen() {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<MyProfile | null>(null);

  useFocusEffect(
    useCallback(() => {
      api<MyProfile>("/api/me/profile").then(setMe).catch(() => {});
    }, [])
  );

  function confirmSignOut() {
    Alert.alert("Выйти из аккаунта?", "", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 120, gap: 12 }} showsVerticalScrollIndicator={false}>
        <View style={styles.card}>
          <LinearGradient colors={["#6C3BFF", "#A24DFF", "#FF6FA0"]} start={{ x: 0, y: 0.2 }} end={{ x: 1, y: 0.8 }} style={StyleSheet.absoluteFill} />
          <Mosya pose="glasses" size={96} style={styles.mosya} />
          <View style={styles.avaRing}>
            <Avatar uri={me?.avatarUrl} name={me?.name} size={96} />
          </View>
          <Text style={styles.name}>{me ? `${me.name}, ${me.age}` : " "}</Text>
          <Text style={styles.city}>{me?.city ?? ""}</Text>
          {me?.bio ? <Text style={styles.bio}>{me.bio}</Text> : null}
          <View style={styles.stats}>
            <Stat value={me?.ratingAvg ? me.ratingAvg.toFixed(1) : "—"} label="рейтинг" />
            <View style={styles.statSep} />
            <Stat value={String(me?.eventsOrganizedCount ?? 0)} label="создал" />
            <View style={styles.statSep} />
            <Stat value={String(me?.eventsAttendedCount ?? 0)} label="сходил" />
          </View>
        </View>

        <Glass strong style={styles.list}>
          <Row icon="cal" label="Мои встречи" onPress={() => router.push("/my-events")} />
          <Row icon="mail" label={me?.email ? `Почта: ${me.email}` : "Привязать почту для входа"} onPress={() => router.push("/link-email")} />
          <Row icon="tg" label="Открыть «Место» в Telegram" onPress={() => Linking.openURL("https://t.me/Mesto_people_bot")} />
          <Row icon="doc" label="Оферта" onPress={() => Linking.openURL(`${API_URL}/legal/offer`)} />
          <Row icon="shield" label="Политика конфиденциальности" onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)} last />
        </Glass>

        <Pressable onPress={confirmSignOut} style={styles.logout} hitSlop={8}>
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, onPress, last }: { icon: IconName; label: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowSep, pressed && { opacity: 0.7 }]}>
      <View style={styles.rowIc}>
        <Icon name={icon} size={19} color={colors.violet} />
      </View>
      <Text style={styles.rowText} numberOfLines={1}>
        {label}
      </Text>
      <Icon name="chev" size={18} color={colors.grey} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 32, padding: 20, paddingTop: 26, alignItems: "center", gap: 4, overflow: "hidden" },
  mosya: { position: "absolute", right: -6, top: -4, opacity: 0.95 },
  avaRing: { padding: 4, borderRadius: 60, backgroundColor: "rgba(255,255,255,0.35)" },
  name: { fontFamily: FONT, fontSize: 24, fontWeight: "500", color: "#fff", marginTop: 8, letterSpacing: -0.5 },
  city: { fontFamily: FONT, fontSize: 14, color: "rgba(255,255,255,0.85)" },
  bio: { fontFamily: FONT, fontSize: 14, color: "#fff", textAlign: "center", marginTop: 6, opacity: 0.95 },
  stats: { flexDirection: "row", marginTop: 16, alignSelf: "stretch", backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 22, paddingVertical: 12, borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  statSep: { width: 1, backgroundColor: "rgba(255,255,255,0.3)" },
  statValue: { fontFamily: FONT, fontSize: 22, fontWeight: "500", color: "#fff" },
  statLabel: { fontFamily: FONT, fontSize: 12, color: "rgba(255,255,255,0.85)" },
  list: { borderRadius: 26, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 13 },
  rowSep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(108,59,255,0.15)" },
  rowIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, fontFamily: FONT, fontSize: 15, color: colors.ink },
  logout: { alignItems: "center", paddingVertical: 14 },
  logoutText: { fontFamily: FONT, fontSize: 15, color: colors.grey },
});
