import { useRef, useState } from "react";
import { Alert, Text } from "react-native";
import { Sheet } from "./Sheet";
import { Btn } from "./brand";
import { api, ApiError } from "@/lib/api";
import { tapOk } from "@/lib/feedback";
import { f } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";

type Gallery = { photos: string[]; avatarUrl: string | null };

export function ProfilePhotoActions({ photos, selected, onClose, onSaved, editLabel, onEdit }: {
  photos: string[]; selected: string | null; onClose: () => void; onSaved: (gallery: Gallery) => void;
  editLabel: string; onEdit: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const locked = useRef(false);
  const from = selected ? photos.indexOf(selected) : -1;

  async function move(to: number) {
    if (locked.current || from < 0 || !selected || to < 0 || to >= photos.length) return;
    locked.current = true;
    setBusy(true);
    const next = [...photos];
    next.splice(from, 1);
    next.splice(to, 0, selected);
    try {
      const saved = await api<Gallery>("/api/me/photos", { method: "PATCH", body: { before: photos, photos: next } });
      onSaved(saved);
      tapOk();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        try {
          const profile = await api<MyProfile>("/api/me/profile");
          onSaved({ photos: profile.photos ?? [], avatarUrl: profile.avatarUrl });
          onClose();
        } catch {}
        Alert.alert("Фотографии изменились", "Открой нужное фото ещё раз.");
      } else Alert.alert("Порядок не сохранился", "Попробуй ещё раз.");
    } finally {
      locked.current = false;
      setBusy(false);
    }
  }

  return (
    <Sheet visible={from >= 0} onClose={() => { if (!locked.current) onClose(); }}>
      <Text style={{ ...f("600"), fontSize: 20 }}>{from === 0 ? "Главное фото" : "Фотография"}</Text>
      {from > 0 && <Btn title="Сделать главной" disabled={busy} onPress={() => move(0)} />}
      {from > 1 && <Btn kind="o" title="Сдвинуть влево" disabled={busy} onPress={() => move(from - 1)} />}
      {from >= 0 && from < photos.length - 1 && <Btn kind="o" title="Сдвинуть вправо" disabled={busy} onPress={() => move(from + 1)} />}
      <Btn kind="o" title={editLabel} disabled={busy} onPress={onEdit} />
      <Btn kind="o" title="Закрыть" disabled={busy} onPress={onClose} />
    </Sheet>
  );
}
