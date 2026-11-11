import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Animated, Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Glass, Mosya, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { InviteSheet } from "@/components/people/InviteSheet";
import { ReportSheet } from "@/components/people/ReportSheet";
import { api } from "@/lib/api";
import { getMyId } from "@/lib/me";
import { tapLight, tapWarn } from "@/lib/feedback";
import { plural } from "@/lib/format";
import { distanceLabel, interestIcon } from "@/lib/interests";
import { colors, FONT, SERIF, f } from "@/lib/theme";

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
// «screen», а не «window»: на Android окно не включает панель навигации — внизу оставалась светлая полоса.
const { height: SCREEN_H } = Dimensions.get("screen");
// Как в мини-приложении: фото на весь экран, имя внизу поверх, панель «♡ 🔔 Позвать на встречу».
const PHOTO_H = SCREEN_H;
const OVERLAY_H = 230;

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
  topAction,
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
  /** Доп. кнопка в шапке рядом с флажком (в колоде — «Фильтры»). */
  topAction?: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const [p, setP] = useState<Person | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [photo, setPhoto] = useState(0);
  const [invite, setInvite] = useState(false);
  const [report, setReport] = useState(false);
  const [writing, setWriting] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);
  const [liked, setLiked] = useState(false);
  const [following, setFollowing] = useState(false);

  // Сердечко и подписка на события человека — как в мини-приложении (/api/likes, /api/follows).
  useEffect(() => {
    if (!active || self) return;
    api<{ liked?: boolean }>(`/api/likes?userId=${id}`).then((r) => setLiked(!!r?.liked)).catch(() => {});
    api<{ following?: boolean }>(`/api/follows?userId=${id}`).then((r) => setFollowing(!!r?.following)).catch(() => {});
  }, [active, self, id]);

  async function heart() {
    tapLight();
    const next = !liked;
    setLiked(next);
    try {
      if (next) await api("/api/likes", { body: { userId: id, kind: "heart" } });
      else await api(`/api/likes?userId=${id}`, { method: "DELETE" });
    } catch (e) {
      setLiked(!next);
      if ((e as { status?: number }).status === 429) Alert.alert("Сердечки на сегодня закончились", "Завтра будут новые");
    }
  }

  async function toggleFollow() {
    tapLight();
    const next = !following;
    setFollowing(next);
    try {
      await api("/api/follows", { method: next ? "POST" : "DELETE", body: { userId: id } });
    } catch {
      setFollowing(!next);
    }
  }
  const [isMe, setIsMe] = useState(!!self);

  useEffect(() => {
    if (!self) getMyId().then((my) => setIsMe(my === id));
  }, [self, id]);

  const load = useCallback(() => {
    api<Person>(`/api/users/${id}`)
      .then((x) => ({ ...x, photos: x.photos ?? [], interests: x.interests ?? [], commonInterests: x.commonInterests ?? [] }))
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
    <View style={{ flex: 1, backgroundColor: colors.ink }}>
      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        contentContainerStyle={{ paddingBottom: insets.bottom + (isMe ? 40 : 120) }}
      >
        <Animated.View style={[styles.photoBox, { transform: [{ translateY: photoShift }, { scale: photoScale }] }]}>
          {photos.length ? (
            <Image source={{ uri: photos[photo] ?? photos[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" />
          ) : (
            <LinearGradient colors={["#3F3A4E", "#AAA0FF", colors.milk]} style={[StyleSheet.absoluteFill, styles.noPhoto]}>
              <Mosya pose="wave" size={170} />
            </LinearGradient>
          )}
          <LinearGradient colors={["rgba(23,20,31,0.32)", "rgba(23,20,31,0)", "rgba(23,20,31,0)", "rgba(23,20,31,0.88)", "#17141F"]} locations={[0, 0.22, 0.5, 0.9, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
          <View style={styles.zones}>
            <Pressable style={{ flex: 1 }} onPress={() => flip(-1)} />
            <Pressable style={{ flex: 1 }} onPress={() => flip(1)} />
          </View>
        </Animated.View>

        {/* Как в действующем приложении: имя, «в сети» и плашки фактов внизу фото, справа — стрелка к «О себе». */}
        <View style={[styles.overlay, { marginTop: -(OVERLAY_H + insets.bottom), height: OVERLAY_H + insets.bottom, paddingBottom: (isMe ? 24 : 92) + insets.bottom }]}>
          <Text style={styles.name} numberOfLines={2}>
            {name}
            {age ? `, ${age}` : ""}
          </Text>
          {p ? (
            <View style={styles.pills}>
              {dist ? (
                <View style={[styles.pill, styles.pillDark]}>
                  <Icon name="pin" size={13} color="#fff" />
                  <Text style={styles.pillText}>{dist}</Text>
                </View>
              ) : null}
              {p.ratingAvg > 0 ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>★ {p.ratingAvg.toFixed(1).replace(".", ",")}</Text>
                </View>
              ) : null}
              <View style={styles.pill}>
                <Text style={styles.pillText}>
                  {p.completedMeetingsCount} {plural(p.completedMeetingsCount, "встреча", "встречи", "встреч")}
                </Text>
              </View>
              {common.length ? (
                <View style={styles.pill}>
                  <Text style={styles.pillText}>
                    {common.length} {plural(common.length, "общий интерес", "общих интереса", "общих интересов")}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : null}
          <Pressable onPress={() => scrollRef.current?.scrollTo({ y: SCREEN_H * 0.55, animated: true })} style={[styles.upk, { bottom: (isMe ? 24 : 92) + insets.bottom }]} accessibilityLabel="О себе">
            <Icon name="up" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.body}>
          {!p ? (
            error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />
          ) : (
            <>
              {p.bio?.trim() ? (
                <View style={styles.blk}>
                  <Text style={styles.blkH}>О себе</Text>
                  <Text style={styles.about}>{p.bio.trim()}</Text>
                </View>
              ) : null}
              {common.length ? (
                <View style={styles.blk}>
                  <View style={styles.blkRow}>
                    <Text style={styles.blkH}>Общие интересы</Text>
                    <Text style={styles.blkSub}>
                      {common.length} из {p.interests.length}
                    </Text>
                  </View>
                  <Chips items={common} />
                </View>
              ) : null}
              {other.length ? (
                <View style={styles.blk}>
                  <Text style={styles.blkH}>{common.length ? "Ещё интересы" : "Интересы"}</Text>
                  <Chips items={other} />
                </View>
              ) : null}
              {!isMe ? (
                <Pressable onPress={() => setReport(true)} style={styles.reportLink} hitSlop={6}>
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
          <View style={styles.topRight} pointerEvents="box-none">
            {topAction}
            {!isMe && p ? (
              <RoundBtn onPress={() => setReport(true)}>
                <Icon name="flag" />
              </RoundBtn>
            ) : null}
          </View>
        </View>
      </View>


      {!isMe && p ? (
        <View style={[styles.bar2, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <Pressable onPress={write} disabled={writing} style={({ pressed }) => [styles.rb, !p.canMessage && { opacity: 0.5 }, pressed && { opacity: 0.8 }]} accessibilityLabel="Написать">
            {writing ? <ActivityIndicator color="#fff" /> : <Icon name="chat" size={21} color="#fff" />}
          </Pressable>
          <Pressable onPress={heart} style={({ pressed }) => [styles.rb, liked && styles.rbOn, pressed && { transform: [{ scale: 0.92 }] }]} accessibilityLabel={liked ? "Убрать сердечко" : "Поставить сердечко"}>
            <Icon name="heart" size={22} color={liked ? colors.ink : "#fff"} />
          </Pressable>
          <Pressable onPress={toggleFollow} style={({ pressed }) => [styles.rb, following && styles.rbOn, pressed && { transform: [{ scale: 0.92 }] }]} accessibilityLabel={following ? "Отписаться от событий" : "Подписаться на события"}>
            <Icon name="bell" size={21} color={following ? colors.ink : "#fff"} />
          </Pressable>
          <Pressable onPress={() => setInvite(true)} style={({ pressed }) => [styles.callBtn, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}>
            <Text style={styles.callText} numberOfLines={2}>Позвать на встречу</Text>
          </Pressable>
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

function Chips({ items }: { items: string[] }) {
  return (
    <View style={styles.chips}>
      {items.map((i) => (
        <View key={i} style={styles.chip}>
          <View style={styles.chipIc}>
            <Image source={{ uri: interestIcon(i) }} style={{ width: 16, height: 16 }} contentFit="contain" />
          </View>
          <Text style={styles.chipText}>{i}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  photoBox: { height: PHOTO_H, backgroundColor: colors.violet, overflow: "hidden" },
  noPhoto: { alignItems: "center", justifyContent: "center" },
  zones: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
  overlay: { justifyContent: "flex-end", paddingHorizontal: 20, gap: 8 },
  name: { fontSize: 34, lineHeight: 38, ...f("600"), color: "#fff", letterSpacing: -1, paddingRight: 56 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingRight: 56 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.28)" },
  pillDark: { backgroundColor: "rgba(23,20,31,0.3)" },
  pillText: { fontSize: 13, ...f("500"), color: "#fff" },
  upk: { position: "absolute", right: 20, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  blk: { gap: 10, marginBottom: 6 },
  blkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  blkH: { fontSize: 18, ...f("500"), color: "#fff", letterSpacing: -0.4 },
  blkSub: { fontFamily: FONT, fontSize: 13.5, color: "#C6C3CD" },
  about: { fontFamily: FONT, fontSize: 15, lineHeight: 22, color: "#F5F4F7", backgroundColor: "#2B2833", borderRadius: 20, padding: 16, overflow: "hidden" },
  chipIc: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  bar2: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  rb: { width: 48, height: 52, borderRadius: 26, backgroundColor: "rgba(23,20,31,0.78)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  rbOn: { backgroundColor: "rgba(255,255,255,0.94)" },
  callBtn: { flex: 1, height: 52, borderRadius: 999, backgroundColor: "#fff", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  callText: { color: colors.ink, fontSize: 14, lineHeight: 16, ...f("500"), textAlign: "center" },
  body: { padding: 20, paddingTop: 16, gap: 12, backgroundColor: colors.ink },
  card: { borderRadius: 24, padding: 16, gap: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 17, ...f("500"), color: colors.ink, letterSpacing: -0.3 },
  bio: { fontFamily: FONT, fontSize: 15.5, lineHeight: 22, color: colors.ink2 },
  muted: { fontFamily: FONT, fontSize: 13.5, color: colors.grey },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: "#2B2833", borderRadius: 999, paddingLeft: 5, paddingRight: 13, paddingVertical: 5 },
  chipText: { fontFamily: FONT, fontSize: 14, color: "#fff" },
  reportLink: { height: 46, borderRadius: 23, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center", marginTop: 4 },
  reportText: { fontSize: 14, ...f("500"), color: "rgba(255,255,255,0.85)" },
  top: { position: "absolute", left: 14, right: 14, gap: 10 },
  bars: { flexDirection: "row", gap: 4, paddingHorizontal: 4 },
  bar: { flex: 1, height: 3, borderRadius: 2, backgroundColor: "rgba(255,255,255,0.4)" },
  barOn: { backgroundColor: "#fff" },
  topRow: { flexDirection: "row", justifyContent: "space-between" },
  topRight: { flexDirection: "row", gap: 10 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingTop: 12, backgroundColor: "rgba(246,242,255,0.94)" },
  chatBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: "#fff", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(23,20,31,0.15)" },
});
