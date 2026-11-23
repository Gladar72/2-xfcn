import { useRef, type ReactNode } from "react";
import { Animated, Easing, Pressable, StyleSheet, View, type GestureResponderEvent, type StyleProp, type ViewStyle } from "react-native";
import { tapLight } from "@/lib/feedback";

/** Лёгкое сжатие кнопки при нажатии. Фото сохраняет исходный размер. */
const SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);

export function Press({
  children,
  onPress,
  onLongPress,
  style,
  photo,
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
  const down = () => {
    if (photo) return;
    Animated.timing(scale, { toValue: 0.95, duration: 70, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
  };
  const up = () => {
    if (photo) return;
    Animated.timing(scale, { toValue: 1, duration: 320, easing: SPRING, useNativeDriver: true }).start();
  };
  const press = (e: GestureResponderEvent) => {
    if (haptic) tapLight();
    onPress?.(e);
  };

  const { flex, alignSelf, ...innerStyle } = StyleSheet.flatten(style) ?? {};
  return (
    <Animated.View style={[{ transform: [{ scale }] }, flex != null ? { flex } : null, alignSelf ? { alignSelf } : null]}>
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
        style={[innerStyle, flex != null && flex > 0 && { flexGrow: 1 }, { overflow: "hidden" }]}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}

/** Пустышка для выравнивания, когда нужно место под кнопку. */
export function PressSpacer({ size = 44 }: { size?: number }) {
  return <View style={{ width: size, height: size }} />;
}
