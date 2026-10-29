// Базовые элементы форм в новом стиле (2026). Кнопки — через Btn из brand.tsx.
import type { ReactNode } from "react";
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from "react-native";
import { Image } from "expo-image";
import { Btn, Glass } from "./brand";
import { colors, FONT, f } from "@/lib/theme";

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
  variant?: "primary" | "soft" | "ghost" | "telegram" | "dark";
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  icon?: ReactNode;
}) {
  const kind = variant === "primary" ? "v" : variant === "telegram" ? "tg" : variant === "dark" ? "k" : "o";
  if (variant === "ghost") {
    return (
      <Pressable onPress={onPress} disabled={disabled} style={[{ height: 48, alignItems: "center", justifyContent: "center" }, style]}>
        <Text style={{ fontSize: 16, color: colors.grey, ...f("500") }}>{title}</Text>
      </Pressable>
    );
  }
  return <Btn title={title} onPress={onPress} kind={kind} loading={loading} disabled={disabled} style={style} icon={icon} />;
}

export function Field(props: TextInputProps & { label?: string }) {
  const { label, style, multiline, ...rest } = props;
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <Glass strong style={[styles.field, multiline && { height: undefined, minHeight: 110, borderRadius: 22, paddingVertical: 12 }]}>
        <TextInput placeholderTextColor={colors.grey} style={[styles.input, multiline && { height: undefined, textAlignVertical: "top" }, style]} multiline={multiline} {...rest} />
      </Glass>
    </View>
  );
}

export function Avatar({ uri, size = 40, name }: { uri?: string | null; size?: number; name?: string }) {
  if (uri) return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" />;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: "#EDE5FF", alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.violet, ...f("600"), fontSize: size * 0.4 }}>{(name ?? "?").slice(0, 1).toUpperCase()}</Text>
    </View>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.93 : 1 }] })}>
      {active ? (
        <View style={[styles.chip, { backgroundColor: colors.ink }]}>
          <Text style={[styles.chipText, { color: "#fff" }]}>{label}</Text>
        </View>
      ) : (
        <Glass style={styles.chip}>
          <Text style={styles.chipText}>{label}</Text>
        </Glass>
      )}
    </Pressable>
  );
}

export function ErrorText({ children }: { children?: string | null }) {
  if (!children) return null;
  return <Text style={{ fontFamily: FONT, color: colors.danger, fontSize: 14 }}>{children}</Text>;
}

const styles = StyleSheet.create({
  label: { fontSize: 13.5, color: colors.grey, ...f("500"), marginLeft: 6 },
  field: { height: 56, borderRadius: 999, paddingHorizontal: 18, justifyContent: "center" },
  input: { fontFamily: FONT, fontSize: 16, color: colors.ink, height: 56 },
  chip: { paddingHorizontal: 16, height: 40, borderRadius: 999, justifyContent: "center" },
  chipText: { fontSize: 14, color: colors.ink, ...f("500") },
});
