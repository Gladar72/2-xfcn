import { memo } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Image } from "expo-image";

const loops = {
  e: require("../../assets/creature/eyes.webp"),
  p: require("../../assets/creature/plain.webp"),
  anonymous: require("../../assets/creature/anonymous.webp"),
  business: require("../../assets/creature/business.webp"),
} as const;
const largeEyes = require("../../assets/creature/eyes-large.webp");

export const creatureForKind = { open: "e", anon: "anonymous", business: "business" } as const;

type Props = { size?: number; variant?: keyof typeof loops; style?: StyleProp<ViewStyle> };

/** Один локальный анимированный WebP. Кадры исходного шейдера проигрывает нативный декодер. */
export const Creature = memo(function Creature({ size = 58, variant = "e", style }: Props) {
  const source = variant === "e" && size > 104 ? largeEyes : loops[variant];
  return (
    <View pointerEvents="none" style={[{ width: size, height: size }, style]}>
      <Image source={source} style={StyleSheet.absoluteFill} contentFit="contain" autoplay useAppleWebpCodec={false} transition={0} accessible={false} />
    </View>
  );
});
