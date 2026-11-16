// Колесо выбора как .k-wheel мини-аппа (components/proto/pickers.tsx → Wheel):
// стеклянная плашка 130 px, строки по 40 px, выбранная — в белой полоске по центру,
// соседние поворачиваются и бледнеют. Каждый щелчок — лёгкая вибрация.
import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Platform, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { K, kf } from "@/components/k";

const ROW = 40;
const H = 130;
const PAD = (H - ROW) / 2;

export const KWheel = memo(function KWheel({ items, index, onChange, wide }: { items: string[]; index: number; onChange: (i: number) => void; wide?: boolean }) {
  const y = useRef(new Animated.Value(index * ROW)).current;
  const ref = useRef<Animated.LegacyRef<typeof Animated.ScrollView> & { scrollTo?: (o: { y: number; animated: boolean }) => void }>(null);
  const last = useRef(index);
  const tick = useRef(index);
  const touching = useRef(false);
  const initialOffset = useRef({ x: 0, y: index * ROW }).current;

  // Значение поменялось снаружи (календарь, правка) — докручиваем колесо.
  useEffect(() => {
    if (index !== last.current) {
      last.current = index;
      tick.current = index;
      (ref.current as unknown as { scrollTo: (o: { y: number; animated: boolean }) => void } | null)?.scrollTo({ y: index * ROW, animated: true });
    }
  }, [index]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
          if (touching.current && i !== tick.current) {
            tick.current = i;
            Haptics.selectionAsync().catch(() => {});
          }
        },
      }),
    [y, items.length]
  );

  const settle = (offsetY: number) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(offsetY / ROW)));
    tick.current = i;
    if (i !== last.current) {
      last.current = i;
      onChange(i);
    }
  };

  return (
    <View style={st.box}>
      <View pointerEvents="none" style={st.sel} />
      <Animated.ScrollView
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ref={ref as any}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate={Platform.OS === "ios" ? "fast" : 0.985}
        contentOffset={initialOffset}
        contentContainerStyle={{ paddingVertical: PAD }}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          touching.current = true;
        }}
        onScrollEndDrag={(e) => {
          const v = e.nativeEvent.velocity?.y ?? 0;
          if (Math.abs(v) < 0.05) settle(e.nativeEvent.contentOffset.y);
        }}
        onMomentumScrollEnd={(e) => {
          touching.current = false;
          settle(e.nativeEvent.contentOffset.y);
        }}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {items.map((t, i) => {
          const range = [(i - 2) * ROW, (i - 1) * ROW, i * ROW, (i + 1) * ROW, (i + 2) * ROW];
          return (
            <Animated.View
              key={t + i}
              style={{
                height: ROW,
                alignItems: "center",
                justifyContent: "center",
                opacity: y.interpolate({ inputRange: range, outputRange: [0.15, 0.45, 1, 0.45, 0.15], extrapolate: "clamp" }),
                transform: [
                  { perspective: 400 },
                  { rotateX: y.interpolate({ inputRange: range, outputRange: ["42deg", "21deg", "0deg", "-21deg", "-42deg"], extrapolate: "clamp" }) },
                  { scale: y.interpolate({ inputRange: range, outputRange: [0.92, 0.96, 1.08, 0.96, 0.92], extrapolate: "clamp" }) },
                ],
              }}
            >
              <Text style={kf("500", wide ? 17 : 18)} numberOfLines={1}>
                {t}
              </Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
});

const st = StyleSheet.create({
  box: { height: H, borderRadius: 24, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: K.glassb },
  sel: { position: "absolute", left: 8, right: 8, top: PAD, height: ROW, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.9)" },
});
