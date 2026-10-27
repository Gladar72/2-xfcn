// Шаг 2. «Название и обложка» — обложку подбирает Мося, можно загрузить своё фото.
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import { Glass } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Field } from "@/components/ui";
import { coverUri } from "@/lib/covers";
import { colors, FONT } from "@/lib/theme";
import type { Form, SetForm } from "./model";
import { Label, Muted, StepTitle } from "./parts";

/** Фото из галереи: обрезка 3:2 в системном редакторе → 1200 px по ширине, JPEG 0.8 → data:URL (как шлёт веб). */
async function pickPhoto(): Promise<{ uri: string; data: string } | null> {
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 2], quality: 1 });
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  const ctx = ImageManipulator.manipulate(asset.uri);
  ctx.resize({ width: 1200 });
  const img = await ctx.renderAsync();
  const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.8, base64: true });
  if (!out.base64) return null;
  return { uri: out.uri, data: `data:image/jpeg;base64,${out.base64}` };
}

export function StepCover({ form, set, presetCover, catLabel }: { form: Form; set: SetForm; presetCover: string | null; catLabel: string }) {
  const [loading, setLoading] = useState(false);
  const isOwn = form.categorySlug === "custom";
  const presetOn = !!presetCover && !(form.useOwnPhoto && form.ownPhoto);

  async function upload() {
    setLoading(true);
    try {
      const p = await pickPhoto();
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

      <Label extra="что будете делать и для кого">Описание</Label>
      <Field
        value={form.description}
        onChangeText={(description) => set({ description })}
        placeholder="Что будем делать, как узнать друг друга"
        maxLength={500}
        multiline
      />
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 22, marginBottom: 10, marginHorizontal: 4 },
  headLbl: { fontFamily: FONT, fontSize: 15, fontWeight: "500", color: colors.ink },
  tag: { backgroundColor: colors.lav, borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: "center", flexShrink: 1 },
  tagText: { fontFamily: FONT, fontSize: 12, color: colors.violet, fontWeight: "500" },
  cover: { aspectRatio: 1.5, borderRadius: 22, overflow: "hidden", backgroundColor: "#EDE5FF", borderWidth: 3, borderColor: "transparent" },
  on: { borderColor: colors.violet },
  badge: { position: "absolute", left: 10, bottom: 10, backgroundColor: "rgba(255,255,255,0.88)", borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: "center" },
  badgeText: { fontFamily: FONT, fontSize: 12, color: colors.violet, fontWeight: "500" },
  row: { flexDirection: "row", gap: 8, marginTop: 8 },
  cell: { width: "32%" },
  up: { aspectRatio: 1, borderRadius: 18, alignItems: "center", justifyContent: "center", gap: 6 },
  upText: { fontFamily: FONT, fontSize: 13, color: colors.ink, fontWeight: "500" },
  thumb: { aspectRatio: 1, borderRadius: 18, overflow: "hidden", backgroundColor: "#EDE5FF", borderWidth: 3, borderColor: "transparent" },
});
