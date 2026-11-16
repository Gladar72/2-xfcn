// Сердечки «вылетают» из кнопки — как в соцсетях: 7 штук разлетаются вверх веером и тают.
import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Animated, Easing, View } from "react-native";
import Svg, { Path } from "react-native-svg";
import * as Haptics from "expo-haptics";

const HEART = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";
const COLORS = ["#FF4F8B", "#FF8FB5", "#FF6FA0", "#C9BEFF", "#FF4F8B", "#FFB3CC", "#FF5E94"];

export type HeartBurstRef = { fire: () => void };

type P = { id: number; dx: number; dy: number; rot: number; size: number; color: string; t: Animated.Value };

export const HeartBurst = forwardRef<HeartBurstRef, { size?: number }>(function HeartBurst({ size = 48 }, ref) {
  const [items, setItems] = useState<P[]>([]);
  const seq = useRef(0);

  useImperativeHandle(ref, () => ({
    fire() {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
      const batch: P[] = Array.from({ length: 7 }, (_, i) => {
        const a = (-90 + (i - 3) * 22 + (Math.random() * 10 - 5)) * (Math.PI / 180);
        const dist = 70 + Math.random() * 60;
        return {
          id: ++seq.current,
          dx: Math.cos(a) * dist * 0.8,
          dy: Math.sin(a) * dist,
          rot: Math.random() * 50 - 25,
          size: 14 + Math.random() * 12,
          color: COLORS[i % COLORS.length]!,
          t: new Animated.Value(0),
        };
      });
      setItems((l) => [...l, ...batch]);
      batch.forEach((p, i) =>
        Animated.timing(p.t, { toValue: 1, duration: 750 + i * 40, delay: i * 25, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() =>
          setItems((l) => l.filter((x) => x.id !== p.id))
        )
      );
    },
  }));

  return (
    <View pointerEvents="none" style={{ position: "absolute", left: size / 2, top: size / 2, width: 0, height: 0, overflow: "visible", zIndex: 10 }}>
      {items.map((p) => (
        <Animated.View
          key={p.id}
          style={{
            position: "absolute",
            left: -p.size / 2,
            top: -p.size / 2,
            opacity: p.t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
            transform: [
              { translateX: p.t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dx] }) },
              { translateY: p.t.interpolate({ inputRange: [0, 1], outputRange: [0, p.dy] }) },
              { scale: p.t.interpolate({ inputRange: [0, 0.25, 1], outputRange: [0.3, 1.15, 0.8] }) },
              { rotate: p.t.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${p.rot}deg`] }) },
            ],
          }}
        >
          <Svg width={p.size} height={p.size} viewBox="0 0 24 24">
            <Path d={HEART} fill={p.color} />
          </Svg>
        </Animated.View>
      ))}
    </View>
  );
});

/** «Пульс» самой кнопки при нажатии: сжалась → прыгнула больше → на место. */
export function pop(v: Animated.Value) {
  v.setValue(0.8);
  Animated.spring(v, { toValue: 1, friction: 3, tension: 220, useNativeDriver: true }).start();
}
