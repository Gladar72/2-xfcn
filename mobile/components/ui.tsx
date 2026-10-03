import type { ReactNode } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { colors, font, radius } from "@/lib/theme";

export function Button({
  title,
  onPress,
  variant = "primary",
  loading,
  disabled,
  style,
  icon,
}: {
  title: string;
  onPress?: () => void;
  variant?: "primary" | "soft" | "ghost" | "telegram";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: ReactNode;
}) {
  const bg =
    variant === "primary" ? colors.accent : variant === "soft" ? colors.lavender100 : variant === "telegram" ? "#2AABEE" : "transparent";
  const fg = variant === "soft" || variant === "ghost" ? colors.accent : "#fff";
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={styles.btnRow}>
          {icon}
          <Text style={[styles.btnText, { color: fg }]}>{title}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput placeholderTextColor={colors.ink400} style={[styles.input, style]} {...rest} />
    </View>
  );
}

export function Avatar({ uri, size = 40, name }: { uri?: string | null; size?: number; name?: string }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.lavender200, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.accent, fontWeight: "700", fontSize: size * 0.4 }}>{(name ?? "?").slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && { backgroundColor: colors.accent, borderColor: colors.accent }]}>
      <Text style={[styles.chipText, active && { color: "#fff" }]}>{label}</Text>
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={{ color: colors.danger, fontSize: font.sm }}>{children}</Text>;
}

const styles = StyleSheet.create({
  btn: { height: 54, borderRadius: radius.input, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  btnRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  btnText: { fontSize: font.base, fontWeight: "700" },
  label: { fontSize: font.sm, color: colors.ink600, fontWeight: "600" },
  input: {
    height: 54,
    borderRadius: radius.input,
    backgroundColor: colors.lavender50,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 16,
    fontSize: font.base,
    color: colors.ink900,
  },
  chip: { paddingHorizontal: 14, height: 36, borderRadius: 18, borderWidth: 1, borderColor: colors.border, backgroundColor: "#fff", justifyContent: "center" },
  chipText: { fontSize: font.sm, color: colors.ink900, fontWeight: "600" },
});
