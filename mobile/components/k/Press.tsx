import { useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { tapLight } from "@/lib/feedback";
import { noteTouch } from "./Creature";

/**
 * Нажатие как в мини-аппе (components/proto/Motion26 + .k-pr в app/k26.css):
 * через 90 мс кнопка мягко «проседает» до 0.95 (0.12 с), отпустил — пружинит обратно
 * (cubic-bezier(.34,1.56,.64,1), 0.5 с), из точки касания расходится светлое пятно (.k-glow).
 * Если палец поехал (листание) — нажатие отменяется и ничего не проседает.
 * photo — фото-карточки: не проседают (как .k-mt/.k-hc), только свечение.
 */
const SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);

export function Press({
  children,
  onPress,
  onLongPress,
  style,
  photo,
  dark,
  haptic,
  disabled,
  hitSlop,
  accessibilityLabel,
}: {
  children?: ReactNode;
  onPress?: (e: GestureResponderEvent) => void;
  onLongPress?: () => void;
  style?: StyleProp<ViewStyle>;
  photo?: boolean;
  dark?: boolean;
  haptic?: boolean;
  disabled?: boolean;
  hitSlop?: number;
  accessibilityLabel?: string;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  const glow = useRef(new Animated.Value(1)).current; // 1 = свечение погасло (в покое не видно)
  const pos = useRef({ x: 0, y: 0 });
  const glowXY = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const down = (e: GestureResponderEvent) => {
    noteTouch();
    pos.current = { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY };
    if (timer.current) clearTimeout(timer.current);
    if (photo) return;
    // Проседает сразу под пальцем — без паузы, иначе кнопка кажется «зависшей».
    Animated.timing(scale, { toValue: 0.95, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  const up = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    Animated.timing(scale, { toValue: 1, duration: 320, easing: SPRING, useNativeDriver: true }).start();
  };
  const press = (e: GestureResponderEvent) => {
    noteTouch();
    glowXY.setValue({ x: pos.current.x - 80, y: pos.current.y - 80 });
    glow.setValue(0);
    Animated.timing(glow, { toValue: 1, duration: 600, easing: Easing.out(Easing.ease), useNativeDriver: true }).start();
    if (haptic) tapLight();
    onPress?.(e);
  };

  const flat = StyleSheet.flatten(style) ?? {};
  return (
    <Animated.View style={[{ transform: [{ scale }] }, flat.flex != null ? { flex: flat.flex as number } : null, flat.alignSelf ? { alignSelf: flat.alignSelf } : null]}>
      <Pressable
        onPressIn={down}
        unstable_pressDelay={0}
        onPressOut={up}
        onPress={press}
        onLongPress={onLongPress}
        disabled={disabled}
        hitSlop={hitSlop}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={[style, { overflow: "hidden" }]}
      >
        {children}
        <Animated.View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 160,
            height: 160,
            borderRadius: 80,
            backgroundColor: dark ? "rgba(170,160,255,0.35)" : "rgba(255,255,255,0.55)",
            opacity: glow.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
            transform: [
              { translateX: glowXY.x },
              { translateY: glowXY.y },
              { scale: glow.interpolate({ inputRange: [0, 1], outputRange: [0.2, 1.4] }) },
            ],
          }}
        />
      </Pressable>
    </Animated.View>
  );
}

/** Пустышка для выравнивания, когда нужно место под кнопку. */
export function PressSpacer({ size = 44 }: { size?: number }) {
  return <View style={{ width: size, height: size }} />;
}
