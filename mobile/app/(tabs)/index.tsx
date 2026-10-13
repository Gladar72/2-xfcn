import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Aurora, Glass, Mosya, Pill, RoundBtn, SectionHead, Title } from "@/components/brand";
import { EventCard } from "@/components/EventCard";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { CitySheet } from "@/components/CitySheet";
import { cityEventIcon, cityWhen, KIND_LABEL, type CityEvent } from "@/lib/cityEvents";
import { tapOk } from "@/lib/feedback";
import { catIcon, CATEGORY_SHORT, colors, eventIcon, FONT } from "@/lib/theme";
import { costShort, dayShort, plural } from "@/lib/format";
import type { Category, FeedEvent, MyProfile, PersonCard } from "@/lib/types";
import { useGuide } from "@/lib/guide";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const [city, setCity] = useState<string | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [cat, setCat] = useState<string | null>(null);
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  // Мося-гид: после регистрации — где создать встречу, где «Для бизнеса», где встречи рядом.
  useGuide("feed", events !== null);
  const [biz, setBiz] = useState<FeedEvent[]>([]);
  const [cityEvents, setCityEvents] = useState<CityEvent[]>([]);
  const [cityOpen, setCityOpen] = useState(false);
  const [people, setPeople] = useState<PersonCard[]>([]);
  const [unread, setUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const qs = cat ? `&category=${cat}` : "";
    await Promise.all([
      api<{ items: FeedEvent[] }>(`/api/events?page=0${qs}`).then((r) => setEvents(r.items)).catch(() => setEvents([])),
      api<{ items: FeedEvent[] }>(`/api/events?business=true`).then((r) => setBiz(r.items.filter((x) => x.isBusiness))).catch(() => {}),
      api<{ items: CityEvent[] }>("/api/city-events").then((r) => setCityEvents(r.items ?? [])).catch(() => {}),
    ]);
    setRefreshing(false);
  }, [cat]);

  useEffect(() => {
    api<MyProfile>("/api/me/profile").then((p) => setCity(p.city)).catch(() => {});
    api<{ categories: Category[] }>("/api/categories").then((r) => setCategories(r.categories.filter((c) => c.slug !== "custom"))).catch(() => {});
    api<{ items: PersonCard[] }>("/api/people").then((r) => setPeople(r.items ?? [])).catch(() => {});
    api<{ items: { unreadCount: number }[] }>("/api/conversations")
      .then((r) => setUnread(r.items.reduce((s, c) => s + (c.unreadCount > 0 ? 1 : 0), 0)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    setEvents(null);
    load();
  }, [load]);

  // Непрочитанные уведомления — при каждом возвращении на ленту
  // (после экрана уведомлений счётчик должен обнулиться).
  useFocusEffect(
    useCallback(() => {
      api<{ items: { isRead: boolean }[] }>("/api/notifications")
        .then((r) => setNotifUnread((r.items ?? []).filter((n) => !n.isRead).length))
        .catch(() => {});
    }, [])
  );

  async function changeCity(next: string) {
    setCityOpen(false);
    if (next === city) return;
    const prev = city;
    setCity(next);
    try {
      await api("/api/me/profile", { method: "PATCH", body: { city: next } });
      tapOk();
      setEvents(null);
      load();
      api<{ items: PersonCard[] }>("/api/people").then((r) => setPeople(r.items ?? [])).catch(() => {});
    } catch {
      setCity(prev);
    }
  }

  const list = useMemo(() => (events ?? []).filter((e) => !e.isBusiness), [events]);
  const popular = list.slice(0, 4);
  const rest = list.slice(4);

  return (
    <View style={{ flex: 1 }}>
      <Aurora />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 120 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.violet} />}
      >
        <View style={styles.top}>
          <Pressable onPress={() => setCityOpen(true)} hitSlop={8} style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}>
            <Text style={styles.locSmall}>Ищем компанию в</Text>
            <View style={styles.locRow}>
              <Text style={styles.locCity}>{city ?? "…"}</Text>
              <Icon name="down" size={18} />
            </View>
          </Pressable>
          <View style={styles.topBtns}>
            <RoundBtn onPress={() => router.push("/notifications")}>
              <Icon name="bell" />
              {notifUnread > 0 ? (
                <View style={styles.cnt}>
                  <Text style={styles.cntText}>{notifUnread > 9 ? "9+" : notifUnread}</Text>
                </View>
              ) : null}
            </RoundBtn>
            <RoundBtn onPress={() => router.navigate("/(tabs)/chats")}>
              <Icon name="chat" />
              {unread > 0 ? (
                <View style={styles.cnt}>
                  <Text style={styles.cntText}>{unread > 9 ? "9+" : unread}</Text>
                </View>
              ) : null}
            </RoundBtn>
          </View>
        </View>

        <View style={styles.ttl}>
          <Title plain="Что ищешь " em="сегодня?" size={30} />
        </View>

        <View style={styles.search}>
          <Pressable onPress={() => router.push("/search")} style={{ flex: 1 }}>
            <Glass style={styles.sfield}>
              <Icon name="search" size={18} color={colors.grey} />
              <Text style={[styles.sinput, { color: colors.grey, lineHeight: 50 }]}>Кофе, пробежка, кино…</Text>
            </Glass>
          </Pressable>
          <RoundBtn dark size={50} onPress={() => router.push({ pathname: "/search", params: { filters: "1" } })}>
            <Icon name="filter" color="#fff" />
          </RoundBtn>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railOut} contentContainerStyle={styles.cats}>
          {categories.map((c) => {
            const on = cat === c.slug;
            return (
              <Pressable key={c.slug} onPress={() => router.push({ pathname: "/search", params: { categories: c.slug } })} style={({ pressed }) => ({ transform: [{ scale: pressed ? 0.93 : 1 }] })}>
                {on ? (
                  <View style={[styles.cat, { backgroundColor: colors.ink }]}>
                    <Image source={{ uri: catIcon(c.slug) }} style={styles.catIcon} />
                    <Text style={[styles.catText, { color: "#fff" }]}>{CATEGORY_SHORT[c.slug] ?? c.name}</Text>
                  </View>
                ) : (
                  <Glass style={styles.cat}>
                    <Image source={{ uri: catIcon(c.slug) }} style={styles.catIcon} />
                    <Text style={styles.catText}>{CATEGORY_SHORT[c.slug] ?? c.name}</Text>
                  </Glass>
                )}
              </Pressable>
            );
          })}
        </ScrollView>

        <SectionHead title={cat ? CATEGORY_SHORT[cat] ?? "Встречи" : "Популярное сегодня"} action="Все" onAction={() => router.push("/search")} />
        {events === null ? (
          <ActivityIndicator color={colors.violet} style={{ marginVertical: 60 }} />
        ) : popular.length === 0 ? (
          <Glass strong style={styles.empty}>
            <Mosya pose="think" size={120} />
            <Text style={styles.emptyTitle}>Сегодня пока тихо</Text>
            <Text style={styles.emptyText}>Создай первую встречу — к тебе присоединятся</Text>
            <Pressable onPress={() => router.push("/create")} style={styles.emptyBtn}>
              <Text style={styles.emptyBtnText}>Создать встречу</Text>
            </Pressable>
          </Glass>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railOut} contentContainerStyle={styles.rail} snapToInterval={312} decelerationRate="fast">
            {popular.map((e) => (
              <EventCard key={e.id} event={e} />
            ))}
          </ScrollView>
        )}

        {people.length > 0 && !cat ? (
          <>
            <SectionHead title="Люди с похожими интересами" action="Листать" onAction={() => router.push("/people")} />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.railOut} contentContainerStyle={styles.rail}>
              {people.map((p) => (
                <Pressable
                  key={p.id}
                  onPress={() => router.push({ pathname: "/people", params: { start: p.id } })}
                  style={({ pressed }) => [styles.pcard, { transform: [{ scale: pressed ? 0.96 : 1 }] }]}
                >
                  {p.avatarUrl ? (
                    <Image source={{ uri: p.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <LinearGradient colors={["#6C3BFF", "#FF6FA0"]} style={[StyleSheet.absoluteFill, styles.pInit]}>
                      <Text style={styles.pInitText}>{p.name.charAt(0).toUpperCase()}</Text>
                    </LinearGradient>
                  )}
                  <LinearGradient colors={["rgba(0,0,0,0)", "rgba(40,10,70,0.7)"]} locations={[0.45, 1]} style={StyleSheet.absoluteFill} />
                  {p.sharedCount > 0 ? (
                    <View style={styles.pTag}>
                      <Text style={styles.pTagText}>
                        {p.sharedCount} {plural(p.sharedCount, "общий", "общих", "общих")}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.pInfo}>
                    <Text style={styles.pName} numberOfLines={2}>
                      {p.name}, {p.age}
                    </Text>
                    <Text style={styles.pSub} numberOfLines={1}>
                      {p.sharedInterests.slice(0, 2).join(" · ")}
                    </Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        ) : null}

        {!cat ? (
          <View style={styles.afisha}>
            <LinearGradient colors={["#1B1236", "#2A1650", "#3B1A55"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
            <View style={styles.afHead}>
              <View>
                <Text style={styles.afSmall}>ДЛЯ БИЗНЕСА</Text>
                <Text style={styles.afTitle}>Афиша заведений</Text>
              </View>
              <Pressable onPress={() => router.push("/business")} hitSlop={8}>
                <Text style={styles.afAll}>Все ›</Text>
              </Pressable>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.rail, { paddingHorizontal: 20 }]} style={{ marginHorizontal: -20, marginTop: 14 }}>
              {biz.map((e) => (
                <Pressable key={e.id} onPress={() => router.push(`/event/${e.id}`)} style={styles.acard}>
                  {e.photoUrl ? (
                    <Image source={{ uri: e.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <LinearGradient colors={["#6C3BFF", "#FF6FA0"]} style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                      <Image source={{ uri: eventIcon(e) }} style={{ width: 90, height: 90 }} />
                    </LinearGradient>
                  )}
                  <LinearGradient colors={["rgba(0,0,0,0)", "rgba(20,8,40,0.85)"]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
                  <View style={styles.acTop}>
                    <View style={styles.acOrg}>
                      <Text style={styles.acOrgText} numberOfLines={1}>{e.organizer?.name ?? "Заведение"}</Text>
                    </View>
                    {e.isLive ? (
                      <Pill kind="live" label="Идёт сейчас" />
                    ) : e.isBoosted ? (
                      <Pill kind="white" label="Поднято" />
                    ) : e.seatsTaken >= e.seatsTotal ? (
                      <Pill kind="dark" label="Мест нет" />
                    ) : null}
                  </View>
                  <View style={styles.acBody}>
                    <Text style={styles.acTitle} numberOfLines={2}>{e.title}</Text>
                    <Text style={styles.acMeta}>
                      {e.eventTime.slice(0, 5)} · {dayShort(e.eventDate)} · {e.seatsTaken} из {e.seatsTotal}
                    </Text>
                    <View style={styles.acPrice}>
                      <Text style={styles.acPriceText}>{costShort(e)}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
              {cityEvents.map((c) => (
                <Pressable key={c.id} onPress={() => router.push(`/city/${c.id}` as Href)} style={styles.acard}>
                  {c.photoUrl ? (
                    <Image source={{ uri: c.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <LinearGradient colors={["#3B1A55", "#6C3BFF"]} style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                      <Image source={{ uri: cityEventIcon(c.kind) }} style={{ width: 90, height: 90 }} />
                    </LinearGradient>
                  )}
                  <LinearGradient colors={["rgba(0,0,0,0)", "rgba(20,8,40,0.85)"]} locations={[0.35, 1]} style={StyleSheet.absoluteFill} />
                  <View style={styles.acTop}>
                    <View style={styles.acOrg}>
                      <Text style={styles.acOrgText} numberOfLines={1}>{KIND_LABEL[c.kind ?? ""] ?? "В городе"}</Text>
                    </View>
                  </View>
                  <View style={styles.acBody}>
                    <Text style={styles.acTitle} numberOfLines={2}>{c.title}</Text>
                    <Text style={styles.acMeta} numberOfLines={1}>
                      {cityWhen(c)}
                      {c.placeName ? ` · ${c.placeName}` : ""}
                    </Text>
                    {c.priceText ? (
                      <View style={styles.acPrice}>
                        <Text style={styles.acPriceText} numberOfLines={1}>{c.priceText}</Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              ))}
              {biz.length < 4 ? (
                <Pressable onPress={() => router.push("/business")} style={[styles.acard, styles.invite]}>
                  <Image source={{ uri: `${API_URL}/brand/cat3d/i_biz.webp` }} style={{ width: 84, height: 84 }} />
                  <Text style={styles.invTitle}>Здесь может быть ваше событие</Text>
                  <Text style={styles.invText}>Бесплатно для заведений: концерты, квизы, дегустации</Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        ) : null}

        {rest.length > 0 ? (
          <>
            <SectionHead title="Все встречи" />
            <View style={{ gap: 14 }}>
              {rest.map((e) => (
                <EventCard key={e.id} event={e} width="100%" height={340} />
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
      <CitySheet visible={cityOpen} value={city} onPick={changeCity} onClose={() => setCityOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  topBtns: { flexDirection: "row", gap: 8 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  locSmall: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locCity: { fontFamily: FONT, fontSize: 17, fontWeight: "500", color: colors.ink },
  cnt: { position: "absolute", top: 3, right: 3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.pink, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  cntText: { fontFamily: FONT, color: "#fff", fontSize: 10.5, fontWeight: "600" },
  ttl: { marginTop: 18 },
  search: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  sfield: { flex: 1, height: 50, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 },
  sinput: { flex: 1, fontFamily: FONT, fontSize: 15, color: colors.ink, height: 50 },
  railOut: { marginHorizontal: -20 },
  cats: { gap: 8, paddingHorizontal: 20, paddingVertical: 4, marginTop: 10 },
  cat: { flexDirection: "row", alignItems: "center", gap: 6, height: 46, paddingLeft: 6, paddingRight: 16, borderRadius: 999 },
  catIcon: { width: 38, height: 38 },
  catText: { fontFamily: FONT, fontSize: 14, fontWeight: "500", color: colors.ink },
  rail: { gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14 },
  empty: { borderRadius: 32, padding: 24, alignItems: "center", gap: 6 },
  emptyTitle: { fontFamily: FONT, fontSize: 19, fontWeight: "500", color: colors.ink },
  emptyText: { fontFamily: FONT, fontSize: 14, color: colors.grey, textAlign: "center" },
  emptyBtn: { marginTop: 10, backgroundColor: colors.ink, borderRadius: 999, height: 44, paddingHorizontal: 20, justifyContent: "center" },
  emptyBtnText: { fontFamily: FONT, color: "#fff", fontSize: 15, fontWeight: "500" },
  pcard: { width: 150, height: 210, borderRadius: 26, overflow: "hidden", backgroundColor: colors.lavender100 },
  pInit: { alignItems: "center", justifyContent: "center" },
  pInitText: { fontFamily: FONT, color: "#fff", fontSize: 48, fontWeight: "500" },
  pTag: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 999, paddingHorizontal: 9, height: 26, justifyContent: "center" },
  pTagText: { fontFamily: FONT, color: "#fff", fontSize: 11.5 },
  pInfo: { position: "absolute", left: 12, right: 12, bottom: 10 },
  pName: { fontFamily: FONT, color: "#fff", fontSize: 16, fontWeight: "500" },
  pSub: { fontFamily: FONT, color: "rgba(255,255,255,0.9)", fontSize: 12 },
  afisha: { marginTop: 26, marginHorizontal: -20, paddingHorizontal: 20, paddingTop: 22, paddingBottom: 12, overflow: "hidden" },
  afHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  afAll: { fontFamily: FONT, color: "rgba(255,255,255,0.85)", fontSize: 14.5, fontWeight: "500" },
  invite: { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", padding: 18, gap: 8 },
  invTitle: { fontFamily: FONT, color: "#fff", fontSize: 16, fontWeight: "500", textAlign: "center" },
  invText: { fontFamily: FONT, color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "center" },
  afSmall: { fontFamily: FONT, color: "rgba(255,255,255,0.6)", fontSize: 11.5, letterSpacing: 0.8 },
  afTitle: { fontFamily: FONT, color: "#fff", fontSize: 22, fontWeight: "500", letterSpacing: -0.4, marginTop: 2 },
  acard: { width: 230, height: 260, borderRadius: 26, overflow: "hidden", backgroundColor: "#2A1650" },
  acTop: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", gap: 6, flexWrap: "wrap" },
  acOrg: { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 999, height: 28, paddingHorizontal: 10, justifyContent: "center", maxWidth: 140 },
  acOrgText: { fontFamily: FONT, color: "#fff", fontSize: 12.5, fontWeight: "500" },
  acBody: { position: "absolute", left: 12, right: 12, bottom: 12, gap: 4 },
  acTitle: { fontFamily: FONT, color: "#fff", fontSize: 16, fontWeight: "500" },
  acMeta: { fontFamily: FONT, color: "rgba(255,255,255,0.85)", fontSize: 12.5 },
  acPrice: { alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 999, height: 28, paddingHorizontal: 11, justifyContent: "center", marginTop: 4 },
  acPriceText: { fontFamily: FONT, fontSize: 12.5, fontWeight: "500", color: colors.ink },
});
