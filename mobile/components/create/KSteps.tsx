// Шаги мастера создания — перенос разметки CreateMeetingFlow мини-аппа один в один (app/k26.css: .k-cats, .k-own,
// .k-cvg, .k-bizph, .k-dates, .k-wheel, .k-recp, .k-mapbox, .k-addr, .k-bigst, .k-plan, .k-prev).
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { api } from "@/lib/api";
import { qs } from "@/lib/format";
import { catIcon, CATEGORY_SHORT, eventIcon, piIcon } from "@/lib/theme";
import { coverUri } from "@/lib/covers";
import { INTEREST_GROUPS } from "@/lib/interests";
import { BIZ_SECTIONS, bizCategoryIcon } from "@/lib/bizCategories";
import { Creature, K, KI, Press, kem, kf } from "@/components/k";
import { KWheel } from "./KWheel";
import { PlacePicker } from "./PlacePicker";
import { BIZ_PRICING, COSTS, type AddressSuggestion, type Category, type Form, type PlaceSuggestion, type SetForm, type TrainingType } from "./model";

export type Kind = "open" | "anon" | "business";

/* ---------- общие кусочки ---------- */

export function H1({ plain, em, after = "" }: { plain: string; em: string; after?: string }) {
  return (
    <Text style={kf("300", 36, { lh: 1.14, ls: -0.035 })}>
      {plain}
      <Text style={kem(36 * 1.08)}>{em}</Text>
      {after}
    </Text>
  );
}
export function Sub({ children }: { children: string }) {
  return <Text style={[kf("400", 14, { lh: 1.5, color: K.ink2 }), { marginTop: 8, marginBottom: 12 }]}>{children}</Text>;
}
export function Lbl({ children, style }: { children: string; style?: object }) {
  return <Text style={[kf("500", 13, { color: K.ink2 }), { marginTop: 16, marginBottom: 8, marginHorizontal: 4 }, style]}>{children}</Text>;
}
function Cvn({ children }: { children: string }) {
  return <Text style={[kf("400", 12.5, { color: K.ink2 }), { marginTop: 8, marginHorizontal: 2 }]}>{children}</Text>;
}
const G = { backgroundColor: "rgba(255,255,255,0.66)", borderWidth: 1, borderColor: K.glassb } as const;

/** .k-cat — плитка 86 px: 3D-иконка и подпись. */
function Cat({ icon, label, on, onPress }: { icon: string; label: string; on: boolean; onPress: () => void }) {
  return (
    <View style={{ width: "25%", padding: 5 }}>
      <Press haptic dark={on} onPress={onPress} style={[st.cat, on ? st.on : G]}>
        <Image source={{ uri: icon }} style={{ width: 38, height: 38 }} contentFit="contain" cachePolicy="memory-disk" />
        <Text style={[kf("500", 12, { color: on ? "#fff" : K.ink }), { textAlign: "center" }]} numberOfLines={2}>
          {label}
        </Text>
      </Press>
    </View>
  );
}

/** .k-own — строка «Своё предложение» с чёрным кружком «+». */
function Own({ title, text, on, onPress }: { title: string; text: string; on: boolean; onPress: () => void }) {
  return (
    <Press haptic dark={on} onPress={onPress} style={[st.own, on ? st.on : G]}>
      <View style={[st.op, on && { backgroundColor: "#fff" }]}>
        <KI n="plusp" size={20} color={on ? K.ink : "#fff"} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={kf("500", 15, { color: on ? "#fff" : K.ink })}>{title}</Text>
        <Text style={[kf("400", 12.5, { lh: 1.4, color: on ? "rgba(255,255,255,0.7)" : K.ink2 }), { marginTop: 3 }]}>{text}</Text>
      </View>
    </Press>
  );
}

