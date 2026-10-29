import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { onGuide, type Tip } from "@/lib/guide";
import { stickerUrl } from "@/lib/stickers";
import { colors, FONT, f } from "@/lib/theme";

/**
 * Мося выглядывает снизу справа с облачком (как в веб-версии): выпрыгивает с пружиной,
 * покачивается, облачко появляется следом. Тап — следующая подсказка или спрятаться.
 * Сам прячется через несколько секунд. Все анимации — на нативном драйвере, без рывков.
 */
export function MosyaPeekHost() {
  const insets = useSafeAreaInsets();
  const queue = useRef<Tip[]>([]);
  const [tip, setTip] = useState<Tip | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const rise = useRef(new Animated.Value(0)).current;
  const bubble = useRef(new Animated.Value(0)).current;
  const sway = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hiding = useRef(false);

  useEffect(
    () =>
      onGuide((tips) => {
        if (!tips) {
          queue.current = [];
          hide(true);
          return;
        }
        queue.current = tips.slice(1);
        present(tips[0]);
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  function present(next: Tip) {
    if (timer.current) clearTimeout(timer.current);
    hiding.current = false;
    rise.setValue(0);
    bubble.setValue(0);
    sway.setValue(0);
    setTip(next);
    setHasMore(queue.current.length > 0);
    Animated.sequence([
      Animated.spring(rise, { toValue: 1, damping: 11, stiffness: 140, mass: 0.8, useNativeDriver: true }),
      Animated.parallel([
        Animated.spring(bubble, { toValue: 1, damping: 13, stiffness: 180, useNativeDriver: true }),
        Animated.sequence(
          [1, -0.8, 0.6, -0.3, 0].map((v) =>
            Animated.timing(sway, { toValue: v, duration: 170, easing: Easing.inOut(Easing.quad), useNativeDriver: true })
          )
        ),
      ]),
    ]).start();
    timer.current = setTimeout(() => advance(), Math.max(5000, next.text.length * 62));
  }

  function hide(fast = false, then?: () => void) {
    if (timer.current) clearTimeout(timer.current);
    if (hiding.current) return;
    hiding.current = true;
    Animated.parallel([
      Animated.timing(bubble, { toValue: 0, duration: 140, useNativeDriver: true }),
      Animated.timing(rise, { toValue: 0, duration: fast ? 200 : 380, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
    ]).start(() => {
      setTip(null);
      then?.();
    });
  }

  function advance() {
    const next = queue.current.shift();
    hide(false, next ? () => setTimeout(() => present(next), 350) : undefined);
  }

  if (!tip) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { zIndex: 50 }]}>
      <Pressable onPress={advance} style={[styles.wrap, { bottom: insets.bottom + 92 }]}>
        <Animated.View
          style={[
            styles.bubble,
            {
              opacity: bubble,
              transform: [
                { translateX: bubble.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) },
                { translateY: bubble.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }) },
                { scale: bubble.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
              ],
            },
          ]}
        >
          <Text style={styles.text}>{tip.text}</Text>
          {hasMore ? <Text style={styles.more}>Дальше ›</Text> : null}
        </Animated.View>
        <Animated.View
          style={{
            transform: [
              { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [190, 0] }) },
              { rotate: sway.interpolate({ inputRange: [-1, 1], outputRange: ["-9deg", "9deg"] }) },
            ],
          }}
        >
          <Image source={{ uri: stickerUrl(tip.pose) }} style={styles.mosya} contentFit="contain" cachePolicy="disk" />
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: "absolute", right: 8, left: 24, flexDirection: "row", alignItems: "flex-end", justifyContent: "flex-end" },
  bubble: {
    flexShrink: 1,
    maxWidth: 250,
    marginBottom: 70,
    marginRight: -12,
    backgroundColor: "#fff",
    borderRadius: 20,
    borderBottomRightRadius: 6,
    paddingHorizontal: 14,
    paddingVertical: 11,
    shadowColor: "#6C3BFF",
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  text: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.ink },
  more: { fontSize: 13, ...f("600"), color: colors.violet, marginTop: 6, textAlign: "right" },
  mosya: { width: 108, height: 108 },
});
