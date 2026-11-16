// Профиль — перенос app/(app)/profile/page.tsx мини-аппа один в один (.k-pp):
// фото сверху стоит на месте и растворяется в перламутре, контент едет поверх него.
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Dimensions, Linking, ScrollView, Share, StyleSheet, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useFocusEffect, type Href } from "expo-router";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { api } from "@/lib/api";
import { API_URL } from "@/lib/config";
import { plural } from "@/lib/format";
import { PLAN_NAME, PLAN_PRICE_RUB, type Subscription } from "@/lib/subscription";
import { interestIcon } from "@/lib/interests";
import type { MyProfile } from "@/lib/types";
import { useGuide } from "@/lib/guide";
import { FadeImage } from "@/components/k/FadeImage";
import { Sheet } from "@/components/Sheet";
import { K, KChip, KGlass, KI, KPressGlass, KRb, KSec, KTitle, PearlBg, Press, kf } from "@/components/k";

const { height: SCREEN_H, width: SCREEN_W } = Dimensions.get("window");
// .k-hero2 height:min(600px,78vh), .k-spacer height:min(440px,56vh)
const HERO_H = Math.min(600, SCREEN_H * 0.78);
const SPACER = Math.min(440, SCREEN_H * 0.56);

type Tab = "followers" | "following";
interface FollowSummary { followers: number; following: number; followersPreview: { id: string; avatarUrl: string }[]; followingPreview: { id: string; avatarUrl: string }[] }

