import { useCallback, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { Aurora, Btn, Glass, RoundBtn, Title, Wordmark } from "@/components/brand";
import { Sheet } from "@/components/Sheet";
import { applyReferralCode } from "@/lib/referral";
import { CitySheet } from "@/components/CitySheet";
import { Icon, type IconName } from "@/components/Icon";
import { api } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { API_URL } from "@/lib/config";
import { tapLight, tapOk, tapWarn } from "@/lib/feedback";
import { PLAN_NAME, untilLabel, type Subscription } from "@/lib/subscription";
import { colors, FONT, f } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";
import { useGuide } from "@/lib/guide";

/** «Настройки» (app/(app)/settings в мини-приложении). */
export default function SettingsScreen() {
  useGuide("settings");
  const insets = useSafeAreaInsets();
  const { signOut } = useAuth();
  const [me, setMe] = useState<MyProfile | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [morning, setMorning] = useState(true);
  const [cityOpen, setCityOpen] = useState(false);
  const [refOpen, setRefOpen] = useState(false);
  const [refCode, setRefCode] = useState("");
  const [refBusy, setRefBusy] = useState(false);
  const [refMsg, setRefMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function submitRef() {
    setRefBusy(true);
    const err = await applyReferralCode(refCode);
    setRefBusy(false);
    if (err) {
      tapWarn();
      setRefMsg({ ok: false, text: err });
    } else {
      tapOk();
      setRefMsg({ ok: true, text: "Готово! Код партнёра применён" });
      setTimeout(() => setRefOpen(false), 1200);
    }
  }

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

  /** Удаление аккаунта (152-ФЗ, требование App Store): два подтверждения, потом выход. */
  function confirmDelete() {
    Alert.alert(
      "Удалить аккаунт?",
      "Удалятся профиль, фото, твои встречи, заявки, чаты и отзывы. Подписка перестанет действовать. Вернуть данные будет нельзя.",
      [
        { text: "Не удалять", style: "cancel" },
        {
          text: "Удалить навсегда",
          style: "destructive",
          onPress: async () => {
            try {
              await api("/api/me", { method: "DELETE" });
              tapOk();
              Alert.alert("Аккаунт удалён", "Будем рады видеть тебя снова в «Месте».");
              await signOut();
            } catch {
              tapWarn();
              Alert.alert("Не получилось", "Попробуй ещё раз или напиши в поддержку.");
            }
          },
        },
      ]
    );
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
            onPress={() => router.push("/subscription")}
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
          <Row icon="bell" label="Уведомления" onPress={() => router.push("/notifications")} />
          <Row icon="mask" label="Приватность и анонимность" onPress={() => router.push("/privacy")} last />
        </Glass>

        <Text style={styles.section}>Помощь</Text>
        <Glass strong style={styles.list}>
          <Row icon="help" label="Помощь и поддержка" sub="Мося ответит сразу, команда — в течение дня" onPress={() => router.push("/support")} />
          <Row icon="gift" label="Партнёрская программа" sub="30% с каждой оплаты приведённых людей" onPress={() => router.push("/partner")} />
          <Row
            icon="star"
            label="Ввести код приглашения"
            sub="Если тебя позвал блогер или друг"
            onPress={() => {
              setRefCode("");
              setRefMsg(null);
              setRefOpen(true);
            }}
            last
          />
        </Glass>

        <Text style={styles.section}>Вход</Text>
        <Glass strong style={styles.list}>
          <Row icon="mail" label="Почта" sub={me?.email ?? "не привязана"} onPress={() => router.push("/link-email")} />
          <Row icon="nav" label="Телефон" sub={me?.phone ?? "не привязан"} onPress={() => router.push("/link-phone")} last />
        </Glass>

        <Text style={styles.section}>Документы</Text>
        <Glass strong style={styles.list}>
          <Row icon="doc" label="Оферта" onPress={() => Linking.openURL(`${API_URL}/legal/offer`)} />
          <Row icon="shield" label="Политика конфиденциальности" onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)} />
          <Row icon="doc" label="Согласие на обработку данных" onPress={() => Linking.openURL(`${API_URL}/legal/consent`)} last />
        </Glass>

        <Pressable onPress={confirmSignOut} style={({ pressed }) => [styles.logout, pressed && { opacity: 0.7 }]}>
          <Text style={styles.logoutText}>Выйти из аккаунта</Text>
        </Pressable>
        <Pressable onPress={confirmDelete} style={({ pressed }) => [styles.logout, { paddingTop: 0 }, pressed && { opacity: 0.7 }]}>
          <Text style={[styles.logoutText, { fontSize: 14, color: colors.grey }]}>Удалить аккаунт</Text>
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
      <Sheet visible={refOpen} onClose={() => setRefOpen(false)}>
        <Text style={styles.sheetTitle}>Код приглашения</Text>
        <Text style={styles.sub}>Код из ссылки партнёра — например, mesto-go.ru/r/abcd2345. Ввести можно в первые 30 дней после регистрации.</Text>
        <Glass strong style={styles.refInput}>
          <TextInput
            value={refCode}
            onChangeText={(t) => setRefCode(t.replace(/[^a-zA-Z0-9]/g, "").toLowerCase())}
            placeholder="код"
            placeholderTextColor={colors.grey}
            autoCapitalize="none"
            autoCorrect={false}
            maxLength={32}
            style={styles.refText}
          />
        </Glass>
        {refMsg ? <Text style={[styles.sub, { color: refMsg.ok ? colors.ok : colors.danger, marginBottom: 8 }]}>{refMsg.text}</Text> : null}
        <Btn kind="v" title={refBusy ? "Проверяем…" : "Применить"} onPress={submitRef} disabled={refBusy || refCode.length < 4} />
      </Sheet>
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
  section: { fontSize: 13, ...f("600"), color: colors.grey, textTransform: "uppercase", letterSpacing: 0.6, marginLeft: 8, marginTop: 6 },
  list: { borderRadius: 24, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  sep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(108,59,255,0.15)" },
  ic: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: FONT, fontSize: 15.5, color: colors.ink },
  sub: { fontFamily: FONT, fontSize: 12.5, lineHeight: 17, color: colors.grey, marginTop: 1 },
  logout: { alignItems: "center", paddingVertical: 16, marginTop: 4 },
  logoutText: { fontSize: 15.5, ...f("500"), color: colors.danger },
  about: { alignItems: "center", gap: 6, marginTop: 4 },
  tagline: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  sheetTitle: { fontSize: 19, ...f("600"), color: colors.ink, marginBottom: 4 },
  refInput: { borderRadius: 18, paddingHorizontal: 16, marginVertical: 12 },
  refText: { fontFamily: FONT, fontSize: 20, letterSpacing: 2, color: colors.ink, paddingVertical: 12, textAlign: "center" },
});