function Chip({ label, icon, on, onPress }: { label: string; icon?: string; on: boolean; onPress: () => void }) {
  return (
    <Press haptic dark={on} onPress={onPress} style={[st.chip, on ? st.on : G]}>
      {icon ? <Image source={{ uri: icon }} style={{ width: 20, height: 20, marginLeft: -4 }} contentFit="contain" tintColor={on ? "#fff" : undefined} /> : null}
      <Text style={kf("500", 14, { color: on ? "#fff" : K.ink })} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

/* ---------- «Что создаём?» ---------- */

const KINDS: [Kind, number, string, string][] = [
  ["open", 0, "Открытая встреча", "Кофе, спорт, кино, прогулка — все видят тебя и место встречи"],
  ["anon", 40, "Анонимная встреча", "Имя, фото и точный адрес увидят только те, чью заявку ты примешь"],
  ["business", -50, "Событие для бизнеса", "Афиша для заведения или своего дела: концерт, квиз, мастер‑класс. Гостей до 500, можно билеты"],
];

export function KindStep({ value, onPick }: { value: Kind | null; onPick: (k: Kind) => void }) {
  return (
    <View>
      <H1 plain="Что " em="создаём" after="?" />
      <Sub>Выбери формат — дальше всё подскажу по шагам.</Sub>
      <View style={{ gap: 8, marginTop: 4 }}>
        {KINDS.map(([k, hue, name, text]) => {
          const on = value === k;
          return (
            <Press key={k} haptic dark={on} onPress={() => onPick(k)} style={[st.opt3, on ? st.on : G]}>
              <View style={{ width: 76, height: 76, alignItems: "center", justifyContent: "center" }}>
                <Creature size={86} variant={k === "anon" ? "p" : "e"} hue={hue} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={kf("500", 15, { color: on ? "#fff" : K.ink })}>{name}</Text>
                <Text style={[kf("400", 12.5, { lh: 1.4, color: on ? "rgba(255,255,255,0.7)" : K.ink2 }), { marginTop: 3 }]}>{text}</Text>
              </View>
            </Press>
          );
        })}
      </View>
    </View>
  );
}

/* ---------- 1. Что планируем ---------- */

export function WhatStep({ form, set, categories, trainingTypes, next }: { form: Form; set: SetForm; categories: Category[]; trainingTypes: TrainingType[]; next: () => void }) {
  const cats = categories.filter((c) => c.slug !== "custom");
  const hasCustom = categories.some((c) => c.slug === "custom");
  const isOwn = form.categorySlug === "custom";
  const sports = (INTEREST_GROUPS[0]?.items ?? []).filter(([n]) => !trainingTypes.some((t) => t.name.toLowerCase() === n.toLowerCase()));
  return (
    <View>
      <H1 plain="Что " em="планируем" after="?" />
      <Sub>Выбери, во что будет встреча. Так её найдут люди с похожими интересами.</Sub>
      <View style={st.grid}>
        {cats.map((c) => (
          <Cat
            key={c.id}
            icon={catIcon(c.slug)}
            label={CATEGORY_SHORT[c.slug] ?? c.name}
            on={form.categorySlug === c.slug}
            onPress={() => {
              set({ categorySlug: c.slug, ...(c.slug !== "training" ? { trainingTypeSlug: null } : {}) });
              if (c.slug !== "training") next();
            }}
          />
        ))}
      </View>
      {form.categorySlug === "training" ? (
        <>
          <Lbl>Какая тренировка?</Lbl>
          <View style={[st.grid, { marginTop: -5 }]}>
            {trainingTypes
              .filter((t) => t.slug !== "custom")
              .map((t) => (
                <Cat
                  key={t.id}
                  icon={eventIcon({ category: { slug: "training" }, trainingType: { slug: t.slug } })}
                  label={t.name}
                  on={form.trainingTypeSlug === t.slug}
                  onPress={() => {
                    set({ trainingTypeSlug: t.slug, own: "" });
                    next();
                  }}
                />
              ))}
            {trainingTypes.some((t) => t.slug === "custom") ? (
              <Cat icon={piIcon("other")} label="Другое" on={form.trainingTypeSlug === "custom"} onPress={() => set({ trainingTypeSlug: "custom" })} />
            ) : null}
          </View>
          {form.trainingTypeSlug === "custom" ? (
            <>
              <Lbl>Выбери из всех — как при регистрации</Lbl>
              <View style={[st.grid, { marginTop: -5 }]}>
                {sports.map(([n, ic]) => (
                  <Cat
                    key={n}
                    icon={ic}
                    label={n}
                    on={form.own === n}
                    onPress={() => {
                      set({ own: n });
                      next();
                    }}
                  />
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}
      {hasCustom ? (
        <View style={{ marginTop: 10 }}>
          <Own
            title="Своё предложение"
            text="Не нашёл подходящего? Придумай сам — от сапов до вязания"
            on={isOwn}
            onPress={() => {
              set({ categorySlug: "custom", trainingTypeSlug: null, own: "" });
              next();
            }}
          />
        </View>
      ) : null}
    </View>
  );
}

/* ---------- 2. Название и обложка ---------- */

export function CoverStep({
  form,
  set,
  covers,
  catLabel,
  presetCover,
  onUpload,
}: {
  form: Form;
  set: SetForm;
  covers: string[];
  catLabel: string;
  presetCover: string | null;
  onUpload: () => void;
}) {
  const business = form.business;
  const isOwn = form.categorySlug === "custom";
  const grid = business ? [] : !isOwn || presetCover ? covers : [];
  const bigUpload = business || grid.length < 2;
  const own = form.ownPhoto?.uri;
  const bigBg = own ?? (bigUpload && !business ? coverUri(grid[0] ?? presetCover) ?? undefined : undefined);
  const selected = form.useOwnPhoto && own ? "own" : form.cover ?? grid[0] ?? null;
  return (
    <View>
      <H1 plain="Название " em="и обложка" />
      <Sub>Короткое название и картинка решают, придут ли люди.</Sub>
      <Lbl>Название</Lbl>
      <View style={[st.field, G]}>
        <TextInput
          value={form.title}
          onChangeText={(title) => set({ title })}
          placeholder={business ? "Например, дегустация вин от сомелье" : "Например, кофе перед работой"}
          placeholderTextColor={K.ink3}
          maxLength={100}
          style={st.input}
        />
      </View>
      <Lbl>Описание</Lbl>
      <View style={[st.field, st.ta, G]}>
        <TextInput
          value={form.description}
          onChangeText={(description) => set({ description })}
          placeholder="Что будем делать, как узнать друг друга"
          placeholderTextColor={K.ink3}
          maxLength={500}
          multiline
          textAlignVertical="top"
          style={[st.input, { minHeight: 72, textAlign: "left" }]}
        />
      </View>
      {business ? (
        <>
          <Lbl>Раздел в афише</Lbl>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
            {[...(form.bizCategory ? BIZ_SECTIONS.filter((c) => c.key === form.bizCategory) : []), ...BIZ_SECTIONS.filter((c) => c.key !== form.bizCategory)].map((c) => (
              <Chip key={c.key} label={c.label} icon={bizCategoryIcon(c)} on={form.bizCategory === c.key} onPress={() => set({ bizCategory: c.key, bizPicked: true })} />
            ))}
          </ScrollView>
          <Cvn>
            {form.bizCategory
              ? form.bizPicked
                ? "Так гости найдут событие в фильтрах афиши и в поиске"
                : "Подобрали по названию — если не то, выбери другой"
              : "Выбери раздел — так гости найдут событие в фильтрах афиши"}
          </Cvn>
        </>
      ) : null}
      <Lbl>Обложка</Lbl>
      <Text style={[kf("400", 12.5, { color: K.ink2 }), { marginTop: -2, marginHorizontal: 2 }]}>
        {business
          ? "Загрузи своё фото — афишу, зал или сцену. Вертикально, 3:4"
          : isOwn && !presetCover
            ? `Под «${form.own.trim() || form.title.trim() || "твою встречу"}» готовой обложки нет — загрузи своё фото`
            : grid.length > 1
              ? `Обложки для «${catLabel}» · выбери одну или загрузи своё фото`
              : "Обложку подобрал Мося · или загрузи своё фото"}
      </Text>
      {bigUpload ? (
        <Press onPress={onUpload} photo={!!bigBg} style={[st.bizph, !bigBg && G]}>
          {bigBg ? (
            <>
              <Image source={{ uri: bigBg }} style={StyleSheet.absoluteFill} contentFit="cover" />
              <View style={st.bizphChip}>
                <KI n="cam" size={16} color="#fff" />
                <Text style={kf("500", 13, { color: "#fff" })}>{own ? "Заменить фото" : "Загрузить своё фото"}</Text>
              </View>
            </>
          ) : (
            <View style={{ alignItems: "center", gap: 6 }}>
              <View style={st.op}>
                <KI n="cam" size={20} color="#fff" />
              </View>
              <Text style={[kf("500", 16), { marginTop: 4 }]}>{business ? "Загрузить фото события" : "Загрузить фото"}</Text>
              <Text style={kf("400", 12.5, { color: K.ink2 })}>{business ? "Афиша, зал или сцена · вертикально, 3:4" : "Вертикально, 3:4 — так встречу заметят"}</Text>
            </View>
          )}
        </Press>
      ) : (
        <View style={[st.grid, { marginTop: 4 }]}>
          {grid.map((c, i) => {
            const on = selected === c;
            return (
              <View key={c} style={{ width: "25%", padding: 4 }}>
                <Press photo onPress={() => set({ cover: c, useOwnPhoto: false })} style={[st.cv, on && st.cvOn]} accessibilityLabel={`Обложка ${i + 1}`}>
                  <Image source={{ uri: coverUri(c) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                </Press>
              </View>
            );
          })}
          {own ? (
            <View style={{ width: "25%", padding: 4 }}>
              <Press photo onPress={() => set({ useOwnPhoto: true })} style={[st.cv, selected === "own" && st.cvOn]} accessibilityLabel="Своё фото">
                <Image source={{ uri: own }} style={StyleSheet.absoluteFill} contentFit="cover" />
              </Press>
            </View>
          ) : null}
          <View style={{ width: "25%", padding: 4 }}>
            <Press onPress={onUpload} style={[st.cv, { backgroundColor: "rgba(23,20,31,0.05)", alignItems: "center", justifyContent: "center", gap: 2 }]}>
              <Text style={kf("300", 26, { color: K.ink2 })}>+</Text>
              <Text style={kf("500", 10.5, { color: K.ink2 })}>Своё фото</Text>
            </Press>
          </View>
        </View>
      )}
    </View>
  );
}

/* ---------- 3. Когда и где ---------- */

export const N_DAYS = 120;
const WD = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const pad2 = (n: number) => String(n).padStart(2, "0");
export const HOURS = Array.from({ length: 24 }, (_, h) => String(h));
export const MINS = Array.from({ length: 12 }, (_, m) => pad2(m * 5));
export const DUR_WHEEL: [number, string][] = Array.from({ length: 23 }, (_, i) => {
  const m = 60 + i * 30;
  return [m, `${Math.floor(m / 60)}${m % 60 ? ",5" : ""} ч`];
});
export const durIndex = (m: number) => {
  let best = 0;
  DUR_WHEEL.forEach(([v], i) => {
    if (Math.abs(v - m) < Math.abs(DUR_WHEEL[best]![0] - m)) best = i;
  });
  return best;
};
export function dayDate(i: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + i);
  return d;
}
export const isoOfDay = (i: number) => {
  const d = dayDate(i);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};
export function dayIndexOf(iso: string) {
  const [y = 1970, m = 1, d = 1] = iso.split("-").map(Number);
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  return Math.max(0, Math.min(N_DAYS - 1, Math.round((new Date(y, m - 1, d).getTime() - t.getTime()) / 864e5)));
}

export function WhenStep({ form, set, catLabel, city, onCalendar, flash }: { form: Form; set: SetForm; catLabel: string; city: string | null; onCalendar: () => void; flash: (t: string) => void }) {
  const di = dayIndexOf(form.dayIso);
  const hh = Math.floor(form.startMin / 60) % 24;
  const mi = Math.round((form.startMin % 60) / 5) % 12;
  const formRef = useRef(form);
  formRef.current = form;
  const [query, setQuery] = useState("");
  const [recs, setRecs] = useState<PlaceSuggestion[]>([]);
  const [drop, setDrop] = useState<PlaceSuggestion[]>([]);
  const [addrDrop, setAddrDrop] = useState<AddressSuggestion[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    const p = qs({ category: form.categorySlug, type: form.trainingTypeSlug });
    api<{ items?: PlaceSuggestion[] }>(`/api/places?${p}`)
      .then((d) => setRecs(Array.isArray(d.items) ? d.items.slice(0, 10) : []))
      .catch(() => setRecs([]));
  }, [form.categorySlug, form.trainingTypeSlug]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setDrop([]);
      setAddrDrop([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const t = setTimeout(() => {
      const a = api<{ items?: PlaceSuggestion[] }>(`/api/places?${qs({ q, category: form.categorySlug })}`)
        .then((d) => !cancelled && setDrop(Array.isArray(d.items) ? d.items.slice(0, 4) : []))
        .catch(() => !cancelled && setDrop([]));
      const b =
        q.length >= 3
          ? api<{ suggestions?: AddressSuggestion[] }>(`/api/geocode?${qs({ query: q, city })}`)
              .then((d) => !cancelled && setAddrDrop((d.suggestions ?? []).slice(0, 3)))
              .catch(() => !cancelled && setAddrDrop([]))
          : Promise.resolve();
      Promise.all([a, b]).finally(() => !cancelled && setSearching(false));
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
  }

  const tiles = useMemo(() => [0, 1, 2, 3, 4, 5, 6, ...(di > 6 ? [di] : [])], [di]);
  const durItems = useMemo(() => DUR_WHEEL.map(([, t]) => t), []);
  const srcLabel = (src?: string) => (src === "yandex" ? "Яндекс" : src === "osm" ? "Карты" : "");
  const coords = form.latitude !== undefined && form.longitude !== undefined ? { latitude: form.latitude, longitude: form.longitude } : null;

  return (
    <View>
      <H1 plain="Когда " em="и где" after="?" />
      <Sub>Выбери день и время — дальше место.</Sub>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 0 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
        {tiles.map((i) => {
          const d = dayDate(i);
          const on = di === i;
          return (
            <Press key={i} haptic dark={on} onPress={() => set({ dayIso: isoOfDay(i) })} style={[st.dp, on ? st.on : G]}>
              <Text style={kf("400", 11, { color: on ? "rgba(255,255,255,0.7)" : K.ink2 })}>{i === 0 ? "Сегодня" : WD[d.getDay()]}</Text>
              <Text style={kf("500", 18, { color: on ? "#fff" : K.ink })}>{d.getDate()}</Text>
            </Press>
          );
        })}
      </ScrollView>
      <Press onPress={onCalendar} style={[st.calb, G]}>
        <KI n="cal" size={18} />
        <Text style={kf("500", 14)}>Выбрать в календаре</Text>
      </Press>
      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Lbl>Начало</Lbl>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
            <View style={{ flex: 1 }}>
              <KWheel items={HOURS} index={hh} onChange={(h) => set({ startMin: h * 60 + (formRef.current.startMin % 60) })} />
            </View>
            <Text style={kf("500", 20)}>:</Text>
            <View style={{ flex: 1 }}>
              <KWheel items={MINS} index={mi} onChange={(m) => set({ startMin: Math.floor(formRef.current.startMin / 60) * 60 + m * 5 })} />
            </View>
          </View>
        </View>
        <View style={{ flex: 1 }}>
          <Lbl>Сколько продлится</Lbl>
          <KWheel wide items={durItems} index={durIndex(form.duration)} onChange={(i) => set({ duration: DUR_WHEEL[i]![0] })} />
        </View>
      </View>

      <Lbl>Место</Lbl>
      {recs.length > 0 ? (
        <>
          <View style={{ gap: 6 }}>
            {recs.slice(0, 3).map((p) => {
              const on = form.placeName === p.name && form.latitude === p.latitude;
              return (
                <Press key={p.name + p.address} haptic dark={on} onPress={() => pickPlace(p)} style={[st.rp, on ? st.on : G]}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={kf("500", 14, { color: on ? "#fff" : K.ink })} numberOfLines={1}>{p.name}</Text>
                    <Text style={[kf("400", 12.5, { color: on ? "rgba(255,255,255,0.7)" : K.ink2 }), { marginTop: 2 }]} numberOfLines={1}>{p.address || "отметим на карте"}</Text>
                  </View>
                  {p.rating ? (
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={kf("600", 13, { color: on ? "#fff" : K.ink })}>★ {p.rating.toFixed(1).replace(".", ",")}</Text>
                      {srcLabel(p.source) ? <Text style={kf("400", 10.5, { color: on ? "rgba(255,255,255,0.6)" : K.ink3 })}>{srcLabel(p.source)}</Text> : null}
                    </View>
                  ) : null}
                </Press>
              );
            })}
          </View>
          <Text style={[kf("400", 12, { color: K.ink3 }), { marginTop: 6, marginHorizontal: 4 }]}>Лучшие по рейтингу для «{catLabel}» · или найди своё</Text>
        </>
      ) : null}
      <View style={[st.field, G, { marginTop: 8, flexDirection: "row", alignItems: "center", gap: 10 }]}>
        <KI n="search" size={20} color={K.ink3} />
        <TextInput value={query} onChangeText={setQuery} placeholder="Название места или адрес" placeholderTextColor={K.ink3} autoCorrect={false} style={[st.input, { flex: 1 }]} />
      </View>
      {query.trim().length >= 2 ? (
        <View style={[st.sugg, G]}>
          {drop.map((p) => (
            <Press key={"p" + p.name + p.address} onPress={() => pickPlace(p)} style={st.suggRow}>
              <Text style={kf("500", 14)} numberOfLines={1}>{p.name}</Text>
              <Text style={kf("400", 12.5, { color: K.ink2 })} numberOfLines={1}>{p.address}</Text>
            </Press>
          ))}
          {addrDrop.map((a) => (
            <Press key={"a" + a.address} onPress={() => pickPlace({ name: query.trim(), address: a.address, latitude: a.latitude, longitude: a.longitude })} style={st.suggRow}>
              <Text style={kf("500", 14)} numberOfLines={1}>{a.address.split(",")[0]}</Text>
              <Text style={kf("400", 12.5, { color: K.ink2 })} numberOfLines={1}>{a.address}</Text>
            </Press>
          ))}
          {drop.length === 0 && addrDrop.length === 0 ? (
            <Text style={[kf("400", 12.5, { color: K.ink2 }), { padding: 12 }]}>{searching ? "Ищем…" : "Ищем… или нажми на карту — адрес определится сам"}</Text>
          ) : null}
        </View>
      ) : null}
      <PlacePicker
        value={coords}
        onPick={({ latitude, longitude }) => set({ latitude, longitude, placeName: "Точка на карте", address: "" })}
        onAddress={(resolved) => {
          const short = resolved.split(",").map((x) => x.trim()).filter((x) => x && !/^(Россия|Тюмень|Тюменская область)$/i.test(x)).slice(0, 2).join(", ");
          const n = formRef.current.placeName;
          set({ address: resolved, placeName: !n || n === "Точка на карте" ? short || "Точка на карте" : n });
        }}
        placeName={form.placeName}
        address={form.address}
      />
      <View style={[st.addr, G]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={kf("500", 14)} numberOfLines={2}>{form.placeName || "Отметь точку на карте"}</Text>
          <Text style={[kf("400", 12.5, { color: K.ink2 }), { marginTop: 2 }]} numberOfLines={2}>{form.address || "или выбери из подсказок"}</Text>
        </View>
        {form.address ? (
          <Press
            onPress={() => {
              Clipboard.setStringAsync(form.address).then(() => flash("Адрес скопирован")).catch(() => {});
            }}
            style={[st.rb, G]}
            accessibilityLabel="Скопировать адрес"
          >
            <KI n="copy" size={16} />
          </Press>
        ) : null}
      </View>
    </View>
  );
}

/* ---------- 4. Кто и сколько ---------- */

export function WhoStep({
  form,
  set,
  minSeats,
  seatsCap,
  planName,
  planMax,
  isEdit,
  skipKind,
  coverUri: cover,
  catLabel,
  dayShort,
  flash,
  onPlans,
}: {
  form: Form;
  set: SetForm;
  minSeats: number;
  seatsCap: number;
  planName: string;
  planMax: number;
  isEdit: boolean;
  skipKind: boolean;
  coverUri: string | null;
  catLabel: string;
  dayShort: string;
  flash: (t: string) => void;
  onPlans: () => void;
}) {
  const business = form.business;
  const [draft, setDraft] = useState<string | null>(null);
  const seats = form.seatsTotal;
  const costLabel = business
    ? form.bizPricing === "ticket"
      ? form.ticketPrice
        ? `${form.ticketPrice} ₽`
        : "Билет"
      : form.bizPricing === "free"
        ? "Бесплатно"
        : "Свои условия"
    : COSTS.find(([v]) => v === form.costType)?.[1] ?? "";
  const hh = Math.floor(form.startMin / 60) % 24;
  const mm = pad2(form.startMin % 60);
  return (
    <View>
      <H1 plain="Кто " em="и сколько" after="?" />
      <Sub>Все приходят по заявке — ты сам решаешь, кого принять.</Sub>
      <Lbl>Сколько человек ищешь</Lbl>
      <View style={[st.bigst, G]}>
        <Press
          onPress={() => {
            if (seats <= minSeats && isEdit) flash(`Меньше ${minSeats} нельзя — уже подтверждены`);
            set({ seatsTotal: Math.max(minSeats, seats - 1) });
          }}
          style={[st.bigRb, G]}
          accessibilityLabel="Меньше"
        >
          <Text style={kf("300", 26)}>–</Text>
        </Press>
        <TextInput
          value={draft ?? String(seats)}
          keyboardType="number-pad"
          selectTextOnFocus
          onChangeText={(t) => {
            const raw = t.replace(/[^\d]/g, "").slice(0, 3);
            setDraft(raw);
            const v = Number(raw);
            if (raw && v > seatsCap) flash(`На твоём тарифе — максимум ${seatsCap}`);
            if (raw && v >= minSeats) set({ seatsTotal: Math.min(seatsCap, v) });
          }}
          onBlur={() => {
            const v = Number(draft ?? seats);
            set({ seatsTotal: Math.max(minSeats, Math.min(seatsCap, Number.isFinite(v) && v > 0 ? v : minSeats)) });
            setDraft(null);
          }}
          style={[kf("300", 56, { ls: -0.03 }), { flex: 1, textAlign: "center", padding: 0 }]}
          accessibilityLabel="Количество человек"
        />
        <Press
          onPress={() => {
            if (seats >= seatsCap) flash(`На твоём тарифе — максимум ${seatsCap}`);
            set({ seatsTotal: Math.min(seatsCap, seats + 1) });
          }}
          style={[st.bigRb, G]}
          accessibilityLabel="Больше"
        >
          <Text style={kf("300", 26)}>+</Text>
        </Press>
      </View>
      <Text style={[kf("400", 14, { lh: 1.5, color: K.ink2 }), { marginTop: 6, textAlign: "center" }]}>
        {business ? (seats > 20 ? "Больше 20 гостей — общий чат не создаётся, только заявки" : `Гостей на событии: ${seats}`) : `Не считая тебя · на встрече будет ${seats + 1} чел.`}
      </Text>
      <Press onPress={onPlans} style={[st.plan, G]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={kf("500", 14)}>
            Подписка {planName} · {business ? "гостей" : "группа"} до {planMax}
          </Text>
          <Text style={[kf("400", 12.5, { color: K.ink2 }), { marginTop: 2 }]}>{business ? "Медиум — до 100, Премиум — без ограничений" : "Медиум — до 10, Премиум — до 30 человек"}</Text>
        </View>
        <View style={[st.chip, G, { height: 30, paddingHorizontal: 12 }]}>
          <Text style={kf("500", 12)}>Тарифы</Text>
        </View>
      </Press>
      <Lbl>{business ? "Стоимость" : "Как насчёт расходов?"}</Lbl>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20 }} contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}>
        {business
          ? BIZ_PRICING.map(([v, t]) => <Chip key={v} label={t} on={form.bizPricing === v} onPress={() => set({ bizPricing: v })} />)
          : COSTS.map(([v, t]) => <Chip key={v} label={t} on={form.costType === v} onPress={() => set({ costType: v })} />)}
      </ScrollView>
      {business && form.bizPricing === "ticket" ? (
        <>
          <View style={[st.field, G, { marginTop: 8, flexDirection: "row", alignItems: "center" }]}>
            <TextInput
              value={form.ticketPrice}
              onChangeText={(t) => set({ ticketPrice: t.replace(/[^\d]/g, "").slice(0, 6) })}
              placeholder="Цена билета, например 800"
              placeholderTextColor={K.ink3}
              keyboardType="number-pad"
              style={[st.input, { flex: 1 }]}
            />
            <Text style={kf("400", 14, { color: K.ink3 })}>₽</Text>
          </View>
          <Text style={[kf("400", 14, { lh: 1.5, color: K.ink2 }), { marginTop: 6 }]}>Гости платят тебе лично — на месте или переводом. После одобрения заявки гость получит номер билета.</Text>
        </>
      ) : null}
      {business && form.bizPricing === "custom" ? (
        <View style={[st.field, st.ta, G, { marginTop: 8 }]}>
          <TextInput value={form.bizTerms} onChangeText={(bizTerms) => set({ bizTerms })} placeholder="Например: депозит 1000 ₽ на баре" placeholderTextColor={K.ink3} multiline maxLength={300} textAlignVertical="top" style={[st.input, { minHeight: 48, textAlign: "left" }]} />
        </View>
      ) : null}
      {!business && skipKind ? (
        <>
          <Lbl>Настройки встречи</Lbl>
          <Press onPress={() => set({ isAnonymous: !form.isAnonymous })} style={[st.tg2, G]}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={kf("500", 14.5)}>Анонимная встреча</Text>
              <Text style={[kf("400", 12.5, { color: K.ink2 }), { marginTop: 2 }]}>Имя, фото и адрес — только тем, кого примешь</Text>
            </View>
            <View style={[st.sw, form.isAnonymous && { backgroundColor: K.ink }]}>
              <View style={[st.swDot, form.isAnonymous && { transform: [{ translateX: 20 }] }]} />
            </View>
          </Press>
        </>
      ) : null}
      <Lbl>Так увидят другие</Lbl>
      <View style={st.prev}>
        {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <LinearGradient colors={["#3A3646", "#17141F"]} style={StyleSheet.absoluteFill} />}
        <LinearGradient colors={["rgba(0,0,0,0)", "rgba(12,8,24,0.8)"]} locations={[0.4, 1]} style={StyleSheet.absoluteFill} />
        <View style={st.prevChip}>
          <Text style={kf("500", 12, { color: "#fff" })}>
            0 из {seats} · {catLabel.toLowerCase()}
          </Text>
        </View>
        <View style={{ position: "absolute", left: 18, right: 18, bottom: 18 }}>
          <Text style={kf("300", 30, { lh: 1.1, ls: -0.03, color: "#fff" })} numberOfLines={3}>
            {form.title || form.own || "Моя встреча"}
          </Text>
          <Text style={[kf("400", 13, { color: "rgba(255,255,255,0.85)" }), { marginTop: 6 }]} numberOfLines={2}>
            {dayShort}, {hh}:{mm} · {form.isAnonymous && !business ? "место после одобрения" : form.placeName || "место"} · {costLabel}
          </Text>
        </View>
      </View>
      <Text style={[kf("400", 14, { lh: 1.5, color: K.ink2 }), { marginTop: 8 }]}>{form.isAnonymous && !business ? "На карте — Мося вместо фото, точный адрес скрыт" : "На карте — твоё фото на метке"}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  on: { backgroundColor: K.ink, borderWidth: 1, borderColor: K.ink },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -5, marginTop: 6 },
  cat: { height: 86, borderRadius: 24, alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 4 },
  own: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 16, borderRadius: 24 },
  opt3: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 24 },
  op: { width: 40, height: 40, borderRadius: 20, backgroundColor: K.ink, alignItems: "center", justifyContent: "center" },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, height: 36, paddingHorizontal: 14, borderRadius: 18 },
  field: { minHeight: 54, borderRadius: 27, paddingHorizontal: 18, justifyContent: "center" },
  ta: { borderRadius: 24, paddingVertical: 14, justifyContent: "flex-start" },
  input: { fontFamily: "Inter-Regular", fontSize: 16, color: K.ink, paddingVertical: 0 },
  bizph: { marginTop: 10, height: 300, borderRadius: 28, overflow: "hidden", alignItems: "center", justifyContent: "center" },
  bizphChip: { position: "absolute", left: 14, bottom: 14, flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 12, borderRadius: 17, backgroundColor: "rgba(23,20,31,0.55)" },
  cv: { aspectRatio: 3 / 4, borderRadius: 16, overflow: "hidden", backgroundColor: "#2B2737" },
  cvOn: { borderWidth: 2.5, borderColor: K.ink },
  dp: { width: 58, height: 64, borderRadius: 20, alignItems: "center", justifyContent: "center", gap: 2 },
  calb: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, height: 46, borderRadius: 23, marginTop: 8 },
  rp: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, paddingLeft: 16, paddingRight: 14, borderRadius: 20 },
  sugg: { marginTop: 6, borderRadius: 22, padding: 6 },
  suggRow: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16 },
  addr: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8, paddingVertical: 10, paddingLeft: 16, paddingRight: 8, borderRadius: 24 },
  rb: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  bigst: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 10, borderRadius: 32 },
  bigRb: { width: 56, height: 56, borderRadius: 28, alignItems: "center", justifyContent: "center" },
  plan: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 10, paddingVertical: 12, paddingLeft: 16, paddingRight: 10, borderRadius: 24 },
  tg2: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 58, borderRadius: 29, paddingLeft: 18, paddingRight: 8, paddingVertical: 8 },
  sw: { width: 52, height: 32, borderRadius: 16, backgroundColor: "rgba(23,20,31,0.15)", padding: 3 },
  swDot: { width: 26, height: 26, borderRadius: 13, backgroundColor: "#fff" },
  prev: { height: 440, borderRadius: 32, overflow: "hidden", marginTop: 4, backgroundColor: "#2B2737" },
  prevChip: { position: "absolute", top: 14, left: 14, height: 30, paddingHorizontal: 12, borderRadius: 15, justifyContent: "center", backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.45)" },
});
