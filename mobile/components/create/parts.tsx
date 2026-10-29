// Мелкие элементы мастера создания встречи: заголовок шага, подпись, вариант-радио, степпер.
import type { ReactNode } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Glass, Title } from "@/components/brand";
import { Chip } from "@/components/ui";
import { colors, FONT, f } from "@/lib/theme";

export function StepTitle({ plain, em, after, sub }: { plain: string; em: string; after?: string; sub: string }) {
  return (
    <View style={{ gap: 8, marginBottom: 6 }}>
      <Title plain={plain} em={em} after={after} size={30} />
      <Text style={s.sub}>{sub}</Text>
    </View>
  );
}

export function Label({ children, extra }: { children: string; extra?: string }) {
  return (
    <Text style={s.label}>
      {children}
      {extra ? <Text style={s.labelExtra}>{`  ${extra}`}</Text> : null}
    </Text>
  );
}

export function Muted({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={style}>
      <Text style={s.muted}>{children}</Text>
    </View>
  );
}

/** Вариант с «радио» (.opt): заголовок и, если есть, пояснение. */
export function Opt({ title, text, on, onPress }: { title: string; text?: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.98 : 1 }] })}>
      <Glass strong style={[s.opt, on && s.optOn]}>
        <View style={[s.radio, on && s.radioOn]}>{on ? <View style={s.radioDot} /> : null}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.optTitle}>{title}</Text>
          {text ? <Text style={s.optText}>{text}</Text> : null}
        </View>
      </Glass>
    </Pressable>
  );
}

/** Горизонтальный ряд чипов. */
export function ChipRow<T extends string | number>({
  items,
  value,
  onChange,
}: {
  items: [T, string][];
  value: T | null;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips} style={s.chipsWrap}>
      {items.map(([v, t]) => (
        <Chip key={String(v)} label={t} active={v === value} onPress={() => onChange(v)} />
      ))}
    </ScrollView>
  );
}

/** Степпер «− значение +», с необязательными крупными шагами по краям. */
export function Stepper({
  value,
  onMinus,
  onPlus,
  bigMinus,
  bigPlus,
  bigLabel = ["−1 ч", "+1 ч"],
}: {
  value: string;
  onMinus: () => void;
  onPlus: () => void;
  bigMinus?: () => void;
  bigPlus?: () => void;
  bigLabel?: [string, string];
}) {
  return (
    <View style={s.stepper}>
      {bigMinus ? <StepBtn label={bigLabel[0]} onPress={bigMinus} small /> : null}
      <StepBtn label="−" onPress={onMinus} />
      <Glass strong style={s.stepVal}>
        <Text style={s.stepValText}>{value}</Text>
      </Glass>
      <StepBtn label="+" onPress={onPlus} />
      {bigPlus ? <StepBtn label={bigLabel[1]} onPress={bigPlus} small /> : null}
    </View>
  );
}

function StepBtn({ label, onPress, small }: { label: string; onPress: () => void; small?: boolean }) {
  return (
    <Pressable onPress={onPress} hitSlop={4} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.88 : 1 }] })}>
      <Glass strong style={[s.stepBtn, small && s.stepBtnSmall]}>
        <Text style={[s.stepBtnText, small && { fontSize: 13 }]}>{label}</Text>
      </Glass>
    </Pressable>
  );
}

/** Сиреневая заметка с иконкой. */
export function Note({ icon, children }: { icon?: ReactNode; children: string }) {
  return (
    <View style={s.note}>
      {icon}
      <Text style={s.noteText}>{children}</Text>
    </View>
  );
}

export const s = StyleSheet.create({
  sub: { fontFamily: FONT, fontSize: 15, lineHeight: 21, color: colors.grey },
  label: { fontSize: 15, ...f("500"), color: colors.ink, marginTop: 22, marginBottom: 10, marginLeft: 4 },
  labelExtra: { fontSize: 13, ...f("400"), color: colors.grey },
  muted: { fontFamily: FONT, fontSize: 13, lineHeight: 18, color: colors.grey },
  opt: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 14 },
  optOn: { borderWidth: 2, borderColor: colors.violet },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "rgba(108,59,255,0.35)", alignItems: "center", justifyContent: "center" },
  radioOn: { borderColor: colors.violet },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violet },
  optTitle: { fontSize: 15.5, ...f("500"), color: colors.ink },
  optText: { fontFamily: FONT, fontSize: 13, lineHeight: 18, color: colors.grey },
  chipsWrap: { marginHorizontal: -20 },
  chips: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  stepper: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  stepBtn: { width: 48, height: 48, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  stepBtnSmall: { width: 56 },
  stepBtnText: { fontSize: 22, color: colors.ink, ...f("500") },
  stepVal: { minWidth: 96, height: 56, borderRadius: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 14 },
  stepValText: { fontSize: 24, ...f("500"), color: colors.ink, letterSpacing: -0.5 },
  note: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: colors.lav, borderRadius: 18, padding: 12, marginTop: 8 },
  noteText: { flex: 1, fontFamily: FONT, fontSize: 13, lineHeight: 18, color: colors.ink2 },
});
