import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { Btn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { Sheet } from "@/components/Sheet";
import { Chip } from "@/components/ui";
import { api } from "@/lib/api";
import { tapLight } from "@/lib/feedback";
import { groupInterests, interestIcon } from "@/lib/interests";
import { DEFAULT_PEOPLE_FILTERS, PEOPLE_MAX_AGE, PEOPLE_MIN_AGE, type PeopleFilters } from "@/lib/peopleFilters";
import { colors, FONT, f } from "@/lib/theme";

interface Interest {
  id: string;
  name: string;
}

const GENDERS: [PeopleFilters["gender"], string][] = [
  ["all", "Все"],
  ["male", "Мужчины"],
  ["female", "Женщины"],
];
/** Популярные интересы — показываем сразу, остальные в «Все интересы». */
const PREVIEW = ["Кофе", "Кино", "Бег", "Путешествия", "Музыка", "Йога"];

/** Шторка «Фильтры» для «Людей рядом» — как PeopleFilterSheet в мини-приложении. */
export function PeopleFilterSheet({
  visible,
  value,
  onApply,
  onClose,
}: {
  visible: boolean;
  value: PeopleFilters;
  onApply: (f: PeopleFilters) => void;
  onClose: () => void;
}) {
  const [gender, setGender] = useState(value.gender);
  const [low, setLow] = useState(String(value.ageMin));
  const [high, setHigh] = useState(String(value.ageMax));
  const [selected, setSelected] = useState<string[]>(value.interests);
  const [catalog, setCatalog] = useState(false);
  const [search, setSearch] = useState("");
  const [all, setAll] = useState<Interest[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!visible) return;
    setGender(value.gender);
    setLow(String(value.ageMin));
    setHigh(String(value.ageMax));
    setSelected(value.interests);
    setCatalog(false);
    setSearch("");
  }, [visible, value]);

  useEffect(() => {
    if (!visible || all !== null) return;
    let alive = true;
    setFailed(false);
    api<{ interests?: Interest[] }>("/api/interests", { auth: false })
      .then((d) => {
        if (!alive) return;
        if (!Array.isArray(d.interests)) throw new Error("interests_unavailable");
        setAll(d.interests);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [visible, all, retry]);

  const ageMin = Number(low);
  const ageMax = Number(high);
  const ageOk = /^\d{2}$/.test(low) && /^\d{2}$/.test(high) && ageMin >= PEOPLE_MIN_AGE && ageMax <= PEOPLE_MAX_AGE && ageMin <= ageMax;

  function toggle(id: string) {
    tapLight();
    setSelected((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : ids.length < 100 ? [...ids, id] : ids));
  }

  function reset() {
    tapLight();
    setGender(DEFAULT_PEOPLE_FILTERS.gender);
    setLow(String(PEOPLE_MIN_AGE));
    setHigh(String(PEOPLE_MAX_AGE));
    setSelected([]);
  }

  const preview = useMemo(() => {
    const list = all ?? [];
    const picked = list.filter((i) => selected.includes(i.id));
    const popular = PREVIEW.flatMap((name) => list.filter((i) => i.name === name && !selected.includes(i.id)));
    return [...picked, ...popular].slice(0, 6);
  }, [all, selected]);

  const groups = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("ru");
    return groupInterests((all ?? []).filter((i) => i.name.toLocaleLowerCase("ru").includes(q)));
  }, [all, search]);

  const isDefault = gender === "all" && low === String(PEOPLE_MIN_AGE) && high === String(PEOPLE_MAX_AGE) && !selected.length;

  return (
    <Sheet visible={visible} onClose={onClose}>
      <View style={styles.head}>
        {catalog ? (
          <Pressable
            hitSlop={10}
            onPress={() => {
              setCatalog(false);
              setSearch("");
            }}
            accessibilityLabel="Назад к фильтрам"
          >
            <Icon name="back" />
          </Pressable>
        ) : null}
        <Text style={styles.title}>{catalog ? "Интересы" : "Фильтры"}</Text>
      </View>

      {catalog ? (
        <View style={styles.search}>
          <Icon name="search" size={18} color={colors.grey} />
          <TextInput value={search} onChangeText={setSearch} placeholder="Найти интерес" placeholderTextColor={colors.grey} style={styles.searchInput} />
        </View>
      ) : null}

      <ScrollView style={{ flexGrow: 0, flexShrink: 1 }} contentContainerStyle={{ gap: 16, paddingBottom: 8 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        {!catalog ? (
          <>
            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Кого показывать</Text>
              <View style={styles.wrap}>
                {GENDERS.map(([v, l]) => (
                  <Chip
                    key={v}
                    label={l}
                    active={gender === v}
                    onPress={() => {
                      tapLight();
                      setGender(v);
                    }}
                  />
                ))}
              </View>
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Возраст</Text>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <AgeInput prefix="от" value={low} onChange={setLow} />
                <AgeInput prefix="до" value={high} onChange={setHigh} plus={high === String(PEOPLE_MAX_AGE)} />
              </View>
              {!ageOk ? <Text style={styles.error}>Укажи возраст от 18 до 65+. Значение «от» не должно быть больше «до».</Text> : null}
            </View>

            <View style={{ gap: 8 }}>
              <Text style={styles.label}>Интересы</Text>
              <Text style={styles.hint}>Хотя бы один из выбранных</Text>
            </View>
          </>
        ) : null}

        {all === null ? (
          failed ? (
            <Btn kind="o" title="Загрузить интересы ещё раз" onPress={() => setRetry((n) => n + 1)} />
          ) : (
            <ActivityIndicator color={colors.violet} />
          )
        ) : catalog ? (
          groups.length ? (
            groups.map((g) => (
              <View key={g.title} style={{ gap: 8 }}>
                <Text style={styles.group}>{g.title}</Text>
                <View style={styles.wrap}>
                  {g.items.map((i) => (
                    <InterestChip key={i.id} name={i.name} on={selected.includes(i.id)} onPress={() => toggle(i.id)} />
                  ))}
                </View>
              </View>
            ))
          ) : (
            <Text style={styles.hint}>Такой интерес не найден. Попробуй другое название.</Text>
          )
        ) : (
          <>
            <View style={styles.wrap}>
              {preview.map((i) => (
                <InterestChip key={i.id} name={i.name} on={selected.includes(i.id)} onPress={() => toggle(i.id)} />
              ))}
            </View>
            <Pressable onPress={() => setCatalog(true)} style={styles.link} hitSlop={6}>
              <Text style={styles.linkText}>Все интересы{selected.length ? ` · ${selected.length}` : ""}</Text>
              <Icon name="chev" size={16} color={colors.violet} />
            </Pressable>
          </>
        )}
      </ScrollView>

      {catalog ? (
        <Btn
          title={`Готово${selected.length ? ` · ${selected.length}` : ""}`}
          onPress={() => {
            setCatalog(false);
            setSearch("");
          }}
        />
      ) : (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Btn kind="o" title="Сбросить" onPress={reset} disabled={isDefault} style={{ flex: 1 }} />
          <Btn
            title="Показать анкеты"
            disabled={!ageOk}
            onPress={() => onApply({ gender, ageMin, ageMax, interests: [...selected].sort() })}
            style={{ flex: 1.6 }}
          />
        </View>
      )}
    </Sheet>
  );
}

function AgeInput({ prefix, value, onChange, plus }: { prefix: string; value: string; onChange: (v: string) => void; plus?: boolean }) {
  return (
    <View style={styles.ageBox}>
      <Text style={styles.agePrefix}>{prefix}</Text>
      <TextInput
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, 2))}
        keyboardType="number-pad"
        maxLength={2}
        style={styles.ageInput}
        accessibilityLabel={`Возраст ${prefix}`}
      />
      {plus ? <Text style={styles.agePrefix}>+</Text> : null}
    </View>
  );
}

