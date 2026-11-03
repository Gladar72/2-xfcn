import { memo, useEffect, useMemo, useRef } from "react";
import { Animated, Platform, ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import * as Haptics from "expo-haptics";
import { colors, FONT, f } from "@/lib/theme";

/**
 * Дата рождения барабанами, как в iPhone: день · месяц · год.
 * Видно три строки, выбранная — в сиреневой плашке; соседние поворачиваются
 * и бледнеют. На каждом щелчке — лёгкий отклик вибрацией.
 */
export const MONTHS = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
const ROW = 40;
const VISIBLE = 3;

export interface BirthDate {
  d: number; // 1..31
  m: number; // 0..11
  y: number;
}

export const daysIn = (m: number, y: number) => new Date(y, m + 1, 0).getDate();

export function ageOf(b: BirthDate, now = new Date()): number {
  let a = now.getFullYear() - b.y;
  if (now.getMonth() < b.m || (now.getMonth() === b.m && now.getDate() < b.d)) a--;
  return a;
}

export function ageWord(a: number): string {
  const t = a % 10;
  const h = a % 100;
  if (h >= 11 && h <= 14) return "лет";
  if (t === 1) return "год";
  if (t >= 2 && t <= 4) return "года";
  return "лет";
}

const Wheel = memo(function Wheel({ items, index, onChange, flex }: { items: string[]; index: number; onChange: (i: number) => void; flex: number }) {
  const y = useRef(new Animated.Value(index * ROW)).current;
  const ref = useRef<ScrollView>(null);
  const last = useRef(index);

  // Значение поменялось снаружи (например, 31 → 30 при смене месяца) — докручиваем.
  useEffect(() => {
    if (index !== last.current) {
      last.current = index;
      ref.current?.scrollTo({ y: index * ROW, animated: true });
    }
  }, [index]);

  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
          if (i !== last.current) {
            last.current = i;
            Haptics.selectionAsync().catch(() => {});
            onChange(i);
          }
        },
      }),
    [y, items.length, onChange]
  );

  return (
    <View style={{ flex, height: ROW * VISIBLE }}>
      <Animated.ScrollView
        ref={ref}
        showsVerticalScrollIndicator={false}
        snapToInterval={ROW}
        decelerationRate={Platform.OS === "ios" ? "fast" : 0.985}
        contentOffset={{ x: 0, y: index * ROW }}
        contentContainerStyle={{ paddingVertical: ROW * ((VISIBLE - 1) / 2) }}
        onScroll={onScroll}
        scrollEventThrottle={16}
        nestedScrollEnabled
      >
        {items.map((t, i) => {
          const range = [(i - 1) * ROW, i * ROW, (i + 1) * ROW];
          return (
            <Animated.View
              key={t + i}
              style={[
                styles.row,
                {
                  opacity: y.interpolate({ inputRange: range, outputRange: [0.4, 1, 0.4], extrapolate: "clamp" }),
                  transform: [
                    { perspective: 400 },
                    { rotateX: y.interpolate({ inputRange: range, outputRange: ["38deg", "0deg", "-38deg"], extrapolate: "clamp" }) },
                    { scale: y.interpolate({ inputRange: range, outputRange: [0.92, 1, 0.92], extrapolate: "clamp" }) },
                  ],
                },
              ]}
            >
              <Text style={[styles.text, i === index && styles.cur]} numberOfLines={1}>
                {t}
              </Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
});

export function DateWheels({ value, onChange }: { value: BirthDate; onChange: (v: BirthDate) => void }) {
  const now = new Date().getFullYear();
  const years = useMemo(() => Array.from({ length: 83 }, (_, i) => String(now - 18 - i)), [now]);
  const days = useMemo(() => Array.from({ length: daysIn(value.m, value.y) }, (_, i) => String(i + 1)), [value.m, value.y]);
  const v = useRef(value);
  v.current = value;

  const set = (patch: Partial<BirthDate>) => {
    const next = { ...v.current, ...patch };
    next.d = Math.min(next.d, daysIn(next.m, next.y));
    onChange(next);
  };
  const onDay = useMemo(() => (i: number) => set({ d: i + 1 }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onMonth = useMemo(() => (i: number) => set({ m: i }), []); // eslint-disable-line react-hooks/exhaustive-deps
  const onYear = useMemo(() => (i: number) => set({ y: now - 18 - i }), [now]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <View style={styles.box}>
      <View pointerEvents="none" style={styles.sel} />
      <Wheel items={days} index={value.d - 1} onChange={onDay} flex={0.8} />
      <Wheel items={MONTHS} index={value.m} onChange={onMonth} flex={1.6} />
      <Wheel items={years} index={Math.max(0, now - 18 - value.y)} onChange={onYear} flex={1} />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flexDirection: "row", height: ROW * VISIBLE, borderRadius: 22, backgroundColor: "#fff", paddingHorizontal: 8, overflow: "hidden" },
  sel: { position: "absolute", left: 8, right: 8, top: ROW, height: ROW, borderRadius: 12, backgroundColor: colors.lav },
  row: { height: ROW, alignItems: "center", justifyContent: "center" },
  text: { fontFamily: FONT, fontSize: 18, color: colors.ink, fontVariant: ["tabular-nums"] },
  cur: { ...f("600") },
});
