// Вертикальный редактор фото перед загрузкой — как PhotoCropModal мини-аппа и как в Instagram:
// фото двигается пальцем, двумя пальцами — приближается, пока двигаешь — видна сетка третей.
// «Повернуть», «Сбросить», «Заменить». Сохраняет кадр 3:4 (обложки и фото профиля).
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image as RNImage, Modal, PanResponder, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Press, kf } from "@/components/k";

const MAX_SCALE = 4;

export type EditedPhoto = { uri: string; data: string };

type Src = { uri: string; w: number; h: number };

function Tool({ d, label, onPress }: { d: string; label: string; onPress: () => void }) {
  return (
    <Press dark onPress={onPress} style={st.tool}>
      <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <Path d={d} />
      </Svg>
      <Text style={kf("500", 13, { color: "#fff" })}>{label}</Text>
    </Press>
  );
}

export function PhotoEditor({
  source,
  aspect = 3 / 4,
  title = "Обложка встречи",
  hint = "Двигай фото пальцем, своди и разводи два пальца, чтобы изменить масштаб",
  previewTitle,
  onCancel,
  onDone,
  onReplace,
}: {
  source: Src | null;
  aspect?: number;
  title?: string;
  hint?: string;
  previewTitle?: string;
  onCancel: () => void;
  onDone: (p: EditedPhoto) => void;
  onReplace?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [src, setSrc] = useState<Src | null>(source);
  const [busy, setBusy] = useState(false);
  useEffect(() => setSrc(source), [source]);

  // Рамка — самая большая вертикальная рамка нужных пропорций, что влезает между шапкой и кнопками.
  const stageH = Math.max(40, win.height - insets.top - insets.bottom - 56 - 142);
  let fw = Math.min(win.width - 32, 440);
  let fh = fw / aspect;
  if (fh > stageH) {
    fh = stageH;
    fw = fh * aspect;
  }
  // Базовый размер — фото целиком накрывает рамку.
  const base = useMemo(() => {
    if (!src) return { w: fw, h: fh, k: 1 };
    const k = Math.max(fw / src.w, fh / src.h);
    return { w: src.w * k, h: src.h * k, k };
  }, [src, fw, fh]);

  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const sc = useRef(new Animated.Value(1)).current;
  const grid = useRef(new Animated.Value(0)).current;
  const cur = useRef({ x: 0, y: 0, s: 1 });
  const g = useRef<{ x: number; y: number; s: number; fingers: string; dist: number; cx: number; cy: number } | null>(null);

  const clamp = (x: number, y: number, s: number) => {
    const mx = Math.max(0, (base.w * s - fw) / 2);
    const my = Math.max(0, (base.h * s - fh) / 2);
    return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)), s };
  };
  const apply = (v: { x: number; y: number; s: number }, animated = false) => {
    cur.current = v;
    if (animated) {
      Animated.parallel([
        Animated.spring(tx, { toValue: v.x, useNativeDriver: true, friction: 8 }),
        Animated.spring(ty, { toValue: v.y, useNativeDriver: true, friction: 8 }),
        Animated.spring(sc, { toValue: v.s, useNativeDriver: true, friction: 8 }),
      ]).start();
    } else {
      tx.setValue(v.x);
      ty.setValue(v.y);
      sc.setValue(v.s);
    }
  };
  const reset = () => apply({ x: 0, y: 0, s: 1 }, true);
  useEffect(() => {
    apply({ x: 0, y: 0, s: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, fw, fh]);

  function track(e: GestureResponderEvent, rebase = false) {
    const touches = e.nativeEvent.touches.slice(0, 2);
    if (!touches.length) { g.current = null; return; }
    const [a, second] = touches;
    const b = second ?? a!;
    const fingers = touches.map(t => t.identifier).sort().join(",");
    const cx = (a!.locationX + b.locationX - fw) / 2;
    const cy = (a!.locationY + b.locationY - fh) / 2;
    const dist = Math.hypot(a!.pageX - b.pageX, a!.pageY - b.pageY);
    if (rebase || fingers !== g.current?.fingers) {
      g.current = { ...cur.current, fingers, cx, cy, dist };
      return;
    }
    const start = g.current;
    if (!start) return;
    const s = start.dist > 0 ? Math.max(1, Math.min(MAX_SCALE, start.s * dist / start.dist)) : start.s;
    // Keep the same pixel underneath the moving midpoint, including on zoom-out.
    apply(clamp(cx - (start.cx - start.x) * s / start.s, cy - (start.cy - start.y) * s / start.s, s));
  }
  const pan = useMemo(() => {
    const end = () => {
      g.current = null;
      Animated.timing(grid, { toValue: 0, duration: 200, useNativeDriver: true }).start();
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => !busy,
      onMoveShouldSetPanResponder: () => !busy,
      onPanResponderGrant: (e) => {
        track(e, true);
        Animated.timing(grid, { toValue: 1, duration: 120, useNativeDriver: true }).start();
      },
      onPanResponderStart: (e) => track(e, true),
      onPanResponderMove: (e) => track(e),
      onPanResponderEnd: (e) => track(e, true),
      onPanResponderRelease: end,
      onPanResponderTerminate: end,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base, fw, fh, busy]);

  async function rotate() {
    if (!src || busy) return;
    setBusy(true);
    try {
      const ctx = ImageManipulator.manipulate(src.uri);
      ctx.rotate(90);
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });
      Haptics.selectionAsync().catch(() => {});
      setSrc({ uri: out.uri, w: out.width, h: out.height });
    } catch {
      Alert.alert("Не удалось обработать фото", "Попробуй ещё раз или выбери другое фото.");
    } finally {
      setBusy(false);
    }
  }

  async function done() {
    if (!src || busy) return;
    setBusy(true);
    try {
      const { x, y, s } = cur.current;
      const k = base.k * s; // пикселей экрана на пиксель фото
      const cw = Math.max(1, Math.min(src.w, Math.round(fw / k)));
      const ch = Math.max(1, Math.min(src.h, Math.round(fh / k)));
      const originX = Math.max(0, Math.min(src.w - cw, src.w / 2 - x / k - cw / 2));
      const originY = Math.max(0, Math.min(src.h - ch, src.h / 2 - y / k - ch / 2));
      const ctx = ImageManipulator.manipulate(src.uri);
      ctx.crop({ originX: Math.round(originX), originY: Math.round(originY), width: Math.round(cw), height: Math.round(ch) });
      if (cw > 1080) ctx.resize({ width: 1080 });
      const img = await ctx.renderAsync();
      const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.85, base64: true });
      if (out.base64) onDone({ uri: out.uri, data: `data:image/jpeg;base64,${out.base64}` });
    } catch {
      Alert.alert("Не удалось обработать фото", "Попробуй ещё раз или выбери другое фото.");
    } finally {
      setBusy(false);
    }
  }

  const third = (p: "v" | "h", i: number) =>
    p === "v" ? { position: "absolute" as const, top: 0, bottom: 0, left: `${i * 33.333}%` as const, width: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(255,255,255,0.55)" } : { position: "absolute" as const, left: 0, right: 0, top: `${i * 33.333}%` as const, height: StyleSheet.hairlineWidth * 2, backgroundColor: "rgba(255,255,255,0.55)" };

  return (
    <Modal visible={!!source} animationType="slide" onRequestClose={onCancel} statusBarTranslucent presentationStyle="fullScreen">
      <View style={[st.root, { paddingTop: insets.top + 6, paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={st.head}>
          <Press dark onPress={onCancel} style={st.pill}>
            <Text style={kf("500", 14, { color: "#fff" })}>Отмена</Text>
          </Press>
          <Text style={kf("600", 16, { color: "#fff" })}>{title}</Text>
          <Press dark onPress={done} style={[st.pill, { backgroundColor: "#fff" }]}>
            {busy ? <ActivityIndicator color="#17141F" /> : <Text style={kf("600", 14, { color: "#17141F" })}>Готово</Text>}
          </Press>
        </View>

        <View style={st.stage}>
          <View style={[st.frame, { width: fw, height: fh }]}>
            {src ? (
              <Animated.View
                style={{
                  position: "absolute",
                  left: (fw - base.w) / 2,
                  top: (fh - base.h) / 2,
                  width: base.w,
                  height: base.h,
                  transform: [{ translateX: tx }, { translateY: ty }, { scale: sc }],
                }}
              >
                <RNImage source={{ uri: src.uri }} style={{ width: base.w, height: base.h }} />
              </Animated.View>
            ) : null}
            {previewTitle !== undefined ? (
              <View pointerEvents="none" style={st.prevWrap}>
                <Text style={kf("600", 18, { color: "#fff" })} numberOfLines={1}>{previewTitle || "Название встречи"}</Text>
              </View>
            ) : null}
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: grid }]}>
              <View style={third("v", 1)} />
              <View style={third("v", 2)} />
              <View style={third("h", 1)} />
              <View style={third("h", 2)} />
            </Animated.View>
            <View collapsable={false} style={StyleSheet.absoluteFill} {...pan.panHandlers} />
          </View>
        </View>

        <Text style={[kf("400", 13, { lh: 1.4, color: "rgba(255,255,255,0.65)" }), { textAlign: "center", marginHorizontal: 20 }]}>{hint}</Text>
        <View style={st.tools}>
          <Tool d="M4 12a8 8 0 1 0 2.3-5.6M4 4v4h4" label="Повернуть" onPress={rotate} />
          <Tool d="M9 4H5v4M15 4h4v4M9 20H5v-4M15 20h4v-4" label="Сбросить" onPress={reset} />
          {onReplace ? <Tool d="M4 7h3l2-2.5h6L17 7h3v12H4zM12 10.5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" label="Заменить" onPress={onReplace} /> : null}
        </View>
      </View>
    </Modal>
  );
}

