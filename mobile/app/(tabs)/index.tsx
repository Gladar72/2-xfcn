import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, AppState, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { Image } from "expo-image";
import { api } from "@/lib/api";
import { CitySheet } from "@/components/CitySheet";
import { cityWhen, KIND_LABEL, type CityEvent } from "@/lib/cityEvents";
import { tapOk } from "@/lib/feedback";
import { catIcon, CATEGORY_SHORT } from "@/lib/theme";
import { plural } from "@/lib/format";
import { coverUri } from "@/lib/covers";
import type { Category, FeedEvent, MyProfile, PersonCard } from "@/lib/types";
import { useGuide } from "@/lib/guide";
import { fetchPendingApplications, type PendingApplications } from "@/lib/pending";
import { refreshLocationSilently, shareLocation } from "@/lib/location";
import { B, K, KBiz, KChip, KGlass, KI, KMos, KPressGlass, KRb, KSec, KTitle, PearlBg, PhotoShade, Press, kf, StatusShade } from "@/components/k";
import { HC_H, HC_W, KHc, KHcSkeleton, KInv, KMosaic, TwoLine } from "@/components/k/cards";

interface MyEvent { id: string; title: string; eventDate: string; eventTime: string; role?: string; myStatus?: "member" | "pending" }

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
  const [peopleLoaded, setPeopleLoaded] = useState(false);
  // «Ты в деле» / «Заявка отправлена» — плашка с Мосей, как в мини-аппе.
  const [plans, setPlans] = useState<{ ev: MyEvent; label: string; tail: string }[]>([]);
  // Несколько встреч — плашка по очереди рассказывает о каждой (каждые 4 с, мягкая смена).
  const [pi, setPi] = useState(0);
  const fadeP = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (plans.length < 2) return;
    const t = setInterval(() => {
      Animated.timing(fadeP, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
        setPi((i) => (i + 1) % plans.length);
        Animated.timing(fadeP, { toValue: 1, duration: 260, useNativeDriver: true }).start();
      });
    }, 4000);
    return () => clearInterval(t);
  }, [plans.length, fadeP]);
  const plan = plans.length ? plans[pi % plans.length]! : null;
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
      .catch(() => {})
      .finally(() => setPeopleLoaded(true));
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
      api<{ items?: MyEvent[]; events?: MyEvent[] }>("/api/me/events?scope=upcoming")
        .then((d) => {
          // «Ты в деле» — только если заявку приняли; если ещё ждём ответа — так и пишем.
          const mine = (d.items ?? d.events ?? []).filter((e) => e.role !== "organizer");
          // Одобрили — «Ты в деле · …, через 2 дня»; ждём ответа — «Заявка отправлена · … — ждём ответа».
          const sorted = [...mine].sort((a, b) => `${a.eventDate} ${a.eventTime}`.localeCompare(`${b.eventDate} ${b.eventTime}`));
          const list = [...sorted.filter((e) => e.myStatus !== "pending"), ...sorted.filter((e) => e.myStatus === "pending")].slice(0, 6);
          setPlans(list.map((e) => (e.myStatus === "pending" ? { ev: e, label: "Заявка отправлена", tail: " — ждём ответа организатора" } : { ev: e, label: "Ты в деле", tail: ` — ${inDays(e.eventDate, e.eventTime)}` })));
        })
        .catch(() => {});
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

  // «Личные встречи» — только встречи людей, продвинутые первыми; бизнес — в «Афише заведений».
  const popular = useMemo(() => {
    const personal = (events ?? []).filter((e) => !e.isBusiness);
    return [...personal.filter((e) => e.isPromoted), ...personal.filter((e) => !e.isPromoted)];
  }, [events]);
  const bizSorted = useMemo(() => [...biz.filter((e) => e.isPromoted || e.isBoosted), ...biz.filter((e) => !(e.isPromoted || e.isBoosted))], [biz]);
  // Заявка «ждём ответа» тоже показывается плашкой (если нет подтверждённой).
  const shownPlan = plan ?? (() => {
    const p = (events ?? []).find((e) => e.myApplicationStatus === "pending");
    return p ? { ev: { id: p.id, title: p.title, eventDate: p.eventDate, eventTime: p.eventTime }, label: "Заявка отправлена", tail: " — ждём ответа организатора" } : null;
  })();

  return (
    <View style={{ flex: 1, backgroundColor: K.pearl }}>
      <PearlBg />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 20, paddingBottom: insets.bottom + 86 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={K.ink} />}
      >
        {/* .k-top: город и колокольчик */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <KPressGlass onPress={() => setCityOpen(true)} style={{ height: 40, borderRadius: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 7, height: 40, paddingHorizontal: 14 }}>
              <View style={{ marginLeft: -4 }}><KI n="pin" size={22} /></View>
              <Text style={kf("500", 14)}>{city ?? "…"}</Text>
              <KI n="down" size={22} />
            </View>
          </KPressGlass>
          <KRb icon="bell" dot={notifUnread > 0} onPress={() => router.push("/notifications")} accessibilityLabel="Уведомления" />
        </View>

        {/* .k-h1 38 px */}
        <KTitle parts={["Найди ", { em: "компанию" }, "\nна сегодня"]} size={38} style={{ marginTop: 20 }} />

        {/* Один ряд: лупа → «Все» → категории → «Фильтры» (.k-hs, gap 8) */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 14 }} contentContainerStyle={{ gap: 8, paddingHorizontal: 20 }}>
          <KChip icon="search" padH={11} onPress={() => router.push("/search")} />
          <KChip label="Все" on />
          {categories.map((c) => (
            <KChip key={c.slug} label={CATEGORY_SHORT[c.slug] ?? c.name} iconUri={catIcon(c.slug)} onPress={() => router.push({ pathname: "/search", params: { categories: c.slug } })} />
          ))}
          <KChip icon="filter" label="Фильтры" onPress={() => router.push({ pathname: "/search", params: { filters: "1" } })} />
        </ScrollView>

        {/* Плашка с Мосей: новая заявка → «ты в деле» → кто свободен рядом */}
        {req?.latest ? (
          <KMos go="Открыть" onPress={() => router.push(`/applications/${req.latest!.eventId}` as Href)}>
            <B>{`${req.latest.name}${req.latest.age ? `, ${req.latest.age}` : ""}`}</B> хочет на «{req.latest.eventTitle}»{req.count > 1 ? ` · ещё ${req.count - 1}` : ""}
          </KMos>
        ) : shownPlan ? (
          <Animated.View style={{ opacity: fadeP }}>
            <KMos go="Открыть" onPress={() => router.push(`/event/${shownPlan.ev.id}` as Href)}>
              <B>{shownPlan.label}</B> · {shownPlan.ev.title}, {whenText(shownPlan.ev.eventDate, shownPlan.ev.eventTime)}
              {shownPlan.tail}
              {plans.length > 1 ? `  ${(pi % plans.length) + 1}/${plans.length}` : ""}
            </KMos>
          </Animated.View>
        ) : (
          <KMos go="Найти" onPress={() => router.push("/people")}>
            {people.length > 0 ? (
              <>
                <B>{people.length} {plural(people.length, "человек", "человека", "человек")}</B> рядом {people.length === 1 ? "свободен" : "свободны"} сегодня вечером
              </>
            ) : (
              <>
                <B>Найди компанию</B> — посмотри, кто рядом
              </>
            )}
          </KMos>
        )}

        <KSec plain="Личные" em="встречи" sub="Планы людей рядом — присоединяйся" action="Все" onAction={() => router.push("/search")} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -20, marginTop: 12 }} contentContainerStyle={{ gap: 16, paddingHorizontal: 20 }} snapToInterval={HC_W + 16} decelerationRate="fast">
          {events === null
            ? [0, 1, 2].map((i) => <KHcSkeleton key={i} />)
            : popular.length === 0
              ? <KInv text="Сегодня пока тихо — создай первую встречу" onPress={() => router.push("/create")} />
              : popular.map((e) => <KHc key={e.id} e={e} />)}
        </ScrollView>

        <KSec plain="Люди" em="в твоём городе" sub="С общими интересами" action="Листать" onAction={() => router.push(people[0] ? { pathname: "/people", params: { start: people[0].id } } : "/people")} />
        {!meHasLoc ? (
          <KMos onPress={allowGeo} left={<View style={{ marginLeft: 8, width: 44, height: 44, borderRadius: 22, backgroundColor: K.ink, alignItems: "center", justifyContent: "center" }}>{geoBusy ? <ActivityIndicator color="#fff" /> : <KI n="pin" color="#fff" />}</View>}>
            <B>{geoBusy ? "Ищем, кто рядом…" : "Показать, кто рядом"}</B> — точный адрес никто не узнает
          </KMos>
        ) : null}
        {peopleLoaded && people.length === 0 ? (
          <Text style={[kf("400", 14, { lh: 1.45, color: K.ink2 }), { marginTop: 12 }]}>Пока нет анкет в выбранном городе. Можно сменить город или создать встречу.</Text>
        ) : null}
        <KMosaic people={people} city={city} onOpen={(q) => router.push({ pathname: "/people", params: { start: q.id } })} />

        <KBiz>
          <KSec plain="Афиша" em="заведений" sub="События кафе, баров и площадок" action="Все" onAction={() => router.push("/business")} style={{ marginTop: 0 }} />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -14, marginTop: 12 }} contentContainerStyle={{ gap: 16, paddingHorizontal: 14 }} snapToInterval={HC_W + 16} decelerationRate="fast">
            {bizSorted.map((e) => <KHc key={e.id} e={e} />)}
            {cityEvents.map((c) => <KCityCard key={c.id} c={c} />)}
            <KInv text="Здесь может быть ваше бизнес‑событие" onPress={() => router.push({ pathname: "/create", params: { business: "true" } })} />
          </ScrollView>
        </KBiz>
      </ScrollView>
      <StatusShade top={insets.top} />
      <CitySheet visible={cityOpen} value={city} onPick={changeCity} onClose={() => setCityOpen(false)} />
    </View>
  );
}

