import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, Pressable, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Btn, Glass, Mosya, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { InviteSheet } from "@/components/people/InviteSheet";
import { ReportSheet } from "@/components/people/ReportSheet";
import { api } from "@/lib/api";
import { getMyId } from "@/lib/me";
import { tapLight, tapWarn } from "@/lib/feedback";
import { plural } from "@/lib/format";
import { distanceLabel, interestIcon } from "@/lib/interests";
import { colors, FONT, f } from "@/lib/theme";

/** Ответ GET /api/users/[id] (app/api/users/[id]/route.ts). */
export interface Person {
  id: string;
  name: string;
  avatarUrl: string | null;
  photos: string[];
  canMessage: boolean;
  age: number;
  gender: "male" | "female";
  bio: string | null;
  ratingAvg: number;
  completedMeetingsCount: number;
  distanceKm: number | null;
  interests: string[];
  commonInterests: string[];
}

/** То, что уже известно из ленты/колоды — показываем сразу, пока грузится полный профиль. */
export interface PersonPreview {
  id: string;
  name: string;
  age: number;
  avatarUrl: string | null;
}

const NO_MEET = "Пока написать нельзя — у вас ещё не было общей встречи. Позови на свою встречу или создай новую 😉";
const { height: SCREEN_H } = Dimensions.get("window");
const PHOTO_H = Math.round(SCREEN_H * 0.62);

/**
 * Профиль человека (components/people/PersonView.tsx в мини-приложении):
 * фото на весь экран с листанием, «О себе», общие интересы,
 * «Написать», «Позвать на встречу», жалоба и блокировка.
 */
