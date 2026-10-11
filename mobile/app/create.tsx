import { Linking, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Btn, Mosya, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { colors, FONT } from "@/lib/theme";

/**
 * Кнопка «+» в таббаре. Пошаговый мастер создания встречи переносится
 * следующим этапом; пока создаём встречу в мини-приложении в Telegram —
 * она сразу появится и здесь (бэкенд общий).
 */
export default function CreateScreen() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, paddingHorizontal: 20 }}>
      <Aurora />
      <RoundBtn onPress={() => router.back()}>
        <Icon name="close" />
      </RoundBtn>
      <View style={styles.center}>
        <Mosya pose="think" size={180} />
        <Title plain="Создать " em="встречу" size={30} style={{ textAlign: "center" }} />
        <Text style={styles.text}>
          Создание встречи прямо в приложении появится в следующем обновлении. Пока создай её в «Месте» в Telegram — она сразу появится здесь.
        </Text>
      </View>
      <Btn kind="tg" title="Создать в Telegram" icon={<Icon name="tg" color="#fff" size={20} />} onPress={() => Linking.openURL("https://t.me/Mesto_people_bot")} />
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  text: { fontFamily: FONT, fontSize: 15, lineHeight: 21, color: colors.grey, textAlign: "center", paddingHorizontal: 10 },
});
