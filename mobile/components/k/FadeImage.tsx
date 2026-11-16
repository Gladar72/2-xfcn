// Фото, которое снизу плавно растворяется в прозрачность (как mask-image в мини-аппе),
// — без резкой границы с фоном под ним. Рисуется через SVG-маску.
import { useId } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import Svg, { Defs, Image as SvgImage, LinearGradient, Mask, Rect, Stop } from "react-native-svg";

export function FadeImage({ uri, width, height, from = 0.6, to = 1, focusY = 0.3, style }: { uri: string; width: number; height: number; from?: number; to?: number; focusY?: number; style?: StyleProp<ViewStyle> }) {
  const id = useId().replace(/[^a-zA-Z0-9]/g, "");
  return (
    <View style={[{ width, height }, style]} pointerEvents="none">
      <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
        <Defs>
          <LinearGradient id={`g${id}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={1} />
            <Stop offset={from} stopColor="#fff" stopOpacity={1} />
            <Stop offset={(from + to) / 2} stopColor="#fff" stopOpacity={0.45} />
            <Stop offset={to} stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <Mask id={`m${id}`} x="0" y="0" width={width} height={height} maskUnits="userSpaceOnUse">
            <Rect x="0" y="0" width={width} height={height} fill={`url(#g${id})`} />
          </Mask>
        </Defs>
        <SvgImage href={{ uri }} x="0" y="0" width={width} height={height} preserveAspectRatio={focusY < 0.4 ? "xMidYMin slice" : "xMidYMid slice"} mask={`url(#m${id})`} />
      </Svg>
    </View>
  );
}
