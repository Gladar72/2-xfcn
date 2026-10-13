import { useEffect, useState } from "react";
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Glass, Mosya, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { API_URL } from "@/lib/config";
import { tapLight } from "@/lib/feedback";
import { getAnonDefault, setAnonDefault } from "@/lib/prefs";
import { colors, FONT } from "@/lib/theme";

/** «Приватность и анонимность» (app/(app)/settings/privacy). */
export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();
  const [anon, setAnon] = useState(false);

  useEffect(() => {
    getAnonDefault().then(setAnon);
  }, []);

  function toggle(v: boolean) {
    tapLight();
    setAnon(v);
    setAnonDefault(v);
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 40, gap: 12 }}>
        <RoundBtn onPress={() => router.back()}>
          <Icon name="back" />
        </RoundBtn>
        <Title plain="Приватность " em="и анонимность" size={28} style={{ marginLeft: 4 }} />

        <Glass strong style={styles.list}>
          <View style={[styles.row, styles.sep]}>
            <View style={styles.ic}>
              <Icon name="mask" size={18} color={colors.violet} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Анонимно по умолчанию</Text>
              <Text style={styles.sub}>Все новые встречи будут без твоего профиля — можно поменять при создании</Text>
            </View>
            <Switch value={anon} onValueChange={toggle} trackColor={{ true: colors.violet, false: "rgba(22,18,31,0.15)" }} thumbColor="#fff" />
          </View>
          <View style={[styles.row, styles.sep]}>
            <View style={styles.ic}>
              <Icon name="lock" size={18} color={colors.violet} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Адрес и организатор анонимной встречи</Text>
              <Text style={styles.sub}>Видны только тем, чью заявку ты одобришь</Text>
            </View>
          </View>
          <Pressable onPress={() => Linking.openURL(`${API_URL}/legal/privacy`)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}>
            <View style={styles.ic}>
              <Icon name="shield" size={18} color={colors.violet} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.label}>Политика конфиденциальности</Text>
              <Text style={styles.sub}>Какие данные храним и зачем</Text>
            </View>
            <Icon name="chev" size={18} color={colors.grey} />
          </Pressable>
        </Glass>

        <Glass strong style={styles.card}>
          <Mosya pose="glasses" size={70} />
          <View style={{ flex: 1 }}>
            <Text style={styles.label}>Как выглядит анонимный организатор</Text>
            <Text style={styles.sub}>
              Вместо фото — персонаж, видны только рейтинг и подтверждённый телефон. Профиль откроется участникам после одобрения заявки.
            </Text>
          </View>
        </Glass>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { borderRadius: 24, paddingHorizontal: 12 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  sep: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: "rgba(108,59,255,0.15)" },
  ic: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  label: { fontFamily: FONT, fontSize: 15.5, color: colors.ink },
  sub: { fontFamily: FONT, fontSize: 12.5, lineHeight: 17, color: colors.grey, marginTop: 2 },
  card: { borderRadius: 24, padding: 14, flexDirection: "row", alignItems: "center", gap: 12 },
});
