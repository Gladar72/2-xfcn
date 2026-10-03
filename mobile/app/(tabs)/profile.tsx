import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useFocusEffect } from "expo-router";
import { Image } from "expo-image";
import Ionicons from "@expo/vector-icons/Ionicons";
import { Avatar, Button } from "@/components/ui";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { colors, font, radius } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";

export default function ProfileScreen() {
  const { signOut } = useAuth();
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
    <SafeAreaView edges={["top"]} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text style={styles.title}>Профиль</Text>
        <View style={styles.card}>
          <Image source={require("@/assets/mascot.png")} style={styles.mascot} contentFit="contain" />
          <Avatar uri={me?.avatarUrl} name={me?.name} size={96} />
          <Text style={styles.name}>{me ? `${me.name}, ${me.age}` : " "}</Text>
          <Text style={styles.meta}>{me?.city ?? ""}</Text>
          {me?.bio ? <Text style={styles.bio}>{me.bio}</Text> : null}
          <View style={styles.stats}>
            <Stat value={me?.ratingAvg ? me.ratingAvg.toFixed(1) : "—"} label="рейтинг" />
            <Stat value={String(me?.eventsOrganizedCount ?? 0)} label="создал" />
            <Stat value={String(me?.eventsAttendedCount ?? 0)} label="сходил" />
          </View>
        </View>

        <Row
          icon="mail-outline"
          label={me?.email ? `Почта ${me.email}` : "Привязать почту для входа"}
          onPress={() => router.push("/link-email")}
        />
        <Row icon="document-text-outline" label="Оферта" onPress={() => Linking.openURL(`${API_URL}/legal/offer`)} />
        <Row icon="shield-checkmark-outline" label="Политика конфиденциальности" onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)} />
        <Row icon="paper-plane-outline" label="Открыть «Место» в Telegram" onPress={() => Linking.openURL("https://t.me/Mesto_people_bot")} />

        <Button title="Выйти" variant="ghost" onPress={confirmSignOut} />
      </ScrollView>
    </SafeAreaView>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ alignItems: "center", flex: 1 }}>
      <Text style={{ fontSize: font.title, fontWeight: "800", color: colors.ink900 }}>{value}</Text>
      <Text style={{ fontSize: font.xs, color: colors.ink600 }}>{label}</Text>
    </View>
  );
}

function Row({ icon, label, onPress }: { icon: keyof typeof Ionicons.glyphMap; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={22} color={colors.accent} />
      <Text style={{ flex: 1, fontSize: font.base, color: colors.ink900, fontWeight: "600" }}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.ink400} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: font.display, fontWeight: "800", color: colors.ink900 },
  card: { backgroundColor: "#fff", borderRadius: radius.card, padding: 20, alignItems: "center", gap: 6, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  mascot: { position: "absolute", right: -10, top: -6, width: 90, height: 86, opacity: 0.9 },
  name: { fontSize: font.title, fontWeight: "800", color: colors.ink900, marginTop: 6 },
  meta: { fontSize: font.sm, color: colors.ink600 },
  bio: { fontSize: font.sm, color: colors.ink900, textAlign: "center", marginTop: 4 },
  stats: { flexDirection: "row", marginTop: 12, alignSelf: "stretch" },
  row: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: "#fff", borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.border },
});
