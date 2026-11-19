import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Aurora, Btn, Glass, RoundBtn, Title } from "@/components/brand";
import { ProfilePhotoGallery } from "@/components/ProfilePhotoGallery";
import { Icon } from "@/components/Icon";
import { api, type ApiError } from "@/lib/api";
import { tapOk, tapWarn } from "@/lib/feedback";
import { interestIcon } from "@/lib/interests";
import { colors, FONT, f } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";

const SAVE_ERRORS: Record<string, string> = {
  invalid_name: "Имя — от 2 до 50 символов",
  bio_too_long: "«О себе» — не длиннее 300 символов",
};

/** «Мой профиль» — фото (до 3), имя, «О себе», интересы. */
export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<MyProfile | null>(null);
  const [dragging, setDragging] = useState(false);
  const [photos, setPhotos] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  useFocusEffect(
    useCallback(() => {
      api<MyProfile>("/api/me/profile")
        .then((r) => {
          setMe(r);
          setPhotos(r.photos?.length ? r.photos : r.avatarUrl ? [r.avatarUrl] : []);
          // Имя и «о себе» не перезаписываем, если человек уже начал править.
          if (!dirty.current) {
            setName(r.name);
            setBio(r.bio ?? "");
          }
        })
        .catch(() => {});
    }, [])
  );

  async function save() {
    if (!me) return;
    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (name.trim() !== me.name) body.name = name.trim();
      if (bio.trim() !== (me.bio ?? "")) body.bio = bio.trim();
      if (Object.keys(body).length) await api("/api/me/profile", { method: "PATCH", body });
      tapOk();
      dirty.current = false;
      router.back();
    } catch (e) {
      tapWarn();
      Alert.alert("Не получилось сохранить", SAVE_ERRORS[(e as ApiError).code] ?? "Попробуй ещё раз");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView scrollEnabled={!dragging} contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 12, gap: 14 }} keyboardShouldPersistTaps="handled">
          <RoundBtn onPress={() => router.back()}>
            <Icon name="back" />
          </RoundBtn>
          <Title plain="Мой " em="профиль" size={30} style={{ marginLeft: 4 }} />
          {!me ? <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} /> : null}

          {me ? (
            <>
              <ProfilePhotoGallery photos={photos} onDrag={setDragging} removable
                onSaved={gallery => { setPhotos(gallery.photos); setMe(current => current ? { ...current, ...gallery } : current); }} />

              <Glass strong style={styles.card}>
                <Text style={styles.label}>Имя</Text>
                <TextInput
                  value={name}
                  onChangeText={(t) => {
                    dirty.current = true;
                    setName(t);
                  }}
                  maxLength={50}
                  style={styles.input}
                  placeholder="Как тебя зовут"
                  placeholderTextColor={colors.grey}
                />
              </Glass>

              <Glass strong style={styles.card}>
                <View style={styles.labelRow}>
                  <Text style={styles.label}>О себе</Text>
                  <Text style={styles.counter}>{bio.length}/300</Text>
                </View>
                <TextInput
                  value={bio}
                  onChangeText={(t) => {
                    dirty.current = true;
                    setBio(t);
                  }}
                  maxLength={300}
                  multiline
                  style={[styles.input, { minHeight: 96, textAlignVertical: "top" }]}
                  placeholder="Чем живёшь, что любишь, с кем хочешь встречаться"
                  placeholderTextColor={colors.grey}
                />
              </Glass>

              <Pressable onPress={() => router.push("/interests")}>
                <Glass strong style={styles.card}>
                  <View style={styles.labelRow}>
                    <Text style={styles.label}>Интересы</Text>
                    <Text style={styles.link}>Изменить</Text>
                  </View>
                  {me.interests?.length ? (
                    <View style={styles.chips}>
                      {me.interests.map((i) => (
                        <View key={i.id} style={styles.chip}>
                          <Image source={{ uri: interestIcon(i.name) }} style={{ width: 20, height: 20 }} contentFit="contain" />
                          <Text style={styles.chipText}>{i.name}</Text>
                        </View>
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.hint}>Выбери хотя бы три — по ним подберём встречи и людей</Text>
                  )}
                </Glass>
              </Pressable>
            </>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
      {me ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Btn title="Сохранить" onPress={save} loading={saving} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: FONT, fontSize: 13.5, lineHeight: 19, color: colors.grey, marginLeft: 4 },
  card: { borderRadius: 22, padding: 14, gap: 8 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, ...f("600"), color: colors.grey, textTransform: "uppercase", letterSpacing: 0.6 },
  counter: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  link: { fontSize: 14.5, ...f("600"), color: colors.violet },
  input: { fontFamily: FONT, fontSize: 16, color: colors.ink, paddingVertical: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderRadius: 999, paddingLeft: 5, paddingRight: 10, paddingVertical: 4 },
  chipText: { fontFamily: FONT, fontSize: 13.5, color: colors.ink },
  footer: { paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(246,242,255,0.92)" },
});
