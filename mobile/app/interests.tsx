import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { Aurora, Btn, RoundBtn, Title } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { tapLight, tapOk, tapWarn } from "@/lib/feedback";
import { groupInterests, interestIcon } from "@/lib/interests";
import { colors, FONT } from "@/lib/theme";
import type { MyProfile } from "@/lib/types";

interface Interest {
  id: string;
  name: string;
}

const MIN = 3;
const MAX = 15;

/** «Что тебе по душе?» — выбор интересов (3–15). */
export default function InterestsScreen() {
  const insets = useSafeAreaInsets();
  const [all, setAll] = useState<Interest[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api<{ interests: Interest[] }>("/api/interests", { auth: false }), api<MyProfile>("/api/me/profile")])
      .then(([list, me]) => {
        setAll(list.interests ?? []);
        setPicked(new Set((me.interests ?? []).map((i) => i.id)));
      })
      .catch(() => setAll([]));
  }, []);

  const groups = useMemo(() => groupInterests(all ?? []), [all]);

  function toggle(id: string) {
    if (!picked.has(id) && picked.size >= MAX) {
      tapWarn();
      return;
    }
    tapLight();
    const next = new Set(picked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicked(next);
  }

  async function save() {
    setSaving(true);
    try {
      await api("/api/me/profile", { method: "PATCH", body: { interestIds: [...picked] } });
      tapOk();
      router.back();
    } catch {
      tapWarn();
      Alert.alert("Не получилось сохранить", "Попробуй ещё раз");
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: insets.bottom + 120, gap: 14 }}>
        <RoundBtn onPress={() => router.back()}>
          <Icon name="back" />
        </RoundBtn>
        <Title plain="Что тебе " em="по душе?" size={30} style={{ marginLeft: 4 }} />
        <Text style={styles.sub}>Выбери хотя бы три. По ним подберём встречи и людей с похожими интересами.</Text>
        {all === null ? <ActivityIndicator color={colors.violet} style={{ marginTop: 30 }} /> : null}
        {groups.map((g) => (
          <View key={g.title} style={{ gap: 10 }}>
            <Text style={styles.group}>{g.title}</Text>
            <View style={styles.wrap}>
              {g.items.map((i) => {
                const on = picked.has(i.id);
                return (
                  <Pressable key={i.id} onPress={() => toggle(i.id)} style={({ pressed }) => [styles.chip, on && styles.chipOn, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
                    <Image source={{ uri: interestIcon(i.name) }} style={{ width: 26, height: 26 }} contentFit="contain" />
                    <Text style={[styles.chipText, on && { color: "#fff" }]}>{i.name}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
        <Text style={styles.count}>{picked.size < MIN ? `Выбрано ${picked.size} из ${MIN}` : `Выбрано: ${picked.size}`}</Text>
        <Btn title="Сохранить" onPress={save} loading={saving} disabled={picked.size < MIN} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sub: { fontFamily: FONT, fontSize: 14.5, lineHeight: 20, color: colors.grey, marginLeft: 4 },
  group: { fontFamily: FONT, fontSize: 17, fontWeight: "500", color: colors.ink, marginLeft: 4 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.85)", borderRadius: 999, paddingLeft: 6, paddingRight: 14, paddingVertical: 6, borderWidth: 1, borderColor: "rgba(108,59,255,0.12)" },
  chipOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  chipText: { fontFamily: FONT, fontSize: 14.5, color: colors.ink },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 20, paddingTop: 10, gap: 8, backgroundColor: "rgba(246,242,255,0.94)" },
  count: { fontFamily: FONT, fontSize: 13.5, color: colors.grey, textAlign: "center" },
});