/** Выбрать фото из галереи без системной обрезки (на iPhone она всегда квадратная) — дальше наш редактор 3:4. */
export async function pickSource(): Promise<Src | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) return null;
  const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], allowsEditing: false, quality: 1 });
  const a = res.canceled ? null : res.assets[0];
  if (!a) return null;
  // Большие фото сразу уменьшаем — редактор двигается плавно, а качества хватает с запасом.
  const big = Math.max(a.width, a.height) > 2400;
  if (big) {
    const ctx = ImageManipulator.manipulate(a.uri);
    ctx.resize(a.width >= a.height ? { width: 2400 } : { height: 2400 });
    const img = await ctx.renderAsync();
    const out = await img.saveAsync({ format: SaveFormat.JPEG, compress: 0.92 });
    return { uri: out.uri, w: out.width, h: out.height };
  }
  return { uri: a.uri, w: a.width, h: a.height };
}

const st = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0C0716" },
  head: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  pill: { height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", minWidth: 84 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { borderRadius: 22, overflow: "hidden", backgroundColor: "#000", borderWidth: 2, borderColor: "#fff" },
  prevWrap: { position: "absolute", left: 14, right: 14, bottom: 14 },
  tools: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 14, flexWrap: "wrap" },
  tool: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", gap: 8 },
});