export function PersonView({
  id,
  preview,
  self,
  active = true,
  onBack,
  onGone,
}: {
  id: string;
  preview?: PersonPreview;
  /** «Как меня видят» — без кнопок действий. */
  self?: boolean;
  /** В колоде грузим только видимую карточку и соседние. */
  active?: boolean;
  onBack: () => void;
  /** Человека заблокировали — колода убирает карточку. */
  onGone?: (id: string) => void;
}) {
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [invite, setInvite] = useState(false);
  const [report, setReport] = useState(false);
  const [writing, setWriting] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [isMe, setIsMe] = useState(!!self);

  useEffect(() => {
    if (!self) getMyId().then((my) => setIsMe(my === id));
  }, [self, id]);

  const load = useCallback(() => {
    api<Person>(`/api/users/${id}`)
      .then((r) => {
        setP(r);
        setError(null);
      })
      .catch(() => setError("Профиль недоступен"));
  }, [id]);

  useEffect(() => {
    if (active && !p) load();
  }, [active, p, load]);

  const photos = p ? (p.photos.length ? p.photos : p.avatarUrl ? [p.avatarUrl] : []) : preview?.avatarUrl ? [preview.avatarUrl] : [];
  const name = p?.name ?? preview?.name ?? "";
  const age = p?.age ?? preview?.age;

  function flip(dir: 1 | -1) {
    if (photos.length < 2) return;
    tapLight();
    setPhoto((i) => Math.min(photos.length - 1, Math.max(0, i + dir)));
  }

  async function write() {
    if (!p) return;
    if (!p.canMessage) {
      tapWarn();
      Alert.alert("Сначала встреча", NO_MEET);
      return;
    }
    setWriting(true);
    try {
      const r = await api<{ conversationId: string }>("/api/conversations/direct", { body: { userId: p.id } });
      router.push(`/chat/${r.conversationId}` as Href);
    } catch (e) {
      Alert.alert("Не получилось", (e as { code?: string }).code === "no_shared_event" ? NO_MEET : "Попробуй ещё раз");
    } finally {
      setWriting(false);
    }
  }

  // Фото слегка увеличивается при оттягивании вниз и уезжает медленнее текста — «параллакс».
  const photoScale = scrollY.interpolate({ inputRange: [-200, 0], outputRange: [1.4, 1], extrapolateRight: "clamp" });
  const photoShift = scrollY.interpolate({ inputRange: [0, PHOTO_H], outputRange: [0, PHOTO_H * 0.45], extrapolateLeft: "clamp" });

  const common = p?.commonInterests ?? [];
  const other = (p?.interests ?? []).filter((i) => !common.includes(i));
  const dist = distanceLabel(p?.distanceKm);

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        contentContainerStyle={{ paddingBottom: insets.bottom + (isMe ? 40 : 120) }}
      >
        <Animated.View style={[styles.photoBox, { transform: [{ translateY: photoShift }, { scale: photoScale }] }]}>
          {photos.length ? (
            <Image source={{ uri: photos[photo] ?? photos[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" />
          ) : (
            <LinearGradient colors={["#6C3BFF", "#A24DFF", "#FF6FA0"]} style={[StyleSheet.absoluteFill, styles.noPhoto]}>
              <Mosya pose="wave" size={170} />
            </LinearGradient>
          )}
          <LinearGradient colors={["rgba(20,8,50,0.45)", "rgba(0,0,0,0)", "rgba(0,0,0,0)", "rgba(20,8,50,0.75)"]} locations={[0, 0.25, 0.55, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.zones}>
            <Pressable style={{ flex: 1 }} onPress={() => flip(-1)} />
            <Pressable style={{ flex: 1 }} onPress={() => flip(1)} />
          </View>
        </Animated.View>

        <View style={[styles.overlay, { marginTop: -150 }]} pointerEvents="none">
          <Text style={styles.name} numberOfLines={2}>
            {name}
            {age ? `, ${age}` : ""}
          </Text>
          {p ? (
            <View style={styles.pills}>
              {dist ? <Tag icon="pin" text={dist} /> : null}
              {p.ratingAvg > 0 ? <Tag icon="star" text={p.ratingAvg.toFixed(1).replace(".", ",")} /> : null}
              <Tag icon="people" text={`${p.completedMeetingsCount} ${plural(p.completedMeetingsCount, "встреча", "встречи", "встреч")}`} />
              {common.length ? <Tag icon="heart" text={`${common.length} ${plural(common.length, "общий интерес", "общих интереса", "общих интересов")}`} /> : null}
            </View>
          ) : null}
        </View>

        <View style={styles.body}>
          {!p ? (
            error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color={colors.violet} style={{ marginTop: 30 }} />
          ) : (
            <>
              <Glass strong style={styles.card}>
                <Text style={styles.cardTitle}>О себе</Text>
                <Text style={[styles.bio, !p.bio && { color: colors.grey }]}>{p.bio?.trim() || "Пока без описания"}</Text>
              </Glass>
              {common.length ? (
                <Glass strong style={styles.card}>
                  <View style={styles.cardHead}>
                    <Text style={styles.cardTitle}>Общие интересы</Text>
                    <Text style={styles.muted}>
                      {common.length} из {p.interests.length}
                    </Text>
                  </View>
                  <Chips items={common} accent />
                </Glass>
              ) : null}
              {other.length ? (
                <Glass strong style={styles.card}>
                  <Text style={styles.cardTitle}>{common.length ? "Ещё интересы" : "Интересы"}</Text>
                  <Chips items={other} />
                </Glass>
              ) : null}
              {!isMe ? (
                <Pressable onPress={() => setReport(true)} style={styles.reportLink} hitSlop={6}>
                  <Icon name="flag" size={16} color={colors.grey} />
                  <Text style={styles.reportText}>Пожаловаться или заблокировать</Text>
                </Pressable>
              ) : null}
            </>
          )}
        </View>
      </Animated.ScrollView>

      {/* Шапка поверх фото: назад, полоски фото, флажок. */}
      <View style={[styles.top, { top: insets.top + 6 }]} pointerEvents="box-none">
        {photos.length > 1 ? (
          <View style={styles.bars} pointerEvents="none">
            {photos.map((_, i) => (
              <View key={i} style={[styles.bar, i === photo && styles.barOn]} />
            ))}
          </View>
        ) : null}
        <View style={styles.topRow} pointerEvents="box-none">
          <RoundBtn onPress={onBack}>
            <Icon name="back" />
          </RoundBtn>
          {!isMe && p ? (
            <RoundBtn onPress={() => setReport(true)}>
              <Icon name="flag" />
            </RoundBtn>
          ) : null}
        </View>
      </View>

      {!isMe && p ? (
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 14) }]}>
          <Pressable onPress={write} disabled={writing} style={({ pressed }) => [styles.chatBtn, !p.canMessage && { opacity: 0.45 }, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}>
            {writing ? <ActivityIndicator color={colors.ink} /> : <Icon name="chat" size={22} color={colors.ink} />}
          </Pressable>
          <Btn title="Позвать на встречу" icon={<Icon name="plus" size={20} color="#fff" />} style={{ flex: 1 }} onPress={() => setInvite(true)} />
        </View>
      ) : null}

      {p ? (
        <>
          <InviteSheet visible={invite} person={p} onClose={() => setInvite(false)} />
          <ReportSheet
            visible={report}
            person={p}
            onClose={() => setReport(false)}
            onBlocked={() => {
              setReport(false);
              if (onGone) onGone(p.id);
              else onBack();
            }}
          />
        </>
      ) : null}
    </View>
  );
}

