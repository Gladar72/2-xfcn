import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Animated, AppState, Easing, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { Aurora, Glass, Grad, Mosya, Pill, RoundBtn, SectionHead, Title } from "@/components/brand";
import { EventCard } from "@/components/EventCard";
import { Icon } from "@/components/Icon";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { CitySheet } from "@/components/CitySheet";
import { cityEventIcon, cityWhen, KIND_LABEL, type CityEvent } from "@/lib/cityEvents";
import { tapOk } from "@/lib/feedback";
import { catIcon, CATEGORY_SHORT, colors, eventIcon, FONT, f } from "@/lib/theme";
import { costShort, dayShort, plural } from "@/lib/format";
import type { Category, FeedEvent, MyProfile, PersonCard } from "@/lib/types";
import { useGuide } from "@/lib/guide";
import { fetchPendingApplications, type PendingApplications } from "@/lib/pending";
import { distanceShort } from "@/lib/interests";
import { refreshLocationSilently, shareLocation } from "@/lib/location";

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
  // Есть ли у меня свежая примерная точка — иначе предлагаем «Показать, кто рядом».
  const [meHasLoc, setMeHasLoc] = useState(true);
  const [geoBusy, setGeoBusy] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifUnread, setNotifUnread] = useState(0);
  // Новая заявка на мою встречу — плашка над категориями, как в мини-приложении.
  const [req, setReq] = useState<PendingApplications | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // «Люди рядом» и «Популярное» приходят немного перемешанными (shuffle=1 и случайная
  // добавка на сервере) — при каждом заходе и раз в 2 минуты подборка обновляется.
  const loadPeople = useCallback(() => {
    return api<{ items: PersonCard[]; meHasLocation?: boolean }>("/api/people")
      .then((r) => {
        setPeople(r.items ?? []);
        setMeHasLoc(r.meHasLocation !== false);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(async () => {
    const qs = cat ? `&category=${cat}` : "";
    await Promise.all([
      api<{ items: FeedEvent[] }>(`/api/events?page=0&shuffle=1${qs}`).then((r) => setEvents(r.items)).catch(() => setEvents((prev) => prev ?? [])),
      api<{ items: FeedEvent[] }>(`/api/events?business=true`).then((r) => setBiz(r.items.filter((x) => x.isBusiness))).catch(() => {}),
      api<{ items: CityEvent[] }>("/api/city-events").then((r) => setCityEvents(r.items ?? [])).catch(() => {}),
    ]);
    setRefreshing(false);
  }, [cat]);

  useEffect(() => {
    api<MyProfile>("/api/me/profile").then((p) => setCity(p.city)).catch(() => {});
    api<{ categories: Category[] }>("/api/categories").then((r) => setCategories(r.categories.filter((c) => c.slug !== "custom"))).catch(() => {});
    loadPeople();
    api<{ items: { unreadCount: number; eventStatus?: string | null }[] }>("/api/conversations")
      .then((r) =>
        // Сколько непрочитанных сообщений; чаты прошедших/отменённых встреч не считаем.
        setUnread(
          r.items
            .filter((c) => c.eventStatus !== "completed" && c.eventStatus !== "cancelled")
            .reduce((s, c) => s + (c.unreadCount || 0), 0)
        )
      )
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
      fetchPendingApplications().then((r) => setReq(r.latest ? r : null));
    }, [])
  );

  // Свежая геопозиция (если разрешение уже дано) и автообновление подборок, пока главная на экране.
  useFocusEffect(
    useCallback(() => {
      refreshLocationSilently().then((ok) => {
        if (ok) {
          loadPeople();
          load();
        }
      });
      const t = setInterval(() => {
        if (AppState.currentState !== "active") return;
        loadPeople();
        load();
      }, 120e3);
      return () => clearInterval(t);
    }, [loadPeople, load])
  );

  async function allowGeo() {
    setGeoBusy(true);
    const ok = await shareLocation();
    setGeoBusy(false);
    if (ok) {
      tapOk();
      loadPeople();
      load();
    }
  }

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
      loadPeople();
    } catch {
      setCity(prev);
    }
  }

  // «Популярное сегодня»: только встречи людей, продвинутые первыми.
  // Все бизнес-события — в «Афише заведений» (тоже продвинутые первыми).
  const list = useMemo(() => {
    const all = (events ?? []).filter((e) => !e.isBusiness);
    return [...all.filter((e) => e.isBoosted), ...all.filter((e) => !e.isBoosted)];
  }, [events]);
  const bizSorted = useMemo(() => [...biz.filter((e) => e.isBoosted), ...biz.filter((e) => !e.isBoosted)], [biz]);
  const promotedN = list.filter((e) => e.isBoosted).length;
  const popular = list.slice(0, Math.max(4, promotedN));
  const rest = list.slice(popular.length);

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
              {unread > 0 ? <PulseCount n={unread} /> : null}
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

        {req?.latest ? (
          <Pressable
            onPress={() => router.push(`/applications/${req.latest!.eventId}` as Href)}
            accessibilityLabel="Открыть новую заявку"
            style={({ pressed }) => [styles.reqWrap, { transform: [{ scale: pressed ? 0.97 : 1 }] }]}
          >
            <Grad style={styles.req}>
              <View>
                {req.latest.avatarUrl ? (
                  <Image source={{ uri: req.latest.avatarUrl }} style={styles.reqAva} contentFit="cover" />
                ) : (
                  <View style={[styles.reqAva, styles.reqAvaEmpty]}>
                    <Text style={styles.reqAvaText}>{req.latest.name.slice(0, 1)}</Text>
                  </View>
                )}
                <View style={styles.reqCnt}>
                  <Text style={styles.reqCntText}>+{req.count}</Text>
                </View>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.reqSmall} numberOfLines={1}>
                  {`Новая заявка · «${req.latest.eventTitle}»`}
                </Text>
                <Text style={styles.reqBig} numberOfLines={1}>
                  {`${req.latest.name}${req.latest.age ? `, ${req.latest.age}` : ""} хочет пойти`}
                </Text>
              </View>
              <Icon name="chev" color="#fff" size={20} />
            </Grad>
          </Pressable>
        ) : null}

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

        <SectionHead title={cat ? CATEGORY_SHORT[cat] ?? "Встречи" : "Личные встречи"} action="Все" onAction={() => router.push("/search")} />
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
            <SectionHead
              title={people.some((p) => p.distanceM != null) ? "Люди рядом" : "Люди с похожими интересами"}
              action="Листать"
              onAction={() => router.push("/people")}
            />
            {!meHasLoc ? (
              <Pressable onPress={allowGeo} disabled={geoBusy} style={({ pressed }) => [{ transform: [{ scale: pressed ? 0.97 : 1 }], marginBottom: 12 }]}>
                <Glass style={styles.geo}>
                  <View style={styles.geoIc}>
                    {geoBusy ? <ActivityIndicator color="#fff" /> : <Icon name="pin" color="#fff" size={20} />}
                  </View>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={styles.geoTitle}>{geoBusy ? "Ищем, кто рядом…" : "Показать, кто рядом"}</Text>
                    <Text style={styles.geoText}>Увидишь, сколько до людей и встреч — точный адрес никто не узнает</Text>
                  </View>
                  <Icon name="chev" size={18} color={colors.grey} />
                </Glass>
              </Pressable>
            ) : null}
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
                    {p.distanceM != null ? (
                      <View style={styles.pDist}>
                        <Icon name="pin" size={12} color="#fff" />
                        <Text style={styles.pDistText}>{distanceShort(p.distanceM)}</Text>
                      </View>
                    ) : null}
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
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.rail, { paddingHorizontal: 16 }]} style={{ marginHorizontal: -16, marginTop: 14 }}>
              {bizSorted.map((e) => {
                const left = Math.max(0, e.seatsTotal - e.seatsTaken);
                return (
                  <Pressable key={e.id} onPress={() => router.push(`/event/${e.id}`)} style={[styles.acard, styles.acardV]}>
                    {e.photoUrl ? (
                      <Image source={{ uri: e.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <LinearGradient colors={["#6C3BFF", "#FF6FA0"]} style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }]}>
                        <Image source={{ uri: eventIcon(e) }} style={{ width: 90, height: 90 }} />
                      </LinearGradient>
                    )}
                    <LinearGradient colors={["rgba(10,5,25,0.15)", "rgba(0,0,0,0)", "rgba(10,5,25,0.85)"]} locations={[0, 0.35, 0.8]} style={StyleSheet.absoluteFill} />
                    <View style={styles.acTop}>
                      {e.isLive ? (
                        <Pill kind="live" label="Идёт сейчас" />
                      ) : e.isBoosted ? (
                        <View style={styles.acBoost}>
                          <Icon name="up" size={12} color="#fff" />
                          <Text style={styles.acBoostText}>В топе</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.vb}>
                      <Text style={styles.acTitle} numberOfLines={2}>{e.title}</Text>
                      <View style={styles.vm}>
                        <Icon name="cal" size={13} color="rgba(255,255,255,0.85)" />
                        <Text style={styles.acMeta} numberOfLines={1}>{dayShort(e.eventDate)}, {e.eventTime.slice(0, 5)}</Text>
                        <Text style={styles.acMeta}> • </Text>
                        <Icon name="people" size={13} color="rgba(255,255,255,0.85)" />
                        <Text style={styles.acMeta} numberOfLines={1}>{left > 0 ? `${left} ${plural(left, "место", "места", "мест")}` : "мест нет"}</Text>
                      </View>
                      <View style={styles.vr}>
                        <View style={[styles.acPrice, { marginTop: 0, flexShrink: 1 }]}>
                          <Text style={styles.acPriceText} numberOfLines={1}>{costShort(e)}</Text>
                        </View>
                        {e.organizer?.avatarUrl ? (
                          <Image source={{ uri: e.organizer.avatarUrl }} style={styles.aava} contentFit="cover" />
                        ) : (
                          <LinearGradient colors={["#6C3BFF", "#FF6FA0"]} style={[styles.aava, { alignItems: "center", justifyContent: "center" }]}>
                            <Text style={styles.aavaText}>{(e.organizer?.name ?? "Б").charAt(0).toUpperCase()}</Text>
                          </LinearGradient>
                        )}
                      </View>
                    </View>
                  </Pressable>
                );
              })}
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