/* ---------- Общий редактор для всего приложения: pickAndEdit() из любого экрана ---------- */
type Req = { src: Src; aspect?: number; title?: string; hint?: string; previewTitle?: string; resolve: (p: EditedPhoto | null) => void };
let pushReq: ((r: Req | null) => void) | null = null;

/** Галерея → наш редактор 3:4 → готовое фото (или null, если передумал). */
export async function pickAndEdit(opts: { aspect?: number; title?: string; hint?: string; previewTitle?: string } = {}): Promise<EditedPhoto | null> {
  const src = await pickSource();
  if (!src || !pushReq) return null;
  return new Promise((resolve) => pushReq?.({ src, ...opts, resolve }));
}

/** Open the saved profile photo directly, including legacy absolute and relative image URLs. */
export async function editExistingPhoto(url: string): Promise<EditedPhoto | null> {
  const fs = await import("expo-file-system/legacy");
  const { API_URL } = await import("@/lib/config");
  const uri = new URL(url, API_URL).href;
  const local = uri.startsWith("file:");
  const path = local ? uri : `${fs.cacheDirectory}profile-edit-${Date.now()}.jpg`;
  try {
    if (!local) {
      const download = await fs.downloadAsync(uri, path);
      if (download.status !== 200) throw new Error("photo_unavailable");
    }
    const { width: w, height: h } = await RNImage.getSize(path);
    const open = pushReq;
    if (!open) return null;
    return await new Promise<EditedPhoto | null>(resolve => open({ src: { uri: path, w, h }, title: "Фото профиля", resolve }));
  } finally {
    if (!local) await fs.deleteAsync(path, { idempotent: true }).catch(() => {});
  }
}

/** Ставится один раз в корне приложения (app/_layout.tsx). */
export function PhotoEditorHost() {
  const [req, setReq] = useState<Req | null>(null);
  useEffect(() => {
    pushReq = setReq;
    return () => {
      pushReq = null;
    };
  }, []);
  const close = (p: EditedPhoto | null) => {
    req?.resolve(p);
    setReq(null);
  };
  return (
    <PhotoEditor
      source={req?.src ?? null}
      aspect={req?.aspect}
      title={req?.title}
      hint={req?.hint}
      previewTitle={req?.previewTitle}
      onCancel={() => close(null)}
      onDone={(p) => close(p)}
      onReplace={async () => {
        const s = await pickSource();
        if (s && req) setReq({ ...req, src: s });
      }}
    />
  );
}
