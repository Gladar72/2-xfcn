// Шаг 3. «Когда и где?» — день (чипы на 2 недели), время шагом 15 минут, длительность, место.
import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Glass } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Chip, Field } from "@/components/ui";
import { api } from "@/lib/api";
import { colors, FONT, f } from "@/lib/theme";
import { type AddressSuggestion, dayChip, dayLong, DURS, type Form, hhmm, nextDays, type PlaceSuggestion, type SetForm } from "./model";
import { ChipRow, Label, Muted, StepTitle, Stepper } from "./parts";
import { qs } from "@/lib/format";

const clampStart = (m: number) => ((m % 1440) + 1440) % 1440;
const clampDur = (m: number) => Math.max(60, Math.min(23 * 60 + 45, m));
const durText = (m: number) => `${Math.floor(m / 60)} ч${m % 60 ? ` ${m % 60} мин` : ""}`;

export function StepWhen({ form, set, catLabel, city }: { form: Form; set: SetForm; catLabel: string; city: string | null }) {
  const days = useMemo(() => {
    const list = nextDays(14);
    return list.includes(form.dayIso) ? list : [...list, form.dayIso].sort();
  }, [form.dayIso]);

  const [query, setQuery] = useState("");
  const [recs, setRecs] = useState<PlaceSuggestion[]>([]);
  const [drop, setDrop] = useState<PlaceSuggestion[]>([]);
  const [addrDrop, setAddrDrop] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(!!form.placeName && form.latitude === undefined);

  // «Мося рекомендует» — места под категорию (кинотеатры для «Кино»…).
  useEffect(() => {
    const p = qs({ category: form.categorySlug, type: form.trainingTypeSlug });
    api<{ items?: PlaceSuggestion[] }>(`/api/places?${p}`)
      .then((d) => setRecs(Array.isArray(d.items) ? d.items.slice(0, 6) : []))
      .catch(() => setRecs([]));
  }, [form.categorySlug, form.trainingTypeSlug]);

  // Поиск по набранному: места (подсказки) + адреса (геокодер).
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setDrop([]);
      setAddrDrop([]);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      const p = qs({ q, category: form.categorySlug });
      const places = api<{ items?: PlaceSuggestion[] }>(`/api/places?${p}`)
        .then((d) => !cancelled && setDrop(Array.isArray(d.items) ? d.items.slice(0, 4) : []))
        .catch(() => !cancelled && setDrop([]));
      const g = qs({ query: q, city });
      const addrs =
        q.length >= 3
          ? api<{ suggestions?: AddressSuggestion[] }>(`/api/geocode?${g}`)
              .then((d) => !cancelled && setAddrDrop(Array.isArray(d.suggestions) ? d.suggestions.slice(0, 3) : []))
              .catch(() => !cancelled && setAddrDrop([]))
          : Promise.resolve();
      Promise.all([places, addrs]).finally(() => !cancelled && setSearching(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, form.categorySlug, city]);

  function pickPlace(p: { name: string; address: string; latitude: number; longitude: number }) {
    set({ placeName: p.name, address: p.address, latitude: p.latitude, longitude: p.longitude });
    setQuery("");
    setDrop([]);
    setAddrDrop([]);
    setManual(false);
  }

  const endMin = form.startMin + form.duration;
  const sumTxt = `${dayLong(form.dayIso)}, ${hhmm(form.startMin)}–${hhmm(endMin)}`;

  return (
    <View>
      <StepTitle plain="Когда " em="и где" after="?" sub="Выбери день, время начала и сколько продлится встреча." />

      <Glass strong style={st.sum}>
        <Icon name="cal" color={colors.violet} />
        <View style={{ flex: 1 }}>
          <Text style={st.sumSmall}>Встреча</Text>
          <Text style={st.sumText}>{sumTxt}</Text>
        </View>
      </Glass>

      <Label>День</Label>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={st.hWrap} contentContainerStyle={st.hRow}>
        {days.map((iso) => (
          <Chip key={iso} label={dayChip(iso)} active={iso === form.dayIso} onPress={() => set({ dayIso: iso })} />
        ))}
      </ScrollView>

      <Label>Начало</Label>
      <Stepper
        value={hhmm(form.startMin)}
        onMinus={() => set({ startMin: clampStart(form.startMin - 15) })}
        onPlus={() => set({ startMin: clampStart(form.startMin + 15) })}
        bigMinus={() => set({ startMin: clampStart(form.startMin - 60) })}
        bigPlus={() => set({ startMin: clampStart(form.startMin + 60) })}
      />

      <Label>Сколько продлится</Label>
      <ChipRow<number | "own">
        items={[...DURS, ["own", "Своё"]]}
        value={form.durOwn ? "own" : form.duration}
        onChange={(v) => (v === "own" ? set({ durOwn: true }) : set({ duration: v, durOwn: false }))}
      />
      {form.durOwn ? (
        <View style={{ marginTop: 12 }}>
          <Stepper
            value={durText(form.duration)}
            onMinus={() => set({ duration: clampDur(form.duration - 15) })}
            onPlus={() => set({ duration: clampDur(form.duration + 15) })}
            bigMinus={() => set({ duration: clampDur(form.duration - 60) })}
            bigPlus={() => set({ duration: clampDur(form.duration + 60) })}
          />
        </View>
      ) : null}
      <Muted style={{ marginTop: 8, marginHorizontal: 4 }}>{`Окончание в ${hhmm(endMin)}. Минимум 1 час. Окончание может быть на следующий день.`}</Muted>

      <Label>Место</Label>
      <Field value={query} onChangeText={setQuery} placeholder="Название места или адрес" autoCorrect={false} />
      {query.trim().length >= 2 ? (
        <Glass strong style={st.drop}>
          {drop.map((p) => (
            <Row key={"p" + p.name + p.address} icon="pin" title={p.name} text={p.address} onPress={() => pickPlace(p)} />
          ))}
          {addrDrop.map((a) => (
            <Row
              key={"a" + a.address}
              icon="nav"
              title={a.address.split(",")[0] ?? a.address}
              text={a.address}
              onPress={() => pickPlace({ name: query.trim(), address: a.address, latitude: a.latitude, longitude: a.longitude })}
            />
          ))}
          {drop.length === 0 && addrDrop.length === 0 ? (
            <Text style={st.empty}>{searching ? "Ищем…" : "Ничего не нашли — введи место вручную ниже"}</Text>
          ) : null}
        </Glass>
      ) : null}

      {recs.length > 0 ? (
        <>
          <View style={st.tag}>
            <Text style={st.tagText}>✦ Мося рекомендует для «{catLabel}»</Text>
          </View>
          <View style={{ gap: 8 }}>
            {recs.map((p) => {
              const on = form.placeName === p.name && form.latitude === p.latitude;
              return (
                <Pressable key={p.name + p.address} onPress={() => pickPlace(p)}>
                  <Glass strong style={[st.rec, on && st.recOn]}>
                    <Text style={st.recTitle} numberOfLines={1}>
                      {p.name}
                    </Text>
                    {p.rating ? (
                      <Text style={[st.recText, { color: colors.ink, ...f("600") }]} numberOfLines={1}>
                        ★ {p.rating.toFixed(1).replace(".", ",")}
                        {p.reviews ? ` · ${p.reviews.toLocaleString("ru-RU")} отз.` : ""}
                      </Text>
                    ) : null}
                    {p.note ? (
                      <Text style={st.recText} numberOfLines={2}>
                        {p.note}
                      </Text>
                    ) : null}
                    <Text style={st.recText} numberOfLines={1}>
                      {p.address || "адрес уточним"}
                    </Text>
                  </Glass>
                </Pressable>
              );
            })}
          </View>
        </>
      ) : null}

      {form.placeName && !manual ? (
        <Glass strong style={st.picked}>
          <View style={st.pin}>
            <Icon name="pin" color="#fff" size={18} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={st.recTitle}>{form.placeName}</Text>
            {form.address ? <Text style={st.recText}>{form.address}</Text> : null}
          </View>
          <Pressable onPress={() => setManual(true)} hitSlop={8}>
            <Icon name="edit" color={colors.violet} size={20} />
          </Pressable>
        </Glass>
      ) : null}

      {manual ? (
        <View style={{ gap: 10, marginTop: 12 }}>
          <Field label="Название места" value={form.placeName} onChangeText={(placeName) => set({ placeName })} placeholder="Например, кофейня «Зерно»" maxLength={120} />
          <Field
            label="Адрес"
            value={form.address}
            onChangeText={(address) => set({ address, latitude: undefined, longitude: undefined })}
            placeholder="Улица и дом"
            maxLength={300}
          />
          <Muted style={{ marginHorizontal: 4 }}>Точку на карте найдём по адресу, когда нажмёшь «Дальше».</Muted>
        </View>
      ) : (
        <Pressable onPress={() => setManual(true)} hitSlop={6} style={{ alignSelf: "flex-start", marginTop: 12, marginLeft: 4 }}>
          <Text style={st.link}>Ввести место вручную</Text>
        </Pressable>
      )}
    </View>
  );
}