function Tag({ icon, text }: { icon: "pin" | "star" | "people" | "heart"; text: string }) {
  return (
    <View style={styles.tag}>
      <Icon name={icon} size={13} color="#fff" />
      <Text style={styles.tagText}>{text}</Text>
    </View>
  );
}

function Chips({ items, accent }: { items: string[]; accent?: boolean }) {
  return (
    <View style={styles.chips}>
      {items.map((i) => (
        <View key={i} style={[styles.chip, accent && styles.chipAccent]}>
          <Image source={{ uri: interestIcon(i) }} style={{ width: 22, height: 22 }} contentFit="contain" />
          <Text style={[styles.chipText, accent && { color: colors.violet }]}>{i}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  photoBox: { height: PHOTO_H, backgroundColor: colors.violet, overflow: "hidden" },
  noPhoto: { alignItems: "center", justifyContent: "center" },
  zones: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
  overlay: { height: 150, justifyContent: "flex-end", paddingHorizontal: 20, paddingBottom: 22, gap: 10 },
  name: { fontSize: 32, lineHeight: 36, ...f("500"), color: "#fff", letterSpacing: -0.8 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  tag: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.22)", borderColor: "rgba(255,255,255,0.35)", borderWidth: 1, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  tagText: { fontSize: 13, color: "#fff", ...f("500") },
  body: { padding: 16, gap: 12, marginTop: -6, backgroundColor: colors.milk, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  card: { borderRadius: 24, padding: 16, gap: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 17, ...f("500"), color: colors.ink, letterSpacing: -0.3 },
  bio: { fontFamily: FONT, fontSize: 15.5, lineHeight: 22, color: colors.ink2 },
  muted: { fontFamily: FONT, fontSize: 13.5, color: colors.grey },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#fff", borderRadius: 999, paddingLeft: 6, paddingRight: 12, paddingVertical: 5 },
  chipAccent: { backgroundColor: "#EFE8FF" },
  chipText: { fontFamily: FONT, fontSize: 14, color: colors.ink },
  reportLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  reportText: { fontFamily: FONT, fontSize: 14, color: colors.grey },
  top: { position: "absolute", left: 14, right: 14, gap: 10 },
  bars: { flexDirection: "row", gap: 4, paddingHorizontal: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" },
  barOn: { backgroundColor: "#fff" },
  topRow: { flexDirection: "row", justifyContent: "space-between" },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "rgba(246,242,255,0.94)" },
  chatBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(108,59,255,0.15)" },
});
