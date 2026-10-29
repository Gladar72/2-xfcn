import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Btn } from "@/components/brand";
import { Sheet } from "@/components/Sheet";
import { Chip } from "@/components/ui";
import { tapLight } from "@/lib/feedback";
import { COST_OPTIONS, DATE_OPTIONS, EMPTY_FILTERS, GENDER_OPTIONS, TIME_OPTIONS, type Filters } from "@/lib/filters";
import { colors, FONT, f } from "@/lib/theme";

/** Шторка «Фильтры» — как в мини-приложении (app/(app)/search). Категории выбираются на самом экране. */
export function FiltersSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: Filters;
  onApply: (f: Filters) => void;
  onClose: () => void;
}) {
  const [f, setF] = useState<Filters>(value);
  useEffect(() => {
    if (visible) setF(value);
  }, [visible, value]);

  function pick<K extends keyof Filters>(key: K, v: Filters[K]) {
    tapLight();
    setF((cur) => ({ ...cur, [key]: v }));
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.title}>Фильтры</Text>
      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <Group label="Дата встречи">
          {DATE_OPTIONS.map(([v, l]) => (
            <Chip key={v} label={l} active={f.date === v} onPress={() => pick("date", v)} />
          ))}
        </Group>
        <Group label="Время">
          {TIME_OPTIONS.map(([v, l]) => (
            <Chip key={v} label={l} active={f.timeOfDay === v} onPress={() => pick("timeOfDay", v)} />
          ))}
        </Group>
        <Group label="Расходы">
          {COST_OPTIONS.map(([v, l]) => (
            <Chip key={v} label={l} active={f.costType === v} onPress={() => pick("costType", v)} />
          ))}
        </Group>
        <Group label="Кто создал">
          {GENDER_OPTIONS.map(([v, l]) => (
            <Chip key={v} label={l} active={f.gender === v} onPress={() => pick("gender", v)} />
          ))}
        </Group>
        <View style={{ gap: 8 }}>
          <Text style={styles.label}>Возраст автора</Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TextInput
              value={f.ageMin}
              onChangeText={(t) => setF((c) => ({ ...c, ageMin: t.replace(/\D/g, "").slice(0, 2) }))}
              placeholder="от 18"
              placeholderTextColor={colors.grey}
              keyboardType="number-pad"
              style={styles.input}
            />
            <TextInput
              value={f.ageMax}
              onChangeText={(t) => setF((c) => ({ ...c, ageMax: t.replace(/\D/g, "").slice(0, 2) }))}
              placeholder="до 45"
              placeholderTextColor={colors.grey}
              keyboardType="number-pad"
              style={styles.input}
            />
          </View>
        </View>
      </ScrollView>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Btn kind="o" title="Сбросить" onPress={() => setF({ ...EMPTY_FILTERS, categories: f.categories, type: f.type })} style={{ flex: 1 }} />
        <Btn title="Показать встречи" onPress={() => onApply(f)} style={{ flex: 1.6 }} />
      </View>
    </Sheet>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.wrap}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 22, ...f("500"), color: colors.ink, letterSpacing: -0.5, marginBottom: 4 },
  label: { fontSize: 13, ...f("600"), color: colors.grey, textTransform: "uppercase", letterSpacing: 0.6 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  input: { flex: 1, height: 48, borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 16, fontFamily: FONT, fontSize: 16, color: colors.ink },
});