/** Карточка «Что ещё в городе» — та же .k-hc. */
function KCityCard({ c }: { c: CityEvent }) {
  const cover = coverUri(c.photoUrl);
  return (
    <Press photo onPress={() => router.push(`/city/${c.id}` as Href)} style={{ width: HC_W, height: HC_H, borderRadius: 26, backgroundColor: "#282330" }}>
      {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <View style={[StyleSheet.absoluteFill, { backgroundColor: "#2B2737" }]} />}
      <PhotoShade from={0.38} to={0.78} />
      <KGlass tone="gw" style={{ position: "absolute", top: 10, left: 10, maxWidth: HC_W - 20, height: 28, borderRadius: 14, justifyContent: "center", paddingHorizontal: 10 }}>
        <Text style={kf("400", 12, { color: "#fff" })} numberOfLines={1}>{KIND_LABEL[c.kind ?? ""] ?? "В городе"}</Text>
      </KGlass>
      <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
        <TwoLine text={c.title} />
        <Text style={[kf("400", 11.5, { color: "#fff" }), { opacity: 0.85, marginTop: 4 }]} numberOfLines={1}>{[cityWhen(c), c.placeName].filter(Boolean).join(" · ")}</Text>
        <View style={{ alignSelf: "flex-start", marginTop: 8, height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.92)", justifyContent: "center" }}>
          <Text style={kf("600", 12)} numberOfLines={1}>{c.priceText || "Подробнее"}</Text>
        </View>
      </View>
    </Press>
  );
}

/** «через 2 дня», «завтра», «сегодня в 18:00», «через 3 часа». */
function inDays(dateIso: string, time: string) {
  const [y = 1970, m = 1, d = 1] = dateIso.slice(0, 10).split("-").map(Number);
  const [h = 0, mi = 0] = time.split(":").map(Number);
  const at = new Date(y, m - 1, d, h, mi);
  const now = new Date();
  const days = Math.round((new Date(y, m - 1, d).getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 864e5);
  if (days <= 0) {
    const hrs = Math.round((at.getTime() - now.getTime()) / 36e5);
    return hrs >= 1 ? `через ${hrs} ${plural(hrs, "час", "часа", "часов")}` : "уже скоро";
  }
  if (days === 1) return "уже завтра";
  return `через ${days} ${plural(days, "день", "дня", "дней")}`;
}

function whenText(dateIso: string, time: string) {
  const d = new Date(dateIso);
  const t = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / 86400000);
  const day = diff === 0 ? "сегодня" : diff === 1 ? "завтра" : d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  return `${day}, ${time.slice(0, 5)}`;
}
