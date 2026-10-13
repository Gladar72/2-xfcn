import { useEffect, useRef, useState, type ReactNode } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Btn } from "@/components/brand";
import { colors, FONT } from "@/lib/theme";

/**
 * Нижняя шторка с плавным появлением: фон затемняется, панель выезжает пружиной.
 * Закрывается тапом по фону. Используется для подтверждений («Отменить встречу?»).
 */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const fade = useRef(new Animated.Value(0)).current;
  const slide = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(slide, { toValue: 0, damping: 22, stiffness: 220, mass: 0.9, useNativeDriver: true }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(fade, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(slide, { toValue: 1, duration: 200, easing: Easing.in(Easing.cubic), useNativeDriver: true }),
      ]).start(() => setMounted(false));
    }
  }, [visible, mounted, fade, slide]);

  if (!mounted) return null;
  return (
    <Modal transparent visible animationType="none" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={[
          styles.panel,
          { paddingBottom: Math.max(insets.bottom, 16) + 8 },
          { transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [0, 480] }) }] },
        ]}
      >
        <View style={styles.grip} />
        {children}
      </Animated.View>
    </Modal>
  );
}

/** Шторка-подтверждение: заголовок, пояснение, «Да, …» и «Не сейчас». */
export function ConfirmSheet({
  visible,
  title,
  text,
  confirm,
  busyText,
  danger,
  busy,
  onConfirm,
  onClose,
}: {
  visible: boolean;
  title: string;
  text?: string;
  confirm: string;
  busyText?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Sheet visible={visible} onClose={busy ? () => {} : onClose}>
      <Text style={styles.title}>{title}</Text>
      {text ? <Text style={styles.text}>{text}</Text> : null}
      <View style={{ gap: 10, marginTop: 8 }}>
        <Pressable
          onPress={onConfirm}
          disabled={busy}
          style={({ pressed }) => [styles.danger, { backgroundColor: danger ? colors.danger : colors.violet, opacity: busy ? 0.6 : 1, transform: [{ scale: pressed ? 0.97 : 1 }] }]}
        >
          <Text style={styles.dangerText}>{busy ? busyText ?? "Секунду…" : confirm}</Text>
        </Pressable>
        <Btn kind="o" title="Не сейчас" onPress={onClose} disabled={busy} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: "rgba(22,18,31,0.45)" },
  panel: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.milk,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 10,
    gap: 8,
    shadowColor: "#2A1260",
    shadowOpacity: 0.2,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: -6 },
    elevation: 16,
  },
  grip: { alignSelf: "center", width: 40, height: 5, borderRadius: 3, backgroundColor: "rgba(22,18,31,0.15)", marginBottom: 10 },
  title: { fontFamily: FONT, fontSize: 22, fontWeight: "500", color: colors.ink, letterSpacing: -0.5 },
  text: { fontFamily: FONT, fontSize: 15, lineHeight: 21, color: colors.ink2 },
  danger: { height: 56, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  dangerText: { fontFamily: FONT, fontSize: 16.5, fontWeight: "600", color: "#fff" },
});