/** Цифра непрочитанных в чатах: подпрыгивает и расходится розовым кольцом. */
function PulseCount({ n }: { n: number }) {
  const v = useMemo(() => new Animated.Value(0), []);
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const scale = v.interpolate({ inputRange: [0, 0.12, 0.26, 1], outputRange: [1, 1.28, 1, 1] });
  const ring = v.interpolate({ inputRange: [0, 1], outputRange: [1, 2.4] });
  const ringOp = v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0.5, 0, 0] });
  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.cnt, { backgroundColor: colors.pink, opacity: ringOp, transform: [{ scale: ring }] }]} />
      <Animated.View style={[styles.cnt, { transform: [{ scale }] }]}>
        <Text style={styles.cntText}>{n > 9 ? "9+" : n}</Text>
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  topBtns: { flexDirection: "row", gap: 8 },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  locSmall: { fontFamily: FONT, fontSize: 12.5, color: colors.grey },
  locRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locCity: { fontSize: 17, ...f("500"), color: colors.ink },
  cnt: { position: "absolute", top: 3, right: 3, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: colors.pink, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  cntText: { color: "#fff", fontSize: 10.5, ...f("600") },
  ttl: { marginTop: 18 },
  reqWrap: { marginTop: 16 },
  req: { borderRadius: 24, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingLeft: 12, paddingRight: 14 },
  reqAva: { width: 46, height: 46, borderRadius: 23, borderWidth: 2, borderColor: "#fff" },
  reqAvaEmpty: { backgroundColor: "rgba(255,255,255,0.25)", alignItems: "center", justifyContent: "center" },
  reqAvaText: { color: "#fff", fontSize: 18, ...f("700") },
  reqCnt: { position: "absolute", right: -7, bottom: -4, backgroundColor: "#fff", borderRadius: 99, paddingHorizontal: 5, paddingVertical: 1 },
  reqCntText: { color: colors.violet, fontSize: 11, ...f("800") },
  reqSmall: { fontFamily: FONT, color: "rgba(255,255,255,0.85)", fontSize: 12.5 },
  reqBig: { color: "#fff", fontSize: 15.5, ...f("600") },
  search: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16 },
  sfield: { flex: 1, height: 50, borderRadius: 999, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 },
  sinput: { flex: 1, fontFamily: FONT, fontSize: 15, color: colors.ink, height: 50 },
  railOut: { marginHorizontal: -20 },
  cats: { gap: 8, paddingHorizontal: 20, paddingVertical: 4, marginTop: 10 },
  cat: { flexDirection: "row", alignItems: "center", gap: 6, height: 46, paddingLeft: 6, paddingRight: 16, borderRadius: 999 },
  catIcon: { width: 38, height: 38 },
  catText: { fontSize: 14, ...f("500"), color: colors.ink },
  rail: { gap: 12, paddingHorizontal: 20, paddingTop: 4, paddingBottom: 14 },
  empty: { borderRadius: 32, padding: 24, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: 18, ...f("500"), color: colors.ink },
  emptyText: { fontFamily: FONT, fontSize: 14, color: colors.grey, textAlign: "center" },
  emptyBtn: { marginTop: 10, backgroundColor: colors.ink, borderRadius: 999, height: 44, paddingHorizontal: 20, justifyContent: "center" },
  emptyBtnText: { color: "#fff", fontSize: 15, ...f("500") },
  pcard: { width: 172, height: 244, borderRadius: 28, overflow: "hidden", backgroundColor: colors.lavender100 },
  pInit: { alignItems: "center", justifyContent: "center" },
  pInitText: { color: "#fff", fontSize: 48, ...f("500") },
  pTag: { position: "absolute", top: 10, left: 10, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 999, paddingHorizontal: 9, height: 26, justifyContent: "center" },
  pTagText: { fontFamily: FONT, color: "#fff", fontSize: 11.5 },
  pInfo: { position: "absolute", left: 12, right: 12, bottom: 10 },
  pDist: { alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(255,255,255,0.25)", borderRadius: 999, paddingLeft: 6, paddingRight: 8, height: 22, marginBottom: 4 },
  pDistText: { color: "#fff", fontSize: 11.5, ...f("600") },
  geo: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 24, paddingVertical: 8, paddingLeft: 8, paddingRight: 14 },
  geoIc: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.ink, alignItems: "center", justifyContent: "center" },
  geoTitle: { fontSize: 15.5, ...f("500"), color: colors.ink },
  geoText: { fontFamily: FONT, fontSize: 13, lineHeight: 17, color: colors.grey },
  pName: { color: "#fff", fontSize: 17, ...f("500") },
  pSub: { fontFamily: FONT, color: "rgba(255,255,255,0.9)", fontSize: 12 },
  afisha: { marginTop: 26, borderRadius: 30, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 16, overflow: "hidden" },
  acardV: { width: 210, height: 290, borderRadius: 24 },
  acBoost: { flexDirection: "row", alignItems: "center", gap: 4, height: 26, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,0.2)", borderWidth: 1, borderColor: "rgba(255,255,255,0.3)" },
  acBoostText: { color: "#fff", fontSize: 11.5, ...f("600") },
  vb: { position: "absolute", left: 8, right: 8, bottom: 8, padding: 11, borderRadius: 18, backgroundColor: "rgba(18,10,40,0.55)", gap: 6 },
  vm: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 3 },
  vr: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 3 },
  aava: { width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)", overflow: "hidden" },
  aavaText: { color: "#fff", fontSize: 13, ...f("700") },
  afHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" },
  afAll: { color: "rgba(255,255,255,0.85)", fontSize: 14.5, ...f("500") },
  invite: { backgroundColor: "rgba(255,255,255,0.1)", borderWidth: 1, borderColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center", padding: 18, gap: 8 },
  invTitle: { color: "#fff", fontSize: 16, ...f("500"), textAlign: "center" },
  invText: { fontFamily: FONT, color: "rgba(255,255,255,0.75)", fontSize: 12.5, textAlign: "center" },
  afSmall: { fontFamily: FONT, color: "rgba(255,255,255,0.6)", fontSize: 11.5, letterSpacing: 0.8 },
  afTitle: { color: "#fff", fontSize: 19, ...f("500"), letterSpacing: -0.4, marginTop: 2 },
  acard: { width: 210, height: 290, borderRadius: 24, overflow: "hidden", backgroundColor: "#2A1650" },
  acTop: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", gap: 6, flexWrap: "wrap" },
  acOrg: { backgroundColor: "rgba(255,255,255,0.22)", borderRadius: 999, height: 28, paddingHorizontal: 10, justifyContent: "center", maxWidth: 140 },
  acOrgText: { color: "#fff", fontSize: 12.5, ...f("500") },
  acBody: { position: "absolute", left: 12, right: 12, bottom: 12, gap: 4 },
  acTitle: { color: "#fff", fontSize: 16, lineHeight: 20, ...f("500") },
  acMeta: { fontFamily: FONT, color: "rgba(255,255,255,0.85)", fontSize: 12.5 },
  acPrice: { alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: 999, height: 28, paddingHorizontal: 11, justifyContent: "center", marginTop: 4 },
  acPriceText: { fontSize: 12.5, ...f("500"), color: colors.ink },
});
