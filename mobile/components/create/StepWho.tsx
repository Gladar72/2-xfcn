// Шаг 4. «Кто и сколько?» — сколько людей, расходы (или условия бизнес-события), открыто/анонимно, превью.
import { Linking, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Glass, Grad } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Avatar, Field } from "@/components/ui";
import { colors, FONT } from "@/lib/theme";
import { BIZ_PRICING, COSTS, dayChip, type Form, hhmm, type SetForm } from "./model";
import { Label, Muted, Note, Opt, StepTitle, Stepper } from "./parts";

const TG_BOT = "https://t.me/Mesto_people_bot";

export function StepWho({
  form,
  set,
  minSeats,
  isEdit,
  coverUri,
  iconUri,
  me,
  hint,
}: {
  form: Form;
  set: SetForm;
  minSeats: number;
  isEdit: boolean;
  coverUri: string | null;
  iconUri: string;
  me: { name: string; avatarUrl: string | null } | null;
  hint: (text: string) => void;
}) {
  const max = form.business ? 500 : 30;
  const seats = form.seatsTotal;
  const title = form.title || form.own || "Моя встреча";
  const anon = !form.business && form.isAnonymous;

  return (
    <View>
      <StepTitle plain="Кто " em="и сколько" after="?" sub="Все приходят по заявке — ты сам решаешь, кого принять." />

      <Label>Сколько человек ищешь</Label>
      <Stepper
        value={String(seats)}
        onMinus={() => {
          if (seats <= minSeats && isEdit) hint(`Меньше ${minSeats} нельзя — уже подтверждены`);
          set({ seatsTotal: Math.max(minSeats, seats - 1) });
        }}
        onPlus={() => set({ seatsTotal: Math.min(max, seats + 1) })}
        bigMinus={form.business ? () => set({ seatsTotal: Math.max(minSeats, seats - 10) }) : undefined}
        bigPlus={form.business ? () => set({ seatsTotal: Math.min(max, seats + 10) }) : undefined}
        bigLabel={["−10", "+10"]}
      />
      {form.business ? (
        <Muted style={st.hint}>
          {seats > 20 ? "Больше 20 человек — общий чат не создаётся, только заявки." : "Для бизнес-событий: до 40 на «Старт», до 100 на «Медиум»."}
        </Muted>
      ) : (
        <View style={st.hint}>
          <Text style={st.muted}>
            {`Не считая тебя. На встрече будет: ты + ${seats} = ${seats + 1} чел.`}
            {seats > 4 ? (
              <Text style={st.link} onPress={() => Linking.openURL(TG_BOT)}>
                {"  На «Старт» — до 4, больше на «Медиум»"}
              </Text>
            ) : null}
          </Text>
        </View>
      )}

      <Label>{form.business ? "Стоимость" : "Как насчёт расходов?"}</Label>
      {form.business ? (
        <View style={st.list}>
          {BIZ_PRICING.map(([v, t]) => (
            <Opt key={v} title={t} on={form.bizPricing === v} onPress={() => set({ bizPricing: v })} />
          ))}
          {form.bizPricing === "ticket" ? (
            <>
              <Glass strong style={st.price}>
                <TextInput
                  value={form.ticketPrice}
                  onChangeText={(t) => set({ ticketPrice: t.replace(/[^\d]/g, "").slice(0, 6) })}
                  placeholder="Цена билета, например 800"
                  placeholderTextColor={colors.grey}
                  keyboardType="number-pad"
                  style={st.priceInput}
                />
                <Text style={st.rub}>₽</Text>
              </Glass>
              <Note icon={<Icon name="wallet" size={18} color={colors.violet} />}>
                Гости платят тебе лично — на месте или переводом. После одобрения заявки гость получит номер билета и назовёт его на входе.
              </Note>
            </>
          ) : null}
          {form.bizPricing === "custom" ? (
            <Field value={form.bizTerms} onChangeText={(bizTerms) => set({ bizTerms })} placeholder="Например: депозит 1000 ₽ на баре" maxLength={300} multiline />
          ) : null}
        </View>
      ) : (
        <View style={st.list}>
          {COSTS.map(([v, t]) => (
            <Opt key={v} title={t} on={form.costType === v} onPress={() => set({ costType: v })} />
          ))}
        </View>
      )}

      {!form.business ? (
        <>
          <Label>Как публикуем?</Label>
          <View style={st.list}>
            <Opt title="Открыто" text="Все видят твой профиль и место встречи" on={!form.isAnonymous} onPress={() => set({ isAnonymous: false })} />
            <Opt
              title="Анонимно"
              text="Имя, фото и точный адрес увидят только те, чью заявку ты одобришь"
              on={form.isAnonymous}
              onPress={() => set({ isAnonymous: true })}
            />
          </View>
        </>
      ) : null}

      <Label>Так увидят другие</Label>
      <Glass strong style={st.pv}>
        <View style={st.pvImg}>
          {coverUri ? (
            <Image source={{ uri: coverUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <Grad style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
              <Image source={{ uri: iconUri }} style={{ width: 46, height: 46 }} contentFit="contain" />
            </Grad>
          )}
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={st.pvTitle} numberOfLines={2}>
            {title}
          </Text>
          <Text style={st.muted} numberOfLines={2}>
            {`${dayChip(form.dayIso).toLowerCase()}, ${hhmm(form.startMin)} · ${anon ? "анонимно · место после одобрения" : form.placeName}`}
          </Text>
          <View style={st.org}>
            {anon ? (
              <View style={st.mask}>
                <Icon name="mask" size={14} color={colors.violet} />
              </View>
            ) : (
              <Avatar uri={me?.avatarUrl} name={me?.name ?? "Я"} size={22} />
            )}
            <Text style={st.orgText} numberOfLines={1}>
              {anon ? "Организатор скрыт" : `${me?.name ?? "Ты"} · организатор`}
            </Text>
          </View>
        </View>
      </Glass>
    </View>
  );
}

const st = StyleSheet.create({
  hint: { marginTop: 10, marginHorizontal: 4 },
  muted: { fontFamily: FONT, fontSize: 13, lineHeight: 18, color: colors.grey },
  link: { color: colors.violet, fontWeight: "500" },
  list: { gap: 8 },
  price: { flexDirection: "row", alignItems: "center", height: 56, borderRadius: 999, paddingHorizontal: 18 },
  priceInput: { flex: 1, fontFamily: FONT, fontSize: 16, color: colors.ink, height: 56 },
  rub: { fontFamily: FONT, fontSize: 16, color: colors.grey },
  pv: { flexDirection: "row", gap: 12, borderRadius: 24, padding: 12, alignItems: "center" },
  pvImg: { width: 84, height: 84, borderRadius: 18, overflow: "hidden", backgroundColor: "#EDE5FF" },
  pvTitle: { fontFamily: FONT, fontSize: 16, fontWeight: "500", color: colors.ink },
  org: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  mask: { width: 22, height: 22, borderRadius: 11, backgroundColor: "#EDE5FF", alignItems: "center", justifyContent: "center" },
  orgText: { flex: 1, fontFamily: FONT, fontSize: 12.5, color: colors.ink2 },
});
