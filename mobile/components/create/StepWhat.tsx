// Шаг 1. «Что планируем?» — категория, вид тренировки или «Своё предложение».
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Glass } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Chip, Field } from "@/components/ui";
import { catIcon, CATEGORY_SHORT, colors, FONT } from "@/lib/theme";
import type { Category, Form, SetForm, TrainingType } from "./model";
import { Label, Muted, StepTitle } from "./parts";

export function StepWhat({ form, set, categories, trainingTypes }: { form: Form; set: SetForm; categories: Category[]; trainingTypes: TrainingType[] }) {
  const cats = categories.filter((c) => c.slug !== "custom");
  const hasCustom = categories.some((c) => c.slug === "custom");
  const isOwn = form.categorySlug === "custom";

  return (
    <View>
      {form.business ? (
        <StepTitle plain="Какое " em="событие" after="?" sub="Выбери ближе всего подходящее. Название напишешь на следующем шаге." />
      ) : (
        <StepTitle plain="Что " em="планируем" after="?" sub="Выбери, во что будет встреча. Так её найдут люди с похожими интересами." />
      )}

      <View style={st.grid}>
        {cats.map((c) => {
          const on = form.categorySlug === c.slug;
          return (
            <Pressable
              key={c.id}
              style={({ pressed }) => [st.cell, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
              onPress={() => set({ categorySlug: c.slug, ...(c.slug !== "training" ? { trainingTypeSlug: null } : {}) })}
            >
              <Glass strong style={[st.tile, on && st.tileOn]}>
                {on ? <Check /> : null}
                <Image source={{ uri: catIcon(c.slug) }} style={st.tileImg} contentFit="contain" cachePolicy="disk" />
                <Text style={st.tileText} numberOfLines={2}>
                  {CATEGORY_SHORT[c.slug] ?? c.name}
                </Text>
              </Glass>
            </Pressable>
          );
        })}
      </View>

      {hasCustom ? (
        <Pressable
          onPress={() => set({ categorySlug: "custom", trainingTypeSlug: null })}
          style={({ pressed }) => ({ marginTop: 10, transform: [{ scale: pressed ? 0.98 : 1 }] })}
        >
          <Glass strong style={[st.own, isOwn && st.tileOn]}>
            {isOwn ? <Check /> : null}
            <View style={st.star}>
              <Icon name="star" color="#fff" size={22} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={st.ownTitle}>Своё предложение</Text>
              <Text style={st.ownText}>Не нашёл подходящего? Придумай сам — от сапов до вязания</Text>
            </View>
          </Glass>
        </Pressable>
      ) : null}

      {form.categorySlug === "training" ? (
        <>
          <Label>Какая тренировка?</Label>
          <View style={st.wrap}>
            {trainingTypes.map((t) => (
              <Chip key={t.id} label={t.name} active={form.trainingTypeSlug === t.slug} onPress={() => set({ trainingTypeSlug: t.slug })} />
            ))}
          </View>
        </>
      ) : null}

      {isOwn ? (
        <>
          <Label>Чем займёмся?</Label>
          <Field value={form.own} onChangeText={(own) => set({ own })} placeholder="Например: сапы, вязание, бадминтон" maxLength={30} />
          <Muted style={{ marginTop: 8, marginHorizontal: 4 }}>Встреча попадёт в раздел «Другое», а люди найдут её поиском по этому слову.</Muted>
        </>
      ) : null}
    </View>
  );
}

function Check() {
  return (
    <View style={st.check}>
      <Icon name="check" size={13} color="#fff" strokeWidth={2.5} />
    </View>
  );
}

const st = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 8, marginTop: 14 },
  cell: { width: "23.5%" },
  tile: { borderRadius: 20, alignItems: "center", paddingTop: 10, paddingBottom: 10, paddingHorizontal: 4, gap: 4, minHeight: 96 },
  tileOn: { borderWidth: 2, borderColor: colors.violet },
  tileImg: { width: 46, height: 46 },
  tileText: { fontFamily: FONT, fontSize: 12, lineHeight: 14, color: colors.ink, textAlign: "center", fontWeight: "500" },
  check: {
    position: "absolute",
    top: 6,
    right: 6,
    zIndex: 2,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.violet,
    alignItems: "center",
    justifyContent: "center",
  },
  own: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 22, padding: 14 },
  star: { width: 46, height: 46, borderRadius: 23, backgroundColor: colors.peach, alignItems: "center", justifyContent: "center" },
  ownTitle: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink },
  ownText: { fontFamily: FONT, fontSize: 13, lineHeight: 18, color: colors.grey },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
});
