import { useCallback, useRef, useState } from "react";
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import { Aurora, Btn, Glass, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api, type ApiError } from "@/lib/api";
import { animateNext, tapOk, tapWarn } from "@/lib/feedback";
import { interestIcon } from "@/lib/interests";
import { colors, FONT, f } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";

const PHOTO_ERRORS: Record<string, string> = {
  photo_rejected: "Это фото не прошло проверку — выбери другое",
  photo_too_large: "Фото слишком большое — выбери другое",
  photo_invalid: "Не получилось прочитать фото — выбери другое",
  photos_limit: "Можно загрузить до 3 фото",
  network: "Проблема с соединением",
};

const SAVE_ERRORS: Record<string, string> = {
  invalid_name: "Имя — от 2 до 50 символов",
  bio_too_long: "«О себе» — не длиннее 300 символов",
};

/** Фото из галереи → JPEG до 1600 px → data URL (как в мини-приложении). */
async function pickPhoto(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert("Нужен доступ к фото", "Разреши доступ к галерее в настройках телефона.");
    return null;
  }
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: true, aspect: [3, 4], quality: 1 });
  if (res.canceled || !res.assets[0]) return null;
  const a = res.assets[0];
  const resize = (a.width ?? 0) >= (a.height ?? 0) ? { width: Math.min(1600, a.width || 1600) } : { height: Math.min(1600, a.height || 1600) };
  const out = await ImageManipulator.manipulateAsync(a.uri, [{ resize }], { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true });
  return out.base64 ? `data:image/jpeg;base64,${out.base64}` : null;
}

/** «Мой профиль» — фото (до 3), имя, «О себе», интересы. */
export default function ProfileEditScreen() {
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<MyProfile | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [uploading, setUploading] = useState<number | null>(null);
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

  async function upload(slot: number) {
    const data = await pickPhoto();
    if (!data) return;
    setUploading(slot);
    try {
      if (slot === 0) {
        const r = await api<{ avatarUrl: string }>("/api/me/avatar", { body: { photoBase64: data } });
        animateNext();
        setPhotos((p) => [r.avatarUrl, ...p.slice(1)]);
      } else {
        const r = await api<{ photos: string[] }>("/api/me/photos", { body: { photoBase64: data } });
        animateNext();
        setPhotos(r.photos);
      }
      tapOk();
    } catch (e) {
      tapWarn();
      const code = (e as ApiError).code;
      Alert.alert("Фото не добавлено", PHOTO_ERRORS[code] ?? "Попробуй другое фото");
    } finally {
      setUploading(null);
    }
  }

  function photoMenu(slot: number) {
    const url = photos[slot];
    if (!url) return upload(slot);
    if (slot === 0) {
      Alert.alert("Главное фото", "Оно на аватарке и в ленте людей.", [
        { text: "Заменить", onPress: () => void upload(0) },
        { text: "Отмена", style: "cancel" },
      ]);
      return;
    }
    Alert.alert("Фото", "", [
      {
        text: "Удалить",
        style: "destructive",
        onPress: async () => {
          try {
            const r = await api<{ photos: string[] }>("/api/me/photos", { method: "DELETE", body: { url } });
            animateNext();
            setPhotos(r.photos);
          } catch {
            Alert.alert("Не получилось", "Попробуй ещё раз");
          }
        },
      },
      { text: "Отмена", style: "cancel" },
    ]);
  }

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
        <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 110, gap: 14 }} keyboardShouldPersistTaps="handled">
          <RoundBtn onPress={() => router.back()}>
            <Icon name="back" />
          </RoundBtn>
          <Title plain="Мой " em="профиль" size={30} style={{ marginLeft: 4 }} />
          {!me ? <ActivityIndicator color={colors.violet} style={{ marginTop: 40 }} /> : null}

          {me ? (
            <>
              <Text style={styles.hint}>До 3 фото. Первое — главное, оно на аватарке и в ленте людей.</Text>
              <View style={styles.photos}>
                <Slot url={photos[0]} big loading={uploading === 0} onPress={() => photoMenu(0)} main />
                <View style={{ flex: 1, gap: 10 }}>
                  <Slot url={photos[1]} loading={uploading === 1} onPress={() => photoMenu(1)} disabled={!photos[0]} />
                  <Slot url={photos[2]} loading={uploading === 2} onPress={() => photoMenu(photos[1] ? 2 : 1)} disabled={!photos[0]} />
                </View>
              </View>

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

function Slot({ url, big, main, loading, disabled, onPress }: { url?: string; big?: boolean; main?: boolean; loading?: boolean; disabled?: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [big ? styles.slotBig : styles.slot, { opacity: disabled ? 0.45 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
    >
      {url ? <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} /> : null}
      {loading ? (
        <View style={styles.slotOverlay}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : !url ? (
        <View style={styles.plus}>
          <Icon name="plus" size={22} color={colors.violet} />
        </View>
      ) : null}
      {main && url ? (
        <View style={styles.mainBadge}>
          <Text style={styles.mainText}>Главное</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: { fontFamily: FONT, fontSize: 13.5, lineHeight: 19, color: colors.grey, marginLeft: 4 },
  photos: { flexDirection: "row", gap: 10, height: 260 },
  slotBig: { flex: 1.6, borderRadius: 24, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.75)", borderWidth: 1.5, borderColor: "rgba(108,59,255,0.18)", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  slot: { flex: 1, borderRadius: 20, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.75)", borderWidth: 1.5, borderColor: "rgba(108,59,255,0.18)", borderStyle: "dashed", alignItems: "center", justifyContent: "center" },
  slotOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(22,18,31,0.35)", alignItems: "center", justifyContent: "center" },
  plus: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  mainBadge: { position: "absolute", left: 10, bottom: 10, backgroundColor: "rgba(255,255,255,0.9)", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  mainText: { fontSize: 12, ...f("600"), color: colors.violet },
  card: { borderRadius: 22, padding: 14, gap: 8 },
  labelRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  label: { fontSize: 13, ...f("600"), color: colors.grey, textTransform: "uppercase", letterSpacing: 0.6 },
  counter: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  link: { fontSize: 14.5, ...f("600"), color: colors.violet },
  input: { fontFamily: FONT, fontSize: 16, color: colors.ink, paddingVertical: 4 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "#fff", borderRadius: 999, paddingLeft: 5, paddingRight: 10, paddingVertical: 4 },
  chipText: { fontFamily: FONT, fontSize: 13.5, color: colors.ink },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 12, backgroundColor: "rgba(246,242,255,0.92)" },
});