function InterestChip({ name, on, onPress }: { name: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.chip, on && styles.chipOn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
      <Image source={{ uri: interestIcon(name) }} style={{ width: 24, height: 24 }} contentFit="contain" />
      <Text style={[styles.chipText, on && { color: "#fff" }]}>{name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 4 },
  title: { fontSize: 22, ...f("500"), color: colors.ink, letterSpacing: -0.5 },
  label: { fontSize: 13, ...f("600"), color: colors.grey, textTransform: "uppercase", letterSpacing: 0.6 },
  hint: { fontFamily: FONT, fontSize: 13.5, color: colors.grey },
  error: { fontFamily: FONT, fontSize: 13, lineHeight: 18, color: colors.ink2 },
  group: { fontSize: 16, ...f("500"), color: colors.ink },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ageBox: { flex: 1, height: 48, borderRadius: 16, backgroundColor: "#fff", paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 6 },
  agePrefix: { fontFamily: FONT, fontSize: 15, color: colors.grey },
  ageInput: { flex: 1, fontFamily: FONT, fontSize: 16, color: colors.ink, paddingVertical: 0 },
  search: { height: 44, borderRadius: 14, backgroundColor: "#fff", paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  searchInput: { flex: 1, fontFamily: FONT, fontSize: 15, color: colors.ink, paddingVertical: 0 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 999, paddingLeft: 6, paddingRight: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(108,59,255,0.12)" },
  chipOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  chipText: { fontFamily: FONT, fontSize: 14, color: colors.ink },
  link: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-start" },
  linkText: { fontFamily: FONT, fontSize: 14.5, color: colors.violet },
});
