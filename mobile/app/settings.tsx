import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Aurora, Glass, RoundBtn, Title, Wordmark } from "@/components/brand";
import { CitySheet } from "@/components/CitySheet";
import { Icon, type IconName } from "@/components/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { tapLight, tapOk, tapWarn } from "@/lib/feedback";
import { PLAN_NAME, untilLabel, type Subscription } from "@/lib/subscription";
import { colors, FONT } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";

/** «Настройки» (app/(app)/settings в мини-приложении). */
export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [me, setMe] = useState<MyProfile | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [morning, setMorning] = useState(true);
  const [cityOpen, setCityOpen] = useState(false);

  useFocusEffect(
    useCallback(() => {
      api<MyProfile>("/api/me/profile")
        .then((r) => {
          setMe(r);
          setMorning(r.morningRemindersEnabled !== false);
        })
        .catch(() => {});
      api<Subscription>("/api/subscriptions").then(setSub).catch(() => {});
    }, [])
  );

  async function toggleMorning(v: boolean) {
    tapLight();
    setMorning(v);
    try {
      await api("/api/me/profile", { method: "PATCH", body: { morningRemindersEnabled: v } });
    } catch {
      setMorning(!v);
      Alert.alert("Не получилось", "Попробуй ещё раз");
    }
  }

  async function pickCity(city: string) {
    setCityOpen(false);
    if (!me || city === me.city) return;
    const prev = me.city;
    setMe({ ...me, city });
    try {
      await api("/api/me/profile", { method: "PATCH", body: { city } });
      tapOk();
    } catch {
      tapWarn();
      setMe((m) => (m ? { ...m, city: prev } : m));
      Alert.alert("Не получилось", "Выбери город из списка");
    }
  }

  function confirmSignOut() {
    Alert.alert("Выйти из аккаунта?", "Чтобы вернуться, понадобится войти по телефону или почте.", [
      { text: "Отмена", style: "cancel" },
      { text: "Выйти", style: "destructive", onPress: () => void signOut() },
    ]);
  }

  const planLabel = sub ? (sub.active ? `${PLAN_NAME[sub.plan ?? ""] ?? "Тариф"} · до ${untilLabel(sub.periodEnd)}` : "без подписки") : " ";
  const version = Constants.expoConfig?.version ?? "1.0";

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 12 }}>
        <RoundBtn onPress={() => router.back()}>
          <Icon name="back" />
        </RoundBtn>
        <Title plain="Наст" em="ройки" size={30} style={{ marginLeft: 4 }} />

        <Text style={styles.section}>Аккаунт</Text>
        <Glass strong style={styles.list}>
          <Row icon="user" label="Профиль" sub={me?.name} onPress={() => router.push("/profile-edit")} />
          <Row
            icon="wallet"
            label="Мой тариф"
            sub={planLabel}
            onPress={() => Alert.alert("Тарифы", "Подключить или продлить тариф в приложении можно будет совсем скоро.")}
          />
          <Row icon="pin" label="Город" sub={me?.city} onPress={() => setCityOpen(true)} />
          <View style={[styles.row, styles.sep]}>
            <View style={styles.ic}>
              <Icon name="sun" size={18} color={colors.violet} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Утренние приглашения</Text>
              <Text style={styles.sub}>Иногда предлагаем идею на день — не чаще пары раз в неделю</Text>
            </View>
            <Switch value={morning} onValueChange={toggleMorning} trackColor={{ true: colors.violet, false: "rgba(22,18,31,0.15)" }} thumbColor="#fff" />
          </View>
          <Row icon="bell" label="Уведомления" onPress={() => router.push("/notifications")} last />
        </Glass>

        <Text style={styles.section}>Вход</Text>
        <Glass strong style={styles.list}>
          <Row icon="mail" label="Почта" sub={me?.email ?? "не привязана"} onPress={() => router.push("/link-email")} />
          <Row icon="nav" label="Телефон" sub={me?.phone ?? "не привязан"} onPress={() => router.push("/link-phone")} last />
        </Glass>

        <Text style={styles.section}>Документы</Text>
        <Glass strong style={styles.list}>
          <Row icon="doc" label="Оферта" onPress={() => Linking.openURL(`${API_URL}/legal/offer`)} />
          <Row icon="shield" label="Политика конфиденциальности" onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)} last />
        </Glass>

        <Pressable onPress={confirmSignOut} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]}>
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>

        <View style={styles.about}>
          <Wordmark height={22} color={colors.grey} />
          <Text style={styles.tagline}>Когда есть куда пойти, но не с кем.</Text>
          <Text style={styles.tagline}>
            Версия {version}
            {me?.city ? ` · ${me.city}` : ""}
          </Text>
        </View>
      </ScrollView>

      <CitySheet visible={cityOpen} value={me?.city} onPick={pickCity} onClose={() => setCityOpen(false)} />
    </View>
  );
}

function Row({ icon, label, sub, onPress, last }: { icon: IconName; label: string; sub?: string | null; onPress: () => void; last?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.sep, pressed && { opacity: 0.7 }]}>
      <View style={styles.ic}>
        <Icon name={icon} size={18} color={colors.violet} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.label}>{label}</Text>
        {sub ? (
          <Text style={styles.sub} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      <Icon name="chev" size={18} color={colors.grey} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: { fontFamily: FONT, fontSize: 13, fontWeight: "600", color: colors.grey, textTransform: "uppercase", letterSpacing: 0.6, marginLeft: 8, marginTop: 6 },
  list: { borderRadius: 24, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  sep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(108,59,255,0.15)" },
  ic: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: FONT, fontSize: 15.5, color: colors.ink },
  sub: { fontFamily: FONT, fontSize: 12.5, lineHeight: 17, color: colors.grey, marginTop: 1 },
  logout: { alignItems: "center", paddingVertical: 16, marginTop: 4 },
  logoutText: { fontFamily: FONT, fontSize: 15.5, fontWeight: "500", color: colors.danger },
  about: { alignItems: "center", gap: 6, marginTop: 4 },
  tagline: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
});