export default function ProfileScreen() {
  useGuide("profile");
  const insets = useSafeAreaInsets();
  const [me, setMe] = useState<MyProfile | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [follows, setFollows] = useState<FollowSummary | null>(null);
  const [open, setOpen] = useState<Tab | null>(null);
  const [counts, setCounts] = useState([0, 0, 0]);
  const scrollY = useRef(new Animated.Value(0)).current;

  const loadFollows = useCallback(() => {
    api<FollowSummary>("/api/me/follows?summary=1").then(setFollows).catch(() => {});
  }, []);
  useFocusEffect(
    useCallback(() => {
      api<MyProfile>("/api/me/profile").then(setMe).catch(() => {});
      api<Subscription>("/api/subscriptions").then(setSub).catch(() => {});
      loadFollows();
    }, [loadFollows])
  );

  // Счётчики «докручиваются» от нуля за 0.9 с, как в мини-аппе.
  useEffect(() => {
    if (!me) return;
    const target = [me.eventsOrganizedCount, me.eventsAttendedCount, me.completedMeetingsCount];
    const st = Date.now();
    let raf = 0;
    const step = () => {
      const k = Math.min(1, (Date.now() - st) / 900);
      const e = 1 - Math.pow(1 - k, 3);
      setCounts(target.map((t) => Math.round(t * e)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [me]);

  const photos = me?.photos ?? [];
  const main = me?.avatarUrl ?? photos[0] ?? null;
  const all = [main, ...photos.filter((u) => u !== main)].filter((u): u is string => !!u).slice(0, 6);
  const [first, ...rest] = (me?.name ?? "").split(" ");
  const meetings = me ? me.eventsOrganizedCount + me.eventsAttendedCount : 0;
  const lim = sub?.events?.limit ?? null;
  const used = sub?.events?.used ?? 0;
  const pct = sub?.active ? (lim ? Math.min(100, Math.round((used / lim) * 100)) : 100) : 0;

  async function shareProfile() {
    if (!me) return;
    await Share.share({ message: `${API_URL}/people/${me.id}` }).catch(() => {});
  }

  const MENU: [string, string][] = [
    ["Уведомления", "/notifications"],
    ["Отзывы после встреч", "/reviews"],
    ["Партнёрская программа", "https://t.me/Mesto_people_bot?start=partner"],
    ["Приватность и анонимность", "/privacy"],
  ];

  // Фото не прокручивается вместе с текстом: при потягивании вниз чуть увеличивается, при прокрутке вверх — уходит медленнее.
  const heroScale = scrollY.interpolate({ inputRange: [-200, 0], outputRange: [1.25, 1], extrapolateRight: "clamp" });
  const heroShift = 0; // как в мини-аппе: фото стоит на месте, страница едет поверх него

  return (
    <View style={{ flex: 1, backgroundColor: K.pearl }}>
      <PearlBg />
      {/* .k-hero2: фото с маской — снизу растворяется (78% → прозрачно) */}
      <Animated.View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, height: HERO_H, transform: [{ translateY: heroShift }, { scale: heroScale }] }}>
        {main ? (
          <FadeImage uri={main} width={SCREEN_W} height={HERO_H} from={0.5} to={1} focusY={0.25} style={StyleSheet.absoluteFill} />
        ) : (
          <LinearGradient colors={["#D9D3E6", "#F4F2F8"]} style={StyleSheet.absoluteFill} />
        )}

      </Animated.View>

      <Animated.ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 90 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
      >
        <View style={{ height: SPACER }} />
        {!me ? (
          <View style={{ height: 220, borderRadius: 24, backgroundColor: "rgba(23,20,31,0.06)" }} />
        ) : (
          <>
            <KTitle
              parts={rest.length ? [first + " ", { em: rest.join(" ") }] : me.age ? [first + ", ", { em: String(me.age) }] : [first]}
              size={38}
              lh={1.14}
              style={{ textAlign: "center" }}
            />
            <Text style={[kf("400", 13, { color: K.ink2 }), { textAlign: "center", marginTop: 4 }]}>
              {[me.city, `${meetings} ${plural(meetings, "встреча", "встречи", "встреч")}`, me.ratingAvg > 0 ? `${me.ratingAvg.toFixed(1).replace(".", ",")} ★` : null].filter(Boolean).join(" · ")}
            </Text>
            {(me.interests ?? []).length > 0 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6, marginTop: 12 }}>
                {(me.interests ?? []).slice(0, 6).map((i) => (
                  <KChip key={i.id} label={i.name} iconUri={interestIcon(i.name)} height={32} onPress={() => router.push("/interests")} />
                ))}
              </View>
            ) : null}

            {/* .k-plan */}
            <KPressGlass onPress={() => router.push("/subscription")} style={{ marginTop: 14, borderRadius: 24 }}>
              <View style={{ paddingVertical: 14, paddingHorizontal: 16, gap: 8 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={kf("500", 11, { ls: 0.06, color: K.ink3 })}>ТВОЙ ТАРИФ</Text>
                    <Text style={[kf("500", 20), { marginTop: 2 }]}>
                      {sub?.active && sub.plan ? PLAN_NAME[sub.plan] : "Без тарифа"}
                      {sub?.active && sub.plan ? <Text style={kf("400", 13, { color: K.ink2 })}>{"  "}{PLAN_PRICE_RUB[sub.plan]} ₽/мес</Text> : null}
                    </Text>
                  </View>
                  <View style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, backgroundColor: K.ink, justifyContent: "center" }}>
                    <Text style={kf("500", 13, { color: "#fff" })}>{sub?.active ? "Сменить" : "Выбрать"}</Text>
                  </View>
                </View>
                <View style={{ height: 5, borderRadius: 3, backgroundColor: "rgba(23,20,31,0.08)", overflow: "hidden" }}>
                  <View style={{ width: `${pct}%`, height: "100%", backgroundColor: K.ink, borderRadius: 3 }} />
                </View>
                <Text style={kf("400", 12, { color: K.ink2 })}>
                  {sub?.active
                    ? `Встречи ${used} из ${lim ?? "∞"}${sub.boosts ? ` · топ ${sub.boosts.used} из ${sub.boosts.limit ?? "∞"}` : ""}${sub.periodEnd ? ` · до ${new Date(sub.periodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""}`
                    : "Подключи, чтобы создавать свои встречи"}
                </Text>
              </View>
            </KPressGlass>

            {/* .k-acts .k-btn.k-l */}
            <Press onPress={() => router.push("/profile-edit")} style={{ marginTop: 16, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.65)", borderWidth: 1, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}>
              <Text style={kf("500", 15)}>Редактировать профиль</Text>
            </Press>

            {follows ? (
              <>
                <KSec plain="Мои" em="подписки" />
                <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
                  <SubCard label={plural(follows.followers, "подписчик", "подписчика", "подписчиков")} n={follows.followers} prev={follows.followersPreview} onPress={() => setOpen("followers")} />
                  <SubCard label={plural(follows.following, "подписка", "подписки", "подписок")} n={follows.following} prev={follows.followingPreview} onPress={() => setOpen("following")} />
                </View>
                <Text style={[kf("400", 12.5, { lh: 1.35, color: "rgba(23,20,31,0.55)" }), { marginTop: 10, marginHorizontal: 2 }]}>
                  Новые встречи тех, на кого ты подписан, приходят в уведомления
                </Text>
              </>
            ) : null}

            <KSec plain="Мои" em="фото" action="Изменить" onAction={() => router.push("/profile-edit")} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
              {all.slice(0, all.length < 6 ? 5 : 6).map((u) => (
                <Press key={u} photo onPress={() => router.push("/profile-edit")} style={{ width: PH_W, height: (PH_W * 4) / 3, borderRadius: 18, backgroundColor: "#2B2737" }}>
                  <Image source={{ uri: u }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />
                </Press>
              ))}
              {all.length < 6 ? (
                <KPressGlass onPress={() => router.push("/profile-edit")} style={{ width: PH_W, height: (PH_W * 4) / 3, borderRadius: 18, alignItems: "center", justifyContent: "center" }}>
                  <Text style={kf("300", 30, { color: K.ink2 })}>+</Text>
                </KPressGlass>
              ) : null}
            </View>

            <KSec style={{ marginTop: 18 }} plain="Мои" em="встречи" sub={`${counts[0]} создано · ${counts[1]} посещено · ${counts[2]} состоялось`} action="Все" onAction={() => router.navigate("/(tabs)/meet")} />
            <View style={{ gap: 10, marginTop: 14 }}>
              {MENU.map(([t, href]) => (
                <KRow key={t} label={t} onPress={() => (href.startsWith("http") ? Linking.openURL(href) : router.push(href as Href))} />
              ))}
              <KRow label="Как меня видят другие" onPress={() => router.push(`/person/${me.id}?self=1` as Href)} />
            </View>
          </>
        )}
      </Animated.ScrollView>

      {/* .k-tbar: поделиться и настройки — стоят на месте поверх фото */}
      <View style={{ position: "absolute", top: insets.top + 8, left: 16, right: 16, flexDirection: "row", justifyContent: "space-between" }}>
        <KRb icon="share" tone="gw" onPress={shareProfile} accessibilityLabel="Поделиться профилем" />
        <KRb icon="more" tone="gw" onPress={() => router.push("/settings")} accessibilityLabel="Настройки" />
      </View>

      <FollowsSheet tab={open} counts={[follows?.followers ?? 0, follows?.following ?? 0]} onTab={setOpen} onClose={() => { setOpen(null); loadFollows(); }} />
    </View>
  );
}

const PH_W = Math.floor((SCREEN_W - 40 - 16) / 3);

/** .k-row: строка меню (54 px, скругление 22, стрелка). */
export function KRow({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <KPressGlass onPress={onPress} style={{ minHeight: 54, borderRadius: 22 }}>
      <View style={{ minHeight: 54, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingLeft: 18, paddingRight: 16 }}>
        <Text style={[kf("400", 15), { flex: 1 }]}>{label}</Text>
        <KI n="chev" size={18} color={K.ink3} />
      </View>
    </KPressGlass>
  );
}

/** .k-subc: карточка «подписчики / подписки». */
function SubCard({ label, n, prev, onPress }: { label: string; n: number; prev: { id: string; avatarUrl: string }[]; onPress: () => void }) {
  return (
    <View style={{ flex: 1 }}>
      <KPressGlass onPress={onPress} style={{ borderRadius: 24 }} accessibilityLabel={`${label}: ${n}. Открыть список`}>
        <View style={{ paddingVertical: 14, paddingHorizontal: 16 }}>
          <View style={{ position: "absolute", top: 10, right: 10, width: 30, height: 30, borderRadius: 15, backgroundColor: "rgba(255,255,255,0.7)", borderWidth: 1, borderColor: "rgba(255,255,255,0.95)", alignItems: "center", justifyContent: "center" }}>
            <KI n="arrowUpRight" size={16} sw={1.8} />
          </View>
          <Text style={[kf("400", 11, { ls: 0.06, color: K.ink3 }), { paddingRight: 36 }]} numberOfLines={1}>{label.toUpperCase()}</Text>
          <Text style={[kf("400", 28, { color: K.ink }), { letterSpacing: -0.6, marginTop: 4 }]}>{n}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", height: 30, marginTop: 10 }}>
            {prev.length ? (
              prev.map((p, i) => (
                <Image key={p.id} source={{ uri: p.avatarUrl }} style={{ width: 30, height: 30, borderRadius: 15, borderWidth: 2, borderColor: "#fff", marginLeft: i ? -8 : 0 }} contentFit="cover" />
              ))
            ) : (
              <Text style={kf("400", 12.5, { color: "rgba(23,20,31,0.45)" })}>пока никого</Text>
            )}
          </View>
        </View>
      </KPressGlass>
    </View>
  );
}

interface FollowPerson { id: string; name: string; age: number | null; city: string | null; avatarUrl: string | null; iFollow: boolean; followsMe: boolean }

/** Шторка «Мои подписки»: переключатель, поиск, список с кнопкой подписки. */
function FollowsSheet({ tab, counts, onTab, onClose }: { tab: Tab | null; counts: [number, number]; onTab: (t: Tab) => void; onClose: () => void }) {
  const [items, setItems] = useState<FollowPerson[] | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    if (!tab) return;
    setItems(null);
    const t = setTimeout(() => {
      api<{ items: FollowPerson[] }>(`/api/me/follows?tab=${tab}&q=${encodeURIComponent(q)}`)
        .then((d) => setItems(d.items ?? []))
        .catch(() => setItems([]));
    }, q ? 250 : 0);
    return () => clearTimeout(t);
  }, [tab, q]);

  async function toggle(p: FollowPerson) {
    if (busy) return;
    setBusy(p.id);
    const on = !p.iFollow;
    setItems((list) => list?.map((x) => (x.id === p.id ? { ...x, iFollow: on } : x)) ?? null);
    const ok = await api("/api/follows", { method: on ? "POST" : "DELETE", body: { userId: p.id } }).then(() => true).catch(() => false);
    if (!ok) setItems((list) => list?.map((x) => (x.id === p.id ? { ...x, iFollow: !on } : x)) ?? null);
    setBusy(null);
  }

  return (
    <Sheet visible={!!tab} onClose={onClose}>
      <KTitle parts={["Мои ", { em: "подписки" }]} size={26} />
      {/* .seg: переключатель с плавающей подложкой */}
      <KGlass style={{ marginTop: 12, height: 44, borderRadius: 22, padding: 4 }}>
        <View style={{ flex: 1, flexDirection: "row" }}>
          <View style={{ position: "absolute", top: 0, bottom: 0, width: "50%", left: tab === "following" ? "50%" : 0, borderRadius: 18, backgroundColor: K.ink }} />
          {(["followers", "following"] as Tab[]).map((t, i) => (
            <Press key={t} onPress={() => onTab(t)} style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
              <Text style={kf("500", 13.5, { color: tab === t ? "#fff" : K.ink })}>{t === "followers" ? "Подписчики" : "Подписки"} · {counts[i]}</Text>
            </Press>
          ))}
        </View>
      </KGlass>
      <KGlass style={{ marginTop: 10, height: 46, borderRadius: 23 }}>
        <View style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16 }}>
          <View style={{ opacity: 0.5 }}><KI n="search" size={18} /></View>
          <TextInput value={q} onChangeText={setQ} placeholder="Найти по имени" placeholderTextColor={K.ink3} style={[kf("400", 15), { flex: 1 }]} />
        </View>
      </KGlass>
      <ScrollView style={{ maxHeight: SCREEN_H * 0.5, marginTop: 10 }} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
        {items === null ? <Text style={[kf("400", 14, { color: K.ink2 }), { textAlign: "center", padding: 18 }]}>Загружаем…</Text> : null}
        {items?.length === 0 ? (
          <Text style={[kf("400", 14, { color: K.ink2 }), { textAlign: "center", padding: 18 }]}>
            {q ? "Никого не нашли" : tab === "followers" ? "Пока на тебя никто не подписан — создавай встречи, и люди подтянутся" : "Ты пока ни на кого не подписан. Подписаться можно в профиле человека — колокольчик"}
          </Text>
        ) : null}
        {items?.map((p) => (
          <KGlass key={p.id} style={{ borderRadius: 20 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, paddingHorizontal: 12 }}>
              <Press photo onPress={() => router.push(`/person/${p.id}` as Href)} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12 }}>
                <Image source={{ uri: p.avatarUrl ?? `${API_URL}/brand/creature/blobe.webp` }} style={{ width: 48, height: 48, borderRadius: 24 }} contentFit="cover" />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={kf("500", 15.5)} numberOfLines={1}>{p.name}{p.age ? `, ${p.age}` : ""}</Text>
                  <Text style={kf("400", 13, { color: K.ink2 })} numberOfLines={1}>{[p.city, p.followsMe && tab === "following" ? "подписан(а) на тебя" : null].filter(Boolean).join(" · ")}</Text>
                </View>
              </Press>
              <Press onPress={() => toggle(p)} disabled={busy === p.id} dark={!p.iFollow} style={{ height: 34, paddingHorizontal: 14, borderRadius: 17, justifyContent: "center", backgroundColor: p.iFollow ? "rgba(23,20,31,0.06)" : K.ink }}>
                <Text style={kf("500", 13, { color: p.iFollow ? K.ink : "#fff" })}>{p.iFollow ? (p.followsMe ? "Взаимно" : "Подписан") : p.followsMe ? "В ответ" : "Подписаться"}</Text>
              </Press>
            </View>
          </KGlass>
        ))}
      </ScrollView>
    </Sheet>
  );
}
