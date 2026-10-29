import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Sheet } from "@/components/Sheet";
import { Icon } from "@/components/Icon";
import { RUSSIAN_CITIES } from "@/lib/cities";
import { colors, FONT, f } from "@/lib/theme";

const POPULAR = ["Тюмень", "Москва", "Санкт-Петербург", "Екатеринбург", "Новосибирск", "Казань"];

/** Выбор города из списка (свободный ввод сервер не принимает). */
export function CitySheet({
  visible,
  value,
  onPick,
  onClose,
}: {
  visible: boolean;
  value?: string | null;
  onPick: (city: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase().replace(/ё/g, "е");
    if (!s) return [...POPULAR.filter((c) => RUSSIAN_CITIES.includes(c)), ...RUSSIAN_CITIES.filter((c) => !POPULAR.includes(c))];
    return RUSSIAN_CITIES.filter((c) => c.toLowerCase().replace(/ё/g, "е").includes(s));
  }, [q]);

  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setQ("");
        onClose();
      }}
    >
      <Text style={styles.title}>Выбери город</Text>
      <View style={styles.search}>
        <Icon name="search" size={18} color={colors.grey} />
        <TextInput value={q} onChangeText={setQ} placeholder="Найти город" placeholderTextColor={colors.grey} style={styles.input} autoCorrect={false} />
      </View>
      <FlatList
        data={list}
        keyExtractor={(c) => c}
        style={{ height: 380 }}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={<Text style={styles.empty}>Такого города пока нет в списке</Text>}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => {
              setQ("");
              onPick(item);
            }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.lav }]}
          >
            <Text style={[styles.city, item === value && { color: colors.violet, ...f("600") }]}>{item}</Text>
            {item === value ? <Icon name="check" size={18} color={colors.violet} /> : null}
          </Pressable>
        )}
      />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, ...f("500"), color: colors.ink, letterSpacing: -0.5 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: "#fff", borderRadius: 999, height: 46, paddingHorizontal: 16, marginVertical: 6 },
  input: { flex: 1, fontFamily: FONT, fontSize: 16, color: colors.ink },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 13, paddingHorizontal: 8, borderRadius: 14 },
  city: { fontFamily: FONT, fontSize: 16, color: colors.ink },
  empty: { fontFamily: FONT, fontSize: 14.5, color: colors.grey, textAlign: "center", marginTop: 20 },
});
