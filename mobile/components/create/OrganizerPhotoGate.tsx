import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Btn, Glass, Mosya } from "@/components/brand";
import { api, ApiError } from "@/lib/api";
import { tapOk, tapWarn } from "@/lib/feedback";
import { hasOrganizerPhoto, ORGANIZER_PHOTO_MESSAGE, PHOTO_ERRORS, pickPhoto } from "@/lib/photos";
import { colors, FONT } from "@/lib/theme";

/**
 * Без фото профиля открытую встречу не создать (сервер отвечает profile_photo_required).
 * Фото загружается прямо здесь, поэтому черновик встречи не теряется.
 * Как OrganizerPhotoGate в мини-приложении.
 */
export function OrganizerPhotoGate({
  loading,
  error,
  onRetry,
  onUploaded,
}: {
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  onUploaded: (avatarUrl: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  async function upload() {
    if (busy) return;
    const data = await pickPhoto();
    if (!data) return;
    setBusy(true);
    setUploadError(null);
    try {
      const r = await api<{ avatarUrl?: string }>("/api/me/avatar", { body: { photoBase64: data } });
      if (!hasOrganizerPhoto(r.avatarUrl)) {
        tapWarn();
        setUploadError("Не получилось сохранить фото. Попробуй ещё раз.");
        return;
      }
      tapOk();
      onUploaded(r.avatarUrl);
    } catch (e) {
      tapWarn();
      const code = e instanceof ApiError ? e.code : "";
      setUploadError(PHOTO_ERRORS[code] ?? "Не получилось загрузить фото. Проверь соединение и выбери фото ещё раз.");
    } finally {
      setBusy(false);
    }
  }

  const title = loading ? "Проверяем профиль…" : error ? "Не удалось загрузить профиль" : "Добавь своё фото";
  const sub = loading ? null : error ? "Проверь соединение и попробуй ещё раз." : ORGANIZER_PHOTO_MESSAGE;

  return (
    <View style={st.wrap} testID="organizer-photo-gate">
      <Mosya pose="think" size={132} />
      <Text style={st.title}>{title}</Text>
      {sub ? <Text style={st.sub}>{sub}</Text> : null}
      {uploadError ? (
        <Glass strong style={st.err}>
          <Text style={st.errText} accessibilityRole="alert">{uploadError}</Text>
        </Glass>
      ) : null}
      {loading ? null : error ? (
        <Btn kind="v" title="Попробовать снова" onPress={onRetry} style={st.btn} />
      ) : (
        <Btn kind="v" title={busy ? "Сохраняем фото…" : "Добавить фото профиля"} loading={busy} onPress={upload} style={st.btn} />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  wrap: { alignItems: "center", paddingTop: 28, gap: 12 },
  title: { fontFamily: FONT, fontSize: 26, fontWeight: "700", color: colors.ink, textAlign: "center" },
  sub: { fontFamily: FONT, fontSize: 15, lineHeight: 21, color: colors.grey, textAlign: "center", paddingHorizontal: 8 },
  err: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10, alignSelf: "stretch" },
  errText: { fontFamily: FONT, fontSize: 14, lineHeight: 19, color: colors.ink, textAlign: "center" },
  btn: { alignSelf: "stretch", marginTop: 8 },
});
