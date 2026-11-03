import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { stickerUrl } from "@/lib/stickers";
import { colors, FONT } from "@/lib/theme";

/**
 * Мося выглядывает снизу справа над кнопкой и подсказывает — в своей полосе,
 * поэтому не закрывает поля анкеты. Новая фраза — Мося подпрыгивает,
 * облачко появляется заново. Тап — спрятаться.
 */
export function RegHint({ pose, text }: { pose: string; text: string }) {
  const rise = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const hop = useRef(new Animated.Value(0)).current;
  const [hidden, setHidden] = useState(false);
  const first = useRef(true);
  const firstText = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      Animated.sequence([
        Animated.delay(450),
        Animated.spring(rise, { toValue: 1, damping: 12, stiffness: 120, mass: 0.9, useNativeDriver: true }),
        Animated.spring(bubble, { toValue: 1, damping: 14, stiffness: 170, useNativeDriver: true }),
      ]).start();
    }
  }, [rise, bubble]);

  // Сменилась фраза — Мося подпрыгивает, облачко «перерисовывается».
  useEffect(() => {
    if (firstText.current) {
      firstText.current = false;
      return;
    }
    setHidden(false);
    bubble.setValue(0.6);
    hop.setValue(0);
    Animated.parallel([
      Animated.spring(bubble, { toValue: 1, damping: 14, stiffness: 170, useNativeDriver: true }),
      Animated.sequence([
        Animated.timing(hop, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(hop, { toValue: 0, duration: 420, easing: Easing.bezier(0.33, 1.3, 0.64, 1), useNativeDriver: true }),
      ]),
    ]).start();
  }, [text, bubble, hop]);

  return (
    <View style={styles.band} pointerEvents="box-none">
      {!hidden ? (
        <Pressable onPress={() => setHidden(true)} style={styles.row}>
          <Animated.View style={[styles.bubble, { opacity: bubble, transform: [{ scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }] }]}>
            <Text style={styles.text}>{text}</Text>
          </Animated.View>
          <Animated.View
            style={{
              transform: [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [110, 0] }) },
                { translateY: hop.interpolate({ inputRange: [0, 1], outputRange: [0, -10] }) },
              ],
            }}
          >
            <Image source={{ uri: stickerUrl(pose) }} style={styles.mosya} contentFit="contain" cachePolicy="disk" />
          </Animated.View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  band: { height: 92, overflow: "hidden", justifyContent: "flex-end" },
  row: { flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end", paddingLeft: 20, paddingRight: 6 },
  bubble: {
    flexShrink: 1,
    maxWidth: 240,
    marginBottom: 26,
    backgroundColor: "#fff",
    borderRadius: 18,
    borderBottomRightRadius: 5,
    paddingHorizontal: 13,
    paddingVertical: 9,
    shadowColor: "#40208C",
    shadowOpacity: 0.12,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 5 },
    elevation: 4,
  },
  text: { fontFamily: FONT, fontSize: 14, lineHeight: 19, color: colors.ink },
  mosya: { width: 88, height: 88 },
});
