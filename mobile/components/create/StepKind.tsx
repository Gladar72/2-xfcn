import { Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Glass } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { tapLight } from "@/lib/feedback";
import { stickerUrl } from "@/lib/stickers";
import { colors, FONT, f } from "@/lib/theme";
import { StepTitle } from "./parts";

/** Первый шаг создания: что создаём — открытую встречу, анонимную или событие для бизнеса. */
export type Kind = "open" | "anon" | "business";

const KINDS: { kind: Kind; sticker: string; title: string; text: string }[] = [
  { kind: "open", sticker: "mosya_wave", title: "Открытая встреча", text: "Кофе, спорт, кино, прогулка — все видят тебя и место встречи" },
  { kind: "anon", sticker: "mosya_shy", title: "Анонимная встреча", text: "Имя, фото и точный адрес увидят только те, чью заявку ты примешь" },
  {
    kind: "business",
    sticker: "mosya_glasses",
    title: "Событие для бизнеса",
    text: "Афиша для заведения или своего дела: концерт, квиз, мастер-класс. Гостей до 500, можно билеты",
  },
];

export function StepKind({ value, onPick }: { value: Kind | null; onPick: (k: Kind) => void }) {
  return (
    <View style={{ gap: 12 }}>
      <StepTitle plain="Что " em="создаём" after="?" sub="Выбери формат — дальше всё подскажу по шагам" />
      {KINDS.map((k) => {
        const on = value === k.kind;
        return (
          <Pressable
            key={k.kind}
            onPress={() => {
              tapLight();
              onPick(k.kind);
            }}
            style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.97 : 1 }] })}
          >
            <Glass strong style={[s.card, on && s.cardOn]}>
              <Image source={{ uri: stickerUrl(k.sticker) }} style={s.img} contentFit="contain" cachePolicy="disk" />
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={s.title}>{k.title}</Text>
                <Text style={s.text}>{k.text}</Text>
              </View>
              <View style={[s.check, on && s.checkOn]}>{on ? <Icon name="check" size={14} color="#fff" strokeWidth={2.4} /> : null}</View>
            </Glass>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 24, padding: 14, borderWidth: 1.5, borderColor: "transparent" },
  cardOn: { borderColor: colors.violet },
  img: { width: 64, height: 64 },
  title: { fontSize: 17, ...f("600"), color: colors.ink },
  text: { fontFamily: FONT, fontSize: 13.5, lineHeight: 19, color: colors.grey },
  check: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: "rgba(108,59,255,0.25)", alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.violet, borderColor: colors.violet },
});
