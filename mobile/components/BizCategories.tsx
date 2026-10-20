import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Glass } from "@/components/brand";
import { Sheet } from "@/components/Sheet";
import { BIZ_CATEGORIES, BIZ_OTHER, bizCategoryIcon, type BizCategory } from "@/lib/bizCategories";
import { tapLight } from "@/lib/feedback";
import { colors, FONT } from "@/lib/theme";

type Counted = { cat: BizCategory; count: number }[];

function CatChip({ cat, count, active, onPress, wide }: { cat?: BizCategory; count?: number; active: boolean; onPress: () => void; wide?: boolean }) {
  const inner = (
    <>
      {cat ? <Image source={{ uri: bizCategoryIcon(cat) }} style={styles.icon} contentFit="contain" /> : null}
      <Text style={[styles.label, active && { color: "#fff" }, wide && { flex: 1 }]} numberOfLines={wide ? 2 : 1}>
        {cat ? cat.label : "Все"}
      </Text>
      {count != null ? <Text style={[styles.count, active && { color: "rgba(255,255,255,.7)" }]}>{count}</Text> : null}
    </>
  );
  const style = [styles.chip, !cat && { paddingLeft: 16 }, wide && styles.wide];
  return (
    <Pressable
      onPress={() => {
        tapLight();
        onPress();
      }}
      style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.94 : 1 }], opacity: wide && !count && !active ? 0.45 : 1 })}
    >
      {active ? <View style={[style, { backgroundColor: colors.ink }]}>{inner}</View> : <Glass style={style}>{inner}</Glass>}
    </Pressable>
  );
}

/** Полоска категорий «Для бизнеса»: Все · Кафе · Бары · Концерты… (только непустые). */
export function BizCatRow({ counts, value, onChange, inset = 16 }: { counts: Counted; value: string | null; onChange: (k: string | null) => void; inset?: number }) {
  const list = value && !counts.some((x) => x.cat.key === value) ? [{ cat: [...BIZ_CATEGORIES, BIZ_OTHER].find((c) => c.key === value)!, count: 0 }, ...counts] : counts;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: inset }} style={{ marginHorizontal: -inset }}>
      <CatChip active={!value} onPress={() => onChange(null)} />
      {list.map(({ cat, count }) => (
        <CatChip key={cat.key} cat={cat} count={count} active={value === cat.key} onPress={() => onChange(value === cat.key ? null : cat.key)} />
      ))}
    </ScrollView>
  );
}

/** Шторка «Что ищем?» — все категории сеткой, пустые бледнее. */
export function BizCatSheet({ visible, onClose, counts, value, onChange, total }: { visible: boolean; onClose: () => void; counts: Counted; value: string | null; onChange: (k: string | null) => void; total: number }) {
  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text style={styles.h}>Что ищем?</Text>
      <View style={styles.grid}>
        {[...BIZ_CATEGORIES, BIZ_OTHER].map((cat) => (
          <View key={cat.key} style={{ width: "48.5%" }}>
            <CatChip
              wide
              cat={cat}
              count={counts.find((x) => x.cat.key === cat.key)?.count ?? 0}
              active={value === cat.key}
              onPress={() => {
                onChange(value === cat.key ? null : cat.key);
                onClose();
              }}
            />
          </View>
        ))}
      </View>
      <Pressable
        onPress={() => {
          onChange(null);
          onClose();
        }}
        style={styles.all}
      >
        <Text style={styles.allText}>Показать все · {total}</Text>
      </Pressable>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 6, height: 44, paddingLeft: 6, paddingRight: 14, borderRadius: 999 },
  wide: { height: 56, borderRadius: 20 },
  icon: { width: 34, height: 34 },
  label: { fontFamily: FONT, fontSize: 14, fontWeight: "500", color: colors.ink },
  count: { fontFamily: FONT, fontSize: 13, color: colors.grey },
  h: { fontFamily: FONT, fontSize: 22, fontWeight: "600", color: colors.ink, marginBottom: 12 },
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8 },
  all: { marginTop: 14, height: 52, borderRadius: 999, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  allText: { fontFamily: FONT, fontSize: 16, fontWeight: "600", color: "#fff" },
});
