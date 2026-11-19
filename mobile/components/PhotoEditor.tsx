// Редактор фото перед загрузкой — как PhotoCropModal мини-аппа и как в Instagram:
// фото двигается пальцем, двумя пальцами — приближается, пока двигаешь — видна сетка третей.
// «Повернуть», «Сбросить», «Заменить». Сохраняет кадр в пропорциях переданной рамки.
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Image as RNImage, Modal, StyleSheet, Text, View, useWindowDimensions, type GestureResponderEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { ImageManipulator, SaveFormat } from "expo-image-manipulator";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";
import { Press, kf } from "@/components/k";

import { CROP_TOUCH_MARGIN, cropCornerAt, resizeSelection, initialSelection, restoreCrop, fitCropSelection, MAX_PHOTO_ZOOM, PORTRAIT_ASPECT, type CropCorner, type CropRect, type PhotoTransform } from "@/lib/photoCrop";

export type EditedPhoto = { uri: string; data: string; source: Src };

export type PhotoSource = { uri: string; w: number; h: number; crop?: { x: number; y: number; scale: number } };
type Src = PhotoSource;

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
  aspect = PORTRAIT_ASPECT,
  title = "Обложка встречи",
  hint = "Потяни за угол, чтобы обрезать. Двигай фото пальцем, меняй масштаб двумя.",
  onCancel,
  onDone,
  onReplace,
}: {
  source: Src | null;
  aspect?: number;
  title?: string;
  hint?: string;
  onCancel: () => void;
  onDone: (p: EditedPhoto) => void;
  onReplace?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const win = useWindowDimensions();
  const [src, setSrc] = useState<Src | null>(source);
  const [busy, setBusy] = useState(false);
  useLayoutEffect(() => setSrc(source), [source]);

  // Рамка — самая большая вертикальная рамка нужных пропорций, что влезает между шапкой и кнопками.
  const [stageHeight, setStageHeight] = useState(0);
  const stageH = stageHeight || Math.max(40, win.height - insets.top - insets.bottom - 56 - 142);
  let fw = Math.min(win.width - 2 * CROP_TOUCH_MARGIN, 440);
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

  const initial = useMemo(() => initialSelection(fw, fh), [fw, fh]);
  const [frame, setFrame] = useState(initial);
  const selection = useRef(initial);
  const drag = useRef<{ corner: CropCorner; pageX: number; pageY: number; start: CropRect; image: PhotoTransform } | null>(null);

  function updateFrame(next: CropRect) {
    selection.current = next;
    setFrame(next);
  }

  // Translation is measured from canvas centre. Keep the selected rectangle covered.
  function apply(v: PhotoTransform, rect = selection.current) {
    const minScale = rect.width / fw;
    const s = Math.min(minScale * MAX_PHOTO_ZOOM, Math.max(minScale, v.s));
    const cx = rect.x + rect.width / 2 - fw / 2;
    const cy = rect.y + rect.height / 2 - fh / 2;
    const mx = Math.max(0, (base.w * s - rect.width) / 2);
    const my = Math.max(0, (base.h * s - rect.height) / 2);
    const x = Math.max(cx - mx, Math.min(cx + mx, v.x));
    const y = Math.max(cy - my, Math.min(cy + my, v.y));
    cur.current = { x, y, s };
    tx.setValue(x);
    ty.setValue(y);
    sc.setValue(s);
  }

  function reset() {
    updateFrame(initial);
    apply(restoreCrop(fw, fh, initial), initial);
  }

  useLayoutEffect(() => {
    g.current = null;
    drag.current = null;
    updateFrame(initial);
    apply(restoreCrop(fw, fh, initial, src?.crop), initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, initial]);

  type Touch = GestureResponderEvent["nativeEvent"]["touches"][number];
  function moveCorner(touch: Touch) {
    const d = drag.current;
    if (!d) return;
    const next = resizeSelection(fw, fh, d.start, d.corner, touch.pageX - d.pageX, touch.pageY - d.pageY, d.image.s);
    updateFrame(next);
    apply(d.image, next);
  }

  function track(event: GestureResponderEvent, begin = false) {
    const [a, b] = event.nativeEvent.touches;
    if (!a) return;
    const fingers = b ? [a.identifier, b.identifier].sort().join(",") : String(a.identifier);
    const same = fingers === g.current?.fingers;
    const cx = (a.locationX + (b ?? a).locationX - fw) / 2 - CROP_TOUCH_MARGIN;
    const cy = (a.locationY + (b ?? a).locationY - fh) / 2 - CROP_TOUCH_MARGIN;
    const dist = b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0;
    if (begin && !g.current && !b) {
      const r = selection.current;
      const corner = cropCornerAt(r.width, r.height, a.locationX - CROP_TOUCH_MARGIN - r.x, a.locationY - CROP_TOUCH_MARGIN - r.y);
      if (corner) drag.current = { corner, pageX: a.pageX, pageY: a.pageY, start: r, image: cur.current };
    }
    if (b) drag.current = null;
    if (!same || !g.current) {
      g.current = { ...cur.current, fingers, cx, cy, dist };
      grid.setValue(1);
      return;
    }
    if (drag.current) { moveCorner(a); return; }
    const start = g.current;
    const minScale = selection.current.width / fw;
    const s = start.dist > 0 ? Math.max(minScale, Math.min(MAX_PHOTO_ZOOM * minScale, start.s * dist / start.dist)) : start.s;
    apply({ x: cx - (start.cx - start.x) * s / start.s, y: cy - (start.cy - start.y) * s / start.s, s });
  }

  function finish(event: GestureResponderEvent) {
    if (event.nativeEvent.touches.length) { track(event); return; }
    const last = event.nativeEvent.changedTouches?.[0];
    if (last && drag.current) moveCorner(last);
    drag.current = null;
    g.current = null;
    grid.setValue(0);
  }

  function cancelGesture() {
    if (drag.current) {
      updateFrame(drag.current.start);
      apply(drag.current.image, drag.current.start);
    }
    drag.current = null;
    g.current = null;
    grid.setValue(0);
  }

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
    if (!src || busy || !stageHeight) return;
    setBusy(true);
    try {
      const { x, y, s } = fitCropSelection(fw, fh, selection.current, cur.current);
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
      if (out.base64) onDone({ uri: out.uri, source: { ...src, crop: { x: x / fw, y: y / fh, scale: s } }, data: `data:image/jpeg;base64,${out.base64}` });
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

        <View style={st.stage} onLayout={e => setStageHeight(Math.max(1, e.nativeEvent.layout.height - 2 * CROP_TOUCH_MARGIN))}>
          {stageHeight > 0 && src && <View collapsable={false} style={{ padding: CROP_TOUCH_MARGIN }}
            onStartShouldSetResponder={() => !busy} onResponderTerminationRequest={() => false}
            onResponderGrant={e => track(e, true)} onResponderStart={e => track(e, true)}
            onResponderMove={e => track(e)} onResponderEnd={finish} onResponderTerminate={cancelGesture}>
            <View pointerEvents="none" style={[st.frame, { width: fw, height: fh }]}>
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
              <Svg pointerEvents="none" width={fw} height={fh} style={StyleSheet.absoluteFill}>
                <Path fill="rgba(0,0,0,0.60)" fillRule="evenodd" d={`M0 0H${fw}V${fh}H0Z M${frame.x} ${frame.y}h${frame.width}v${frame.height}h-${frame.width}Z`} />
              </Svg>
              <View pointerEvents="none" style={{ position: "absolute", left: frame.x, top: frame.y, width: frame.width, height: frame.height }}>
                <View style={[StyleSheet.absoluteFill, { borderColor: "rgba(255,255,255,.7)", borderWidth: StyleSheet.hairlineWidth }]} />
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: grid }]}>
                  <View style={third("v", 1)} /><View style={third("v", 2)} />
                  <View style={third("h", 1)} /><View style={third("h", 2)} />
                </Animated.View>
                <Svg width={frame.width} height={frame.height}>
                  <Path fill="none" stroke="#fff" strokeWidth={4} d={`M1 17V1H17 M${frame.width - 17} 1h16v16 M1 ${frame.height - 17}v16h16 M${frame.width - 17} ${frame.height - 1}h16v-16`} />
                </Svg>
              </View>
            </View>
          </View>}
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
  root: { flex: 1, backgroundColor: "#101010" },
  head: { height: 56, flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16 },
  pill: { height: 38, paddingHorizontal: 16, borderRadius: 19, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", minWidth: 84 },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  frame: { overflow: "hidden", backgroundColor: "#000" },
  tools: { flexDirection: "row", justifyContent: "center", gap: 10, marginTop: 14, flexWrap: "wrap" },
  tool: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)", flexDirection: "row", alignItems: "center", gap: 8 },
});

/* ---------- Общий редактор для всего приложения: pickAndEdit() из любого экрана ---------- */
type Req = { src: Src; aspect?: number; title?: string; hint?: string; resolve: (p: EditedPhoto | null) => void };
let pushReq: ((r: Req | null) => void) | null = null;

/** Галерея → наш редактор 3:4 → готовое фото (или null, если передумал). */
export async function pickAndEdit(opts: { source?: Src; aspect?: number; title?: string; hint?: string; } = {}): Promise<EditedPhoto | null> {
  const src = opts.source ?? await pickSource();
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
      onCancel={() => close(null)}
      onDone={(p) => close(p)}
      onReplace={async () => {
        const s = await pickSource();
        if (s && req) setReq({ ...req, src: s });
      }}
    />
  );
}
