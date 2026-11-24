import type { ReactNode } from "react";
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Aurora, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { colors, f } from "@/lib/theme";

export function TicketPanel({ visible, title, accent, subtitle, onBack, children, footer, busy }: {
  visible: boolean; title: string; accent?: string; subtitle: string; onBack: () => void;
  children: ReactNode; footer?: ReactNode; busy?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return <Modal visible={visible} animationType="slide" presentationStyle="fullScreen" onRequestClose={busy ? undefined : onBack}>
    <View style={styles.root}>
      <Aurora />
      <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={{ paddingTop: insets.top + 4, paddingHorizontal: 16 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Назад" disabled={busy} onPress={onBack} style={styles.back}>
            <Icon name="back" size={21} />
          </Pressable>
        </View>
        <ScrollView key={title} keyboardShouldPersistTaps="handled" alwaysBounceVertical={false}
          contentContainerStyle={[styles.page, { paddingBottom: Math.max(12, insets.bottom) }]}>
          <Title plain={title} em={accent} size={29} />
          <Text style={styles.subtitle}>{subtitle}</Text>
          {children}
          {footer && <View style={styles.footer}>{footer}</View>}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  </Modal>;
}

export function TicketAmounts({ rows }: { rows: [string, string][] }) {
  return <View style={styles.card}>{rows.map(([label,value]) =>
    <View style={styles.amountRow} key={label}>
      <Text style={styles.amountLabel}>{label}</Text><Text style={styles.value}>{value}</Text>
    </View>)}</View>;
}

export const ticketStyles = StyleSheet.create({
  card: { borderRadius: 20, backgroundColor: "#fff", paddingHorizontal: 14, paddingVertical: 9 },
  fieldLabel: { ...f("400"), color: colors.ink2, fontSize: 12 },
  input: { ...f("500"), color: colors.ink, fontSize: 16, paddingVertical: 7, paddingHorizontal: 0 },
  body: { ...f("400"), fontSize: 15, lineHeight: 21, color: colors.ink },
  note: { ...f("400"), fontSize: 13, lineHeight: 18, color: colors.ink2 },
});

const styles = StyleSheet.create({
  root: { flex: 1 },
  back: { alignSelf: "flex-start", width: 44, height: 44, borderRadius: 22, backgroundColor: "#fff", justifyContent: "center", alignItems: "center" },
  page: { width: "100%", maxWidth: 520, alignSelf: "center", flexGrow: 1, paddingHorizontal: 16, paddingTop: 12, gap: 11 },
  subtitle: { ...f("400"), color: colors.ink2, fontSize: 15, marginBottom: 2 },
  card: ticketStyles.card,
  amountRow: { flexDirection: "row", gap: 10, justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  amountLabel: { ...f("400"), fontSize: 14, color: colors.ink2 },
  value: { ...f("600"), fontSize: 15, flexShrink: 1, textAlign: "right", color: colors.ink },
  footer: { marginTop: "auto", paddingTop: 12, gap: 8 },
});
