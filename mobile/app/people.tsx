import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Easing, PanResponder, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { dueLocationReminder, markLocationReminder, refreshLocationSilently, shareLocation } from "@/lib/location";
import { Aurora, Btn, Glass, Mosya, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { PersonView, TopBtn } from "@/components/people/PersonView";
import { PeopleFilterSheet } from "@/components/people/PeopleFilterSheet";
import { api } from "@/lib/api";
import { animateNext, tapLight } from "@/lib/feedback";
import { appendPeople } from "@/lib/peopleDeck";
import { qs } from "@/lib/format";
import { DEFAULT_PEOPLE_FILTERS, hasPeopleFilters, newVisitSeed, peopleFilterQuery, type PeopleFilters } from "@/lib/peopleFilters";
import { colors, FONT, f } from "@/lib/theme";
import type { PersonCard } from "@/lib/types";
import { useGuide } from "@/lib/guide";

const { width: W } = Dimensions.get("window");

/**
 * «Люди рядом» — колода профилей (app/(app)/people в мини-приложении).
 * Листаем свайпом влево/вправо; полный профиль грузится для видимой
 * карточки и соседних.
 */
type DeckResponse = { items: PersonCard[]; meHasLocation?: boolean; nextOffset?: number | null };

export default function PeopleScreen() {
  useGuide("people");
  const { start } = useLocalSearchParams<{ start?: string }>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PersonCard[] | null>(null);
  const [hasLocation, setHasLocation] = useState(true);
  const [index, setIndex] = useState(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const [reminder, setReminder] = useState<string | null>(null);
  const [filters, setFilters] = useState<PeopleFilters>(DEFAULT_PEOPLE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [moreState, setMoreState] = useState<"idle" | "loading" | "error">("idle");
  const dismissed = useRef(new Set<string>());
  // Новый заход — новая подборка; внутри захода порядок стабилен при подгрузке.
  const [seed] = useState(newVisitSeed);
  const nextOffset = useRef<number | null>(null);
  const loadingMore = useRef<number | null>(null);
  const locationRefresh = useRef<Promise<boolean> | null>(null);
  const deckRequest = useRef(0);
  // Выбранного в «Людях рядом» человека открываем первым — только при входе, не после фильтров.
  const startId = useRef<string | undefined>(start || undefined);

  const query = useCallback(
    (offset: number) => `/api/people?${qs({ deck: 1, seed, offset, start: startId.current, ...peopleFilterQuery(filters) })}`,
    [seed, filters]
  );

  const load = useCallback(async (keepPlace = false) => {
    const request = keepPlace ? deckRequest.current : ++deckRequest.current;
    const location = locationRefresh.current ??= refreshLocationSilently();
    const path = query(0);
    try {
      const r = await api<DeckResponse>(path);
      if (request !== deckRequest.current) return;
      if (keepPlace) {
        const updated = new Map(r.items.map(person => [person.id, person]));
        setItems(list => list?.map(person => updated.get(person.id) ?? person) ?? []);
      } else {
        nextOffset.current = r.nextOffset ?? null;
        setItems(appendPeople([], r.items ?? [], dismissed.current));
      }
      setHasLocation(r.meHasLocation !== false);
      // После разрешения геолокации остаёмся на той же карточке — порядок тот же (то же зерно).
      if (!keepPlace) setIndex(0);
      if (!r.meHasLocation && await location && request === deckRequest.current) {
        const fresh = await api<DeckResponse>(path).catch(() => null);
        if (!fresh || request !== deckRequest.current) return;
        const distances = new Map(fresh.items.map(person => [person.id, person]));
        setItems(list => list?.map(person => distances.get(person.id) ?? person) ?? []);
        setHasLocation(fresh.meHasLocation !== false);
      }
    } catch {
      if (request !== deckRequest.current || keepPlace) return;
      nextOffset.current = null;
      setItems([]);
    }
  }, [query]);

  useEffect(() => {
    void load();
    return () => { deckRequest.current++; };
  }, [load]);


  // Подгружаем следующие анкеты заранее; уже показанные не повторяем.
  const loadMore = useCallback(async () => {
    const offset = nextOffset.current;
    const request = deckRequest.current;
    if (offset == null || loadingMore.current === request) return;
    loadingMore.current = request;
    setMoreState("loading");
    try {
      const r = await api<DeckResponse>(query(offset));
      if (request !== deckRequest.current) return;
      nextOffset.current = r.nextOffset != null && r.nextOffset > offset ? r.nextOffset : null;
      setItems(list => appendPeople(list ?? [], r.items ?? [], dismissed.current));
      setMoreState("idle");
    } catch {
      if (request === deckRequest.current) setMoreState("error");
    } finally {
      if (loadingMore.current === request) loadingMore.current = null;
    }
  }, [query]);

  useEffect(() => {
    if (items && index >= items.length - 8 && moreState === "idle") void loadMore();
  }, [index, items, loadMore, moreState]);

  function applyFilters(next: PeopleFilters) {
    setFiltersOpen(false);
    startId.current = undefined;
    nextOffset.current = null;
    animateNext();
    setItems(null);
    deckRequest.current++;
    setMoreState("idle");
    setFilters({ ...next });
  }

  const filtersActive = hasPeopleFilters(filters);
  const filterBtn = (
    <RoundBtn
      onPress={() => {
        tapLight();
        setFiltersOpen(true);
      }}
    >
      <Icon name="filter" color={filtersActive ? colors.violet : undefined} />
    </RoundBtn>
  );
  const filterBtnDark = (
    <TopBtn onPress={() => setFiltersOpen(true)} label="Фильтры">
      <Icon name="filter" color={filtersActive ? "#C9BEFF" : "#fff"} />
    </TopBtn>
  );
  const filterSheet = <PeopleFilterSheet visible={filtersOpen} value={filters} onApply={applyFilters} onClose={() => setFiltersOpen(false)} />;

  const canOfferLocation = !hasLocation && !!items?.[index];
  useFocusEffect(useCallback(() => {
    let active = true;
    if (canOfferLocation) dueLocationReminder().then(key => {
      if (active) setReminder(key);
    }).catch(() => {});
    return () => { active = false; setReminder(null); };
  }, [canOfferLocation]));
  useEffect(() => {
    if (reminder) markLocationReminder(reminder).catch(() => {});
  }, [reminder]);

  async function allowLocation() {
    if (geoBusy) return;
    setGeoBusy(true);
    try {
      const saved = await shareLocation();
      setReminder(null);
      if (saved) { animateNext(); setHasLocation(true); await load(true); }
    } finally { setGeoBusy(false); }
  }

  function removePerson(id: string) {
    dismissed.current.add(id);
    animateNext();
    setItems((list) => (list ? list.filter((x) => x.id !== id) : list));
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  // Свайп карточки: тянется за пальцем с лёгким наклоном; дальше трети экрана или резкий рывок — улетает,
  // и показываем следующего (в любую сторону — как в мини-аппе). Вертикальная прокрутка «О себе» не мешает.
  // У каждой карточки своё смещение: новая появляется сразу на месте, без кадра «в полёте» — нет мигания и двойников.
  const currentId = items?.[index]?.id;
  const activeId = useRef(currentId);
  activeId.current = currentId;
  const departing = useRef<string | null>(null);
  const cardDx = useMemo(() => new Animated.Value(0), [currentId]);
  const dxRef = useRef(cardDx);
  dxRef.current = cardDx;
  const advance = useRef<(dir: 1 | -1) => void>(() => {});
  advance.current = (dir) => {
    const id = activeId.current;
    if (!id || departing.current === id) return;
    departing.current = id;
    Haptics.selectionAsync().catch(() => {});
    Animated.timing(dxRef.current, { toValue: dir * W * 1.2, duration: 160, easing: Easing.out(Easing.quad), useNativeDriver: true }).start(({ finished }) => {
      if (departing.current === id) departing.current = null;
      if (!finished || activeId.current !== id || dismissed.current.has(id)) return;
      dismissed.current.add(id);
      setIndex(i => i + 1);
    });
  };
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => departing.current !== activeId.current && Math.abs(g.dx) > 14 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
      onPanResponderMove: (_, g) => dxRef.current.setValue(g.dx),
      onPanResponderRelease: (_, g) => {
        if (Math.abs(g.dx) > W * 0.3 || Math.abs(g.vx) > 0.8) advance.current(g.dx > 0 ? 1 : -1);
        else Animated.spring(dxRef.current, { toValue: 0, useNativeDriver: true, friction: 6, tension: 80 }).start();
      },
      onPanResponderTerminate: () => Animated.spring(dxRef.current, { toValue: 0, useNativeDriver: true }).start(),
      onPanResponderTerminationRequest: () => false,
    })
  ).current;


  if (items === null) {
    return (
      <View style={styles.center}>
        <Aurora />
        <ActivityIndicator color={colors.violet} />
      </View>
    );
  }

  if (!items[index] && nextOffset.current !== null) return <View style={[styles.center, { backgroundColor: "#17141F" }]}>
    {moreState === "error" ? <Btn title="Загрузить ещё" onPress={() => { void loadMore(); }} /> : <ActivityIndicator color="#fff" />}
    <Btn kind="w" title="Назад" onPress={back} />
  </View>;

  if (items.length === 0) {
    return (
      <View style={[styles.center, { paddingHorizontal: 24 }]}>
        <Aurora />
        <View style={[styles.backAbs, { top: insets.top + 8 }]}>
          <RoundBtn onPress={back}>
            <Icon name="back" />
          </RoundBtn>
        </View>
        <View style={[styles.filterAbs, { top: insets.top + 8 }]}>{filterBtn}</View>
        <Mosya pose="wave" size={150} />
        {filtersActive ? (
          <>
            <Text style={styles.endTitle}>Никого по этим фильтрам</Text>
            <Text style={styles.endText}>Попробуй расширить возраст или выбрать другие интересы.</Text>
            <Btn title="Сбросить фильтры" onPress={() => applyFilters(DEFAULT_PEOPLE_FILTERS)} style={{ alignSelf: "stretch", marginTop: 10 }} />
          </>
        ) : (
          <>
            <Text style={styles.endTitle}>Скоро здесь появятся люди</Text>
            <Text style={styles.endText}>Добавь интересы в профиле — Мося подберёт людей, с которыми тебе будет о чём поговорить.</Text>
            <Btn title="Добавить интересы" onPress={() => router.push("/interests")} style={{ alignSelf: "stretch", marginTop: 10 }} />
          </>
        )}
        {filterSheet}
      </View>
    );
  }

  const cur = items[index];
  const window = items.slice(index, index + 3).reverse();

  return (
    <View style={{ flex: 1, backgroundColor: "#17141F" }}>
      {window.map(person => {
        const front = person.id === currentId;
        return (
          <Animated.View key={person.id} pointerEvents={front ? "auto" : "none"} accessibilityElementsHidden={!front}
            importantForAccessibility={front ? "auto" : "no-hide-descendants"}
            style={[StyleSheet.absoluteFill, { backgroundColor: "#17141F" }, front && { transform: [{ translateX: cardDx },
              { rotate: cardDx.interpolate({ inputRange: [-W, 0, W], outputRange: ["-8deg", "0deg", "8deg"] }) }] }]}
            {...(front ? pan.panHandlers : {})}>
            <PersonView id={person.id} preview={person} active={front} preload onBack={back} onGone={removePerson} topAction={filterBtnDark} />
          </Animated.View>
        );
      })}
      {!cur && (
        <View style={[styles.end, { flex: 1, paddingTop: insets.top + 60 }]}>
          <Aurora />
          <Mosya pose="wave" size={150} />
          <View style={[styles.backAbs, { top: insets.top + 8 }]}>
            <RoundBtn onPress={back}><Icon name="back" /></RoundBtn>
          </View>
          <View style={[styles.filterAbs, { top: insets.top + 8 }]}>{filterBtn}</View>
          <Text style={styles.endTitle}>Пока всё</Text>
          <Text style={styles.endText}>Ты посмотрел всех, кто рядом. Создай встречу — и люди с похожими интересами найдут тебя сами.</Text>
          <Btn title="Создать встречу" onPress={() => router.push("/create")} style={{ alignSelf: "stretch", marginTop: 10 }} />
          <Btn kind="o" title="Смотреть сначала" onPress={() => { dismissed.current.clear(); setIndex(0); }} style={{ alignSelf: "stretch" }} />
          <Btn kind="o" title="Назад" onPress={back} style={{ alignSelf: "stretch" }} />
        </View>
      )}

      {!hasLocation && reminder && cur ? (
        <Glass strong style={[styles.geo, { bottom: insets.bottom + 96 }]}>
          <View style={styles.geoIc}>
            <Icon name="nav" size={18} color={colors.violet} />
          </View>
          <Text style={styles.geoText}>Показывать расстояние? В профиле будет видно, сколько примерно километров между вами.</Text>
          <View style={{ gap: 6 }}>
            <Btn title="Разрешить" onPress={allowLocation} loading={geoBusy} style={styles.geoBtn} />
            <Text onPress={() => setReminder(null)} style={styles.geoLater}>
              Не сейчас
            </Text>
          </View>
        </Glass>
      ) : null}
      {filterSheet}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  backAbs: { position: "absolute", left: 16 },
  filterAbs: { position: "absolute", right: 16 },
  end: { flex: 1, alignItems: "center", paddingHorizontal: 24, gap: 10 },
  endTitle: { fontSize: 26, ...f("500"), color: colors.ink, letterSpacing: -0.6, textAlign: "center" },
  endText: { fontFamily: FONT, fontSize: 15, lineHeight: 21, color: colors.ink2, textAlign: "center" },
  geo: { position: "absolute", left: 12, right: 12, borderRadius: 24, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  geoIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  geoText: { flex: 1, fontFamily: FONT, fontSize: 12.5, lineHeight: 17, color: colors.ink2 },
  geoBtn: { height: 38, paddingHorizontal: 14 },
  geoLater: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, textAlign: "center" },
});
