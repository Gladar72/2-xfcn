import { PORTRAIT_ASPECT } from "@/lib/photoCrop";
// Шаг 2. «Название и обложка» — обложку подбирает Мося, можно загрузить своё фото.
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { pickAndEdit } from "@/components/PhotoEditor";
import { Glass } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui";
import { coverUri } from "@/lib/covers";
import { colors, f } from "@/lib/theme";
import type { Form, SetForm } from "./model";
import { Label, Muted, StepTitle } from "./parts";

export function StepCover({ form, set, presetCover, coverSet = [], catLabel }: { form: Form; set: SetForm; presetCover: string | null; coverSet?: string[]; catLabel: string }) {
  const [loading, setLoading] = useState(false);
  const isOwn = form.categorySlug === "custom";
  const presetOn = !!presetCover && !(form.useOwnPhoto && form.ownPhoto);

  async function upload() {
    setLoading(true);
    try {
      const p = await pickAndEdit();
      if (p) set({ ownPhoto: p, useOwnPhoto: true });
    } catch {
      Alert.alert("Не получилось", "Не удалось открыть фото — попробуй другое.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <View>
      <StepTitle plain="Название " em="и обложка" sub="Короткое название и картинка решают, придут ли люди." />

      <Label>Название</Label>
      <Field
        value={form.title}
        onChangeText={(title) => set({ title })}
        placeholder={form.business ? "Например, дегустация вин от сомелье" : "Например, кофе перед работой"}
        maxLength={100}
      />

      <Label extra="что будете делать и для кого">Описание</Label>
      <Field
        value={form.description}
        onChangeText={(description) => set({ description })}
        placeholder="Что будем делать, как узнать друг друга"
        maxLength={500}
        multiline
      />
      {coverSet.length > 1 ? (
        <>
          <Text style={[st.headLbl, { marginTop: 22, marginHorizontal: 4 }]}>Обложка</Text>
          <Muted style={{ marginTop: 4, marginBottom: 10, marginHorizontal: 4 }}>Обложки для «{catLabel}» · выбери одну или загрузи своё фото</Muted>
          {/* Сетка 4 в ряд, 3:4 — как в мини-аппе; выбранная — с чёрной рамкой и галочкой */}
          <View style={st.grid}>
            {coverSet.map((c) => {
              const on = !form.useOwnPhoto && presetCover === c;
              return (
                <Pressable key={c} onPress={() => set({ cover: c, useOwnPhoto: false })} style={({ pressed }) => [st.gcell, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
                  <View style={[st.gimg, on && st.gon]}>
                    <Image source={{ uri: coverUri(c)! }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={150} />
                    {on ? <View style={st.check}><Icon name="check" size={13} color={colors.ink} /></View> : null}
                  </View>
                </Pressable>
              );
            })}
            {form.ownPhoto ? (
              <Pressable onPress={() => set({ useOwnPhoto: true })} style={st.gcell}>
                <View style={[st.gimg, form.useOwnPhoto && st.gon]}>
                  <Image source={{ uri: form.ownPhoto.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  {form.useOwnPhoto ? <View style={st.check}><Icon name="check" size={13} color={colors.ink} /></View> : null}
                </View>
              </Pressable>
            ) : null}
            <Pressable onPress={upload} disabled={loading} style={({ pressed }) => [st.gcell, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
              <Glass strong style={[st.gimg, { alignItems: "center", justifyContent: "center", gap: 4, borderWidth: 0 }]}>
                {loading ? <ActivityIndicator color={colors.ink} /> : <Icon name="camera" color={colors.ink} />}
                <Text style={[st.upText, { fontSize: 11.5 }]}>Своё фото</Text>
              </Glass>
            </Pressable>
          </View>
        </>
      ) : (
        <>
      <View style={st.head}>
          <Text style={st.headLbl}>Обложка</Text>
          {presetCover ? (
            <View style={st.tag}>
              <Text style={st.tagText}>✦ Мося подобрал для «{catLabel}»</Text>
            </View>
          ) : null}
        </View>
  
        {isOwn && !presetCover ? (
          <Muted style={{ marginBottom: 10, marginHorizontal: 4 }}>
            Под «{form.own.trim() || form.title.trim() || "твою встречу"}» готовой обложки нет — загрузи своё фото. Мы проверим его автоматически: без пошлости и чужой рекламы.
          </Muted>
        ) : null}
  
        {presetCover ? (
          <Pressable onPress={() => set({ useOwnPhoto: false })}>
            <View style={[st.cover, presetOn && st.on]}>
              <Image source={{ uri: coverUri(presetCover)! }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="disk" transition={200} />
              <View style={st.badge}>
                <Text style={st.badgeText}>✦ Мося</Text>
              </View>
            </View>
          </Pressable>
        ) : null}
  
        <View style={st.row}>
          <Pressable onPress={upload} disabled={loading} style={({ pressed }) => [st.cell, { transform: [{ scale: pressed ? 0.95 : 1 }] }]}>
            <Glass strong style={st.up}>
              {loading ? <ActivityIndicator color={colors.violet} /> : <Icon name="camera" color={colors.violet} />}
              <Text style={st.upText}>Своё фото</Text>
            </Glass>
          </Pressable>
          {form.ownPhoto ? (
            <Pressable onPress={() => set({ useOwnPhoto: true })} style={st.cell}>
              <View style={[st.thumb, form.useOwnPhoto && st.on]}>
                <Image source={{ uri: form.ownPhoto.uri }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </View>
            </Pressable>
          ) : null}
        </View>
  
        <Muted style={{ marginTop: 10, marginHorizontal: 4 }}>
          {isOwn && !presetCover
            ? "Фото обязательно: без него встречу не опубликовать."
            : "Своё фото можно загрузить к любой встрече. Не загрузишь — будет обложка, которую подобрал Мося."}
        </Muted>
  
          </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 22, marginBottom: 10, marginHorizontal: 4 },
  headLbl: { fontSize: 15, ...f("500"), color: colors.ink },
  tag: { backgroundColor: colors.lav, borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: "center", flexShrink: 1 },
  tagText: { fontSize: 12, color: colors.violet, ...f("500") },
  cover: { aspectRatio: PORTRAIT_ASPECT, borderRadius: 22, overflow: "hidden", backgroundColor: "#ECE8F2", borderWidth: 3, borderColor: "transparent" },
  on: { borderColor: colors.violet },
  badge: { position: "absolute", left: 10, bottom: 10, backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: "center" },
  badgeText: { fontSize: 12, color: colors.violet, ...f("500") },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  cell: { width: "32%" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  gcell: { width: "23%" },
  gimg: { aspectRatio: PORTRAIT_ASPECT, borderRadius: 16, overflow: "hidden", backgroundColor: "#ECE8F2", borderWidth: 2, borderColor: "transparent" },
  gon: { borderColor: colors.ink },
  check: { position: "absolute", top: 5, right: 5, width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  up: { aspectRatio: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 6 },
  upText: { fontSize: 13, color: colors.ink, ...f("500") },
  thumb: { aspectRatio: 1, borderRadius: 18, overflow: "hidden", backgroundColor: "#ECE8F2", borderWidth: 2, borderColor: "transparent" },
});
