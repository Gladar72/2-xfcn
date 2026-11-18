import { useEffect, useRef, useState, type ReactNode } from "react";
import { ActivityIndicator, Alert, Animated, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { router, type Href } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Press } from "@/components/k";
import { HeartBurst, pop, type HeartBurstRef } from "@/components/k/HeartBurst";
import { Creature } from "@/components/k/Creature";
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
  distanceM?: number | null;
  interests: string[];
  commonInterests: string[];
}

/** То, что уже известно из ленты/колоды — показываем сразу, пока грузится полный профиль. */
export interface PersonPreview {
  id: string;
  name: string;
  age: number;
  avatarUrl: string | null;
  distanceM?: number | null;
  distanceKm?: number | null;
}

const NO_MEET = "Пока написать нельзя — у вас ещё не было общей встречи. Позови на свою встречу или создай новую 😉";
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
  transparentBg,
}: {
  /** В колоде под карточкой уже лежит фото этого человека — свой фон не рисуем, чтобы не моргало. */
  transparentBg?: boolean;
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

  const burst = useRef<HeartBurstRef>(null);
  const heartPop = useRef(new Animated.Value(1)).current;
  const bellPop = useRef(new Animated.Value(1)).current;
  const [heartToast, setHeartToast] = useState<string | null>(null);
  async function heart() {
    const next = !liked;
    setLiked(next);
    pop(heartPop);
    if (next) burst.current?.fire();
    else tapLight();
    try {
      if (next) {
        const r = await api<{ mutual?: boolean }>("/api/likes", { body: { userId: id, kind: "heart" } });
        // Человеку пришло уведомление; когда ответит сердечком — «Это взаимно», можно звать на встречу.
        setHeartToast(r?.mutual ? "Это взаимно! Самое время позвать на встречу 💜" : `Сердечко отправлено — ${name.split(" ")[0]} получит уведомление`);
        setTimeout(() => setHeartToast(null), 2600);
      }
      else await api(`/api/likes?userId=${id}`, { method: "DELETE" });
    } catch (e) {
      setLiked(!next);
      if ((e as { status?: number }).status === 429) Alert.alert("Сердечки на сегодня закончились", "Завтра будут новые");
    }
  }

  async function toggleFollow() {
    tapLight();
    pop(bellPop);
    const next = !following;
    setFollowing(next);
    try {
      await api("/api/follows", { method: next ? "POST" : "DELETE", body: { userId: id } });
    } catch {
      setFollowing(!next);
    }
  }
  const [isMe, setIsMe] = useState(!!self);
  const { height: windowHeight } = useWindowDimensions();
  const [measuredHeight, setMeasuredHeight] = useState(0);
  const footerInset = isMe ? insets.bottom : 62 + Math.max(insets.bottom, 12);
  const heroHeight = Math.max(0, (measuredHeight || windowHeight) - footerInset);

  useEffect(() => {
    if (!self) getMyId().then((my) => setIsMe(my === id));
  }, [self, id]);

  useEffect(() => {
    if (!active) return;
    let current = true;
    api<Person>(`/api/users/${id}`)
      .then(r => {
        if (!current) return;
        setP({ ...r, photos: r.photos ?? [], interests: r.interests ?? [], commonInterests: r.commonInterests ?? [] });
        setError(null);
      })
      .catch(() => { if (current) setError("Профиль недоступен"); });
    return () => { current = false; };
  }, [active, id, preview?.distanceM, preview?.distanceKm]);
  const distance = distanceLabel(p ? p.distanceKm : preview?.distanceKm, p ? p.distanceM : preview?.distanceM);

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

  const common = p?.commonInterests ?? [];
  const other = (p?.interests ?? []).filter((i) => !common.includes(i));

  return (
    <View style={{ flex: 1, backgroundColor: transparentBg ? "transparent" : "#17141F" }}>
      {/* Фото стоит на месте (как .gal в мини-аппе), карточка с «О себе» едет поверх него. */}
      <Animated.View pointerEvents="none" style={[styles.photoBox, transparentBg && { backgroundColor: "transparent" }, StyleSheet.absoluteFillObject, { transform: [{ scale: photoScale }] }]}>
        {photos.length ? (
          <Image source={{ uri: photos[photo] ?? photos[0] }} style={StyleSheet.absoluteFill} contentFit="cover" transition={180} cachePolicy="memory-disk" />
        ) : (
          <LinearGradient colors={["#3F3A4E", "#AAA0FF", colors.milk]} style={[StyleSheet.absoluteFill, styles.noPhoto]}>
            <Creature size={170} variant="e" />
          </LinearGradient>
        )}
        <LinearGradient colors={["rgba(23,20,31,0.32)", "rgba(23,20,31,0)", "rgba(23,20,31,0)", "rgba(23,20,31,0.88)", "#17141F"]} locations={[0, 0.22, 0.5, 0.9, 1]} style={StyleSheet.absoluteFill} pointerEvents="none" />
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: footerInset }}
        onLayout={(e) => setMeasuredHeight(e.nativeEvent.layout.height)}
      >
        {/* Первый экран — прозрачный: нажатия слева/справа листают фото. */}
        <View style={{ minHeight: heroHeight, justifyContent: "flex-end" }}>
          <View style={styles.zones}>
            <Pressable style={{ flex: 1 }} onPress={() => flip(-1)} />
            <Pressable style={{ flex: 1 }} onPress={() => flip(1)} />
          </View>
          <LinearGradient pointerEvents="none" colors={["rgba(23,20,31,0)", "rgba(23,20,31,0.25)", "rgba(23,20,31,0.55)", "rgba(23,20,31,0.74)"]} locations={[0, 0.4, 0.75, 1]} style={styles.heroFade} />
          <View pointerEvents="box-none" style={styles.overlay}>
            <Text style={styles.name} numberOfLines={2}>
              {name}
              {age ? `, ${age}` : ""}
            </Text>
            {p ? (
              <View style={styles.pills}>
                {distance ? (
                  <View style={styles.pill}>
                    <Icon name="pin" size={13} color="#fff" />
                    <Text style={styles.pillText}>{distance}</Text>
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
            <Pressable onPress={() => scrollRef.current?.scrollTo({ y: heroHeight * 0.55, animated: true })} style={styles.upk} accessibilityLabel="О себе">
              <Icon name="up" size={20} color="#fff" />
            </Pressable>
          </View>
        </View>

        {/* «О себе» — тёмное стекло: фото просвечивает размыто, без плотной синевы */}
        <View style={styles.body}>
          {!p ? (
            error ? <Text style={styles.muted}>{error}</Text> : <ActivityIndicator color="#fff" style={{ marginTop: 30 }} />
          ) : (
            <>
              {p.bio?.trim() ? (
                <View style={styles.blk}>
                  <Text style={styles.blkH}>О себе</Text>
                  <View style={[styles.glassPill, styles.about]}>
                    <Text style={[styles.chipText, styles.aboutText]}>{p.bio.trim()}</Text>
                  </View>
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
        <LinearGradient pointerEvents="none" colors={["rgba(23,20,31,0.74)", "rgba(23,20,31,0)"]} style={{ height: 38 }} />
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
          <TopBtn onPress={onBack} label="Назад">
            <Icon name="back" color="#fff" />
          </TopBtn>
          <View style={styles.topRight} pointerEvents="box-none">
            {topAction}
            {!isMe && p ? (
              <TopBtn onPress={() => setReport(true)} label="Пожаловаться">
                <Icon name="flag" color="#fff" />
              </TopBtn>
            ) : null}
          </View>
        </View>
      </View>


      {!isMe && p ? (
        <View style={[styles.bar2, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <LinearGradient pointerEvents="none" colors={["rgba(23,20,31,0)", "rgba(23,20,31,0.82)"]} style={[StyleSheet.absoluteFillObject, { top: -22 }]} />
          {heartToast ? (
            <View pointerEvents="none" style={[styles.heartToast, { bottom: Math.max(insets.bottom, 12) + 64 }]}>
              <Text style={styles.heartToastText}>{heartToast}</Text>
            </View>
          ) : null}
          <Press onPress={write} disabled={writing} dark style={[styles.rb, !p.canMessage && { opacity: 0.5 }]} accessibilityLabel="Написать">
            {writing ? <ActivityIndicator color="#fff" /> : <Icon name="chat" size={21} color="#fff" />}
          </Press>
          <View>
            <Animated.View style={{ transform: [{ scale: heartPop }] }}>
              <Press onPress={heart} dark={!liked} style={[styles.rb, liked && styles.rbHeart]} accessibilityLabel={liked ? "Убрать сердечко" : "Поставить сердечко"}>
                <Icon name="heart" size={22} color="#fff" />
              </Press>
            </Animated.View>
            <HeartBurst ref={burst} size={48} />
          </View>
          <Animated.View style={{ transform: [{ scale: bellPop }] }}>
            <Press onPress={toggleFollow} dark={!following} style={[styles.rb, following && styles.rbOn]} accessibilityLabel={following ? "Отписаться от событий" : "Подписаться на события"}>
              <Icon name="bell" size={21} color={following ? colors.ink : "#fff"} />
            </Press>
          </Animated.View>
          <Press onPress={() => setInvite(true)} haptic style={[styles.callBtn, { flex: 1 }]}>
            <Text style={styles.callText} numberOfLines={2}>Позвать на встречу</Text>
          </Press>
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
        <View key={i} style={[styles.glassPill, styles.chip]}>
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
  photoBox: { backgroundColor: colors.violet, overflow: "hidden" },
  noPhoto: { alignItems: "center", justifyContent: "center" },
  zones: { ...StyleSheet.absoluteFillObject, flexDirection: "row" },
  heroFade: { position: "absolute", left: 0, right: 0, bottom: 0, height: 124 },
  overlay: { paddingHorizontal: 20, paddingBottom: 6, gap: 8 },
  name: { fontSize: 34, lineHeight: 38, ...f("600"), color: "#fff", letterSpacing: -1, paddingRight: 56 },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingRight: 56 },
  pill: { flexDirection: "row", alignItems: "center", gap: 4, height: 30, paddingHorizontal: 12, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)" },
  pillDark: { backgroundColor: "rgba(23,20,31,0.3)" },
  pillText: { fontSize: 13, ...f("500"), color: "#fff" },
  upk: { position: "absolute", right: 20, bottom: 6, width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.22)", alignItems: "center", justifyContent: "center" },
  blk: { gap: 10, marginBottom: 6 },
  blkRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  blkH: { fontSize: 18, ...f("500"), color: "#fff", letterSpacing: -0.4 },
  blkSub: { fontFamily: FONT, fontSize: 13.5, color: "#C6C3CD" },
  about: { alignSelf: "flex-start", maxWidth: "100%", minHeight: 36, justifyContent: "center", paddingHorizontal: 13, paddingVertical: 6 },
  aboutText: { lineHeight: 21 },
  chipIc: { width: 24, height: 24, borderRadius: 12, backgroundColor: "#fff", alignItems: "center", justifyContent: "center" },
  bar2: { position: "absolute", left: 0, right: 0, bottom: 0, flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingTop: 10 },
  rb: { width: 48, height: 52, borderRadius: 26, backgroundColor: "rgba(23,20,31,0.78)", alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(255,255,255,0.14)" },
  rbOn: { backgroundColor: "rgba(255,255,255,0.94)" },
  rbHeart: { backgroundColor: "#FF4F8B", borderColor: "rgba(255,255,255,0.3)" },
  heartToast: { position: "absolute", left: 14, right: 14, minHeight: 42, borderRadius: 21, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" },
  heartToastText: { fontFamily: FONT, fontSize: 14, color: "#17141F", textAlign: "center" },
  callBtn: { flex: 1, height: 52, borderRadius: 999, backgroundColor: "#fff", flexDirection: "row", gap: 7, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  callText: { color: colors.ink, fontSize: 14, lineHeight: 16, ...f("500"), textAlign: "center" },
  body: { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 16, gap: 12, backgroundColor: "rgba(23,20,31,0.74)", overflow: "hidden" },
  card: { borderRadius: 24, padding: 16, gap: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: 17, ...f("500"), color: colors.ink, letterSpacing: -0.3 },
  bio: { fontFamily: FONT, fontSize: 15.5, lineHeight: 22, color: colors.ink2 },
  muted: { fontFamily: FONT, fontSize: 13.5, color: colors.grey },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  glassPill: { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", borderRadius: 18 },
  chip: { flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 5, paddingRight: 13, paddingVertical: 5 },
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

/** Кнопки поверх фото — тёмное стекло, как блок «О себе» (а не светлые круги). */
export function TopBtn({ children, onPress, label }: { children: ReactNode; onPress?: () => void; label?: string }) {
  return (
    <Press onPress={onPress} accessibilityLabel={label} dark style={topBtnStyle}>
      {children}
    </Press>
  );
}
const topBtnStyle = { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(43,40,51,0.78)", borderWidth: 1, borderColor: "rgba(255,255,255,0.16)", alignItems: "center" as const, justifyContent: "center" as const };