function Row({ icon, title, text, onPress }: { icon: "pin" | "nav"; title: string; text: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={18} color={colors.violet} />
      <View style={{ flex: 1 }}>
        <Text style={st.recTitle} numberOfLines={1}>
          {title}
        </Text>
        {text ? (
          <Text style={st.recText} numberOfLines={1}>
            {text}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const st = StyleSheet.create({
  sum: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 22, padding: 14, marginTop: 14 },
  sumSmall: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  sumText: { fontSize: 16, ...f("500"), color: colors.ink },
  hWrap: { marginHorizontal: -20 },
  hRow: { gap: 8, paddingHorizontal: 20, paddingVertical: 4 },
  drop: { borderRadius: 20, marginTop: 8, paddingVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  empty: { fontFamily: FONT, fontSize: 13.5, color: colors.grey, padding: 14 },
  tag: { alignSelf: "flex-start", backgroundColor: colors.lav, borderRadius: 999, paddingHorizontal: 10, height: 26, justifyContent: "center", marginTop: 14, marginBottom: 8 },
  tagText: { fontSize: 12, color: colors.violet, ...f("500") },
  rec: { borderRadius: 18, paddingHorizontal: 14, paddingVertical: 11, gap: 2 },
  recOn: { borderWidth: 2, borderColor: colors.violet },
  recTitle: { fontSize: 15, ...f("500"), color: colors.ink },
  recText: { fontFamily: FONT, fontSize: 13, color: colors.grey },
  picked: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 22, padding: 14, marginTop: 12 },
  pin: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.violet, alignItems: "center", justifyContent: "center" },
  link: { fontSize: 14, color: colors.violet, ...f("500") },
});
