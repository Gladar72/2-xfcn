import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { editExistingPhoto } from "./PhotoEditor";
import { api, ApiError } from "@/lib/api";
import { tapLight, tapOk } from "@/lib/feedback";
import { PHOTO_ERRORS, pickPhoto } from "@/lib/photos";
import { K, kf } from "./k";

type Gallery = { photos: string[]; avatarUrl: string | null };
type Touch = { from: number; x: number; y: number; held: boolean; moved: boolean };
const gap = 8;

export function ProfilePhotoGallery({ photos, onSaved, onDrag, removable = false }: {
  photos: string[]; onSaved: (value: Gallery) => void; onDrag: (value: boolean) => void; removable?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState<{ from: number; dx: number } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const touch = useRef<Touch | null>(null);
  const locked = useRef(false);
  const itemWidth = Math.max(1, (width - 2 * gap) / 3);
  const step = itemWidth + gap;
  const target = (from: number, dx: number) => Math.max(0, Math.min(photos.length - 1, from + Math.round(dx / step)));
  useEffect(() => () => { clearTimeout(timer.current); onDrag(false); }, [onDrag]);

  async function save(work: () => Promise<Gallery | null>) {
    if (locked.current) return;
    locked.current = true;
    setBusy(true);
    try {
      const gallery = await work();
      if (gallery) { onSaved(gallery); tapOk(); }
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        try { onSaved(await api<Gallery>("/api/me/profile")); } catch {}
      }
      Alert.alert("Не удалось сохранить фото", error instanceof ApiError ? (PHOTO_ERRORS[error.code] ?? error.message) : "Проверь подключение и попробуй ещё раз.");
    } finally { locked.current = false; setBusy(false); }
  }
  function move(from: number, to: number) {
    if (from === to || !photos[from] || !photos[to]) return;
    const next = [...photos];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    void save(() => api<Gallery>("/api/me/photos", { method: "PATCH", body: { before: photos, photos: next } }));
  }
  function edit(url: string) {
    void save(async () => {
      const edited = await editExistingPhoto(url);
      return edited ? api<Gallery>("/api/me/photos", { method: "PUT", body: { url, photoBase64: edited.data } }) : null;
    });
  }
  function add() {
    void save(async () => {
      const photoBase64 = await pickPhoto();
      if (!photoBase64) return null;
      if (!photos.length) {
        const { avatarUrl } = await api<{ avatarUrl: string }>("/api/me/avatar", { body: { photoBase64 } });
        return { photos: [avatarUrl], avatarUrl };
      }
      const result = await api<{ photos: string[] }>("/api/me/photos", { body: { photoBase64 } });
      return { photos: result.photos, avatarUrl: result.photos[0] ?? null };
    });
  }
  function remove(url: string) {
    Alert.alert("Удалить фото?", undefined, [{ text: "Отмена", style: "cancel" }, { text: "Удалить", style: "destructive", onPress: () => {
      void save(async () => {
        const result = await api<{ photos: string[] }>("/api/me/photos", { method: "DELETE", body: { url } });
        return { photos: result.photos, avatarUrl: result.photos[0] ?? null };
      });
    } }]);
  }
  function reset() {
    clearTimeout(timer.current);
    touch.current = null;
    setDrag(null);
    onDrag(false);
  }
  const hovered = drag ? target(drag.from, drag.dx) : -1;
  return <View style={{ gap: 8, marginTop: 10 }}>
    <View onLayout={e => setWidth(e.nativeEvent.layout.width)} style={{ flexDirection: "row", gap }}>
      {photos.map((url, index) => {
        const isHeld = drag?.from === index;
        const shift = !drag ? 0 : isHeld ? drag.dx : index > drag.from && index <= hovered ? -step : index < drag.from && index >= hovered ? step : 0;
        return <View key={url} style={{ width: itemWidth, height: itemWidth * 4 / 3, zIndex: isHeld ? 2 : 0, transform: [{ translateX: shift }, { scale: isHeld ? 1.04 : 1 }] }}>
          <View accessible accessibilityRole="button" accessibilityLabel={index === 0 ? "Главное фото" : `Фото ${index + 1}`}
            accessibilityHint="Нажми для редактирования. Удерживай и перетащи, чтобы изменить порядок."
            accessibilityActions={[{ name: "activate" }, ...(index ? [{ name: "main", label: "Сделать главным" }] : [])]}
            onAccessibilityAction={e => e.nativeEvent.actionName === "main" ? move(index, 0) : edit(url)}
            onStartShouldSetResponder={() => !locked.current}
            onResponderGrant={e => {
              const { pageX: x, pageY: y } = e.nativeEvent;
              const current = { from: index, x, y, held: false, moved: false };
              touch.current = current;
              timer.current = setTimeout(() => {
                if (touch.current !== current || current.moved) return;
                current.held = true;
                onDrag(true); tapLight(); setDrag({ from: index, dx: 0 });
              }, 340);
            }}
            onResponderTerminationRequest={() => !touch.current?.held}
            onResponderMove={e => {
              const t = touch.current;
              if (!t) return;
              const dx = e.nativeEvent.pageX - t.x;
              if (t.held) setDrag({ from: t.from, dx: Math.max(-t.from * step, Math.min((photos.length - t.from - 1) * step, dx)) });
              else if (Math.hypot(dx, e.nativeEvent.pageY - t.y) > 8) { t.moved = true; clearTimeout(timer.current); }
            }}
            onResponderRelease={e => {
              const t = touch.current;
              const dx = t ? e.nativeEvent.pageX - t.x : 0;
              reset();
              if (!t) return;
              if (t.held) move(t.from, target(t.from, dx));
              else if (!t.moved) edit(url);
            }}
            onResponderTerminate={reset}
            style={{ flex: 1, backgroundColor: K.ink, borderRadius: 18, overflow: "hidden" }}>
            <Image source={{ uri: url }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
            {index === 0 && <View style={styles.badge}><Text style={kf("500", 11, { color: "#fff" })}>Главное</Text></View>}
          </View>
          {removable && index > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Удалить фото ${index + 1}`} disabled={busy}
            onPress={() => remove(url)} hitSlop={6} style={styles.remove}><Text style={{ color: "#fff", fontSize: 18 }}>×</Text></Pressable>}
        </View>;
      })}
      {photos.length < 3 && <Pressable onPress={add} disabled={busy} accessibilityLabel="Добавить фото" accessibilityRole="button"
        style={[styles.add, { width: itemWidth, height: itemWidth * 4 / 3 }]}><Text style={kf("300", 30)}>+</Text></Pressable>}
    </View>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
      {busy && <ActivityIndicator size="small" color={K.ink} />}
      <Text style={[kf("400", 13, { color: K.ink2 }), { flex: 1 }]}>Нажми, чтобы отредактировать. Зажми и перетащи. Первое фото станет обложкой.</Text>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  add: { borderRadius: 18, backgroundColor: "rgba(255,255,255,0.8)", alignItems: "center", justifyContent: "center" },
  badge: { position: "absolute", left: 5, bottom: 6, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, backgroundColor: "rgba(23,20,31,0.8)" },
  remove: { position: "absolute", right: 4, top: 4, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(23,20,31,0.8)", alignItems: "center", justifyContent: "center" },
});
