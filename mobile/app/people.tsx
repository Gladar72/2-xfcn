import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, FlatList, StyleSheet, Text, View, type ViewToken } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Aurora, Btn, Glass, Mosya, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { PersonView } from "@/components/people/PersonView";
import { PeopleFilterSheet } from "@/components/people/PeopleFilterSheet";
import { api } from "@/lib/api";
import { animateNext, tapLight } from "@/lib/feedback";
import { qs } from "@/lib/format";
import { DEFAULT_PEOPLE_FILTERS, hasPeopleFilters, newVisitSeed, peopleFilterQuery, type PeopleFilters } from "@/lib/peopleFilters";
import { colors, FONT, f } from "@/lib/theme";
import type { PersonCard } from "@/lib/types";
import { useGuide } from "@/lib/guide";

const { width: W } = Dimensions.get("window");

type Page = { kind: "person"; p: PersonCard } | { kind: "end" };

/**
 * «Люди рядом» — колода профилей (app/(app)/people в мини-приложении).
 * Листаем свайпом влево/вправо; полный профиль грузится для видимой
 * карточки и соседних.
 */
type DeckResponse = { items: PersonCard[]; meHasLocation?: boolean; nextOffset?: number | null };

/** Свежая точка без вопросов: только если доступ к геолокации уже дан. */
async function refreshLocationQuietly(): Promise<void> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (perm.status !== "granted") return;
    const pos = await Promise.race([
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
      new Promise<null>((r) => setTimeout(() => r(null), 4000)),
    ]);
    if (!pos) return;
    await api("/api/me/location", { body: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
  } catch {
    // Без точки колода всё равно откроется — просто без расстояний.
  }
}

export default function PeopleScreen() {
  useGuide("people");
  const { start } = useLocalSearchParams<{ start?: string }>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PersonCard[] | null>(null);
  const [hasLocation, setHasLocation] = useState(true);
  const [index, setIndex] = useState(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHidden, setGeoHidden] = useState(false);
  const [filters, setFilters] = useState<PeopleFilters>(DEFAULT_PEOPLE_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [deckKey, setDeckKey] = useState(0);
  const listRef = useRef<FlatList<Page>>(null);
  // Новый заход — новая подборка; внутри захода порядок стабилен при подгрузке.
  const seed = useRef(newVisitSeed()).current;
  const nextOffset = useRef<number | null>(null);
  const loadingMore = useRef(false);
  const located = useRef(false);
  // Выбранного в «Людях рядом» человека открываем первым — только при входе, не после фильтров.
  const startId = useRef<string | undefined>(start || undefined);

  const query = useCallback(
    (offset: number) => `/api/people?${qs({ deck: 1, seed, offset, start: startId.current, ...peopleFilterQuery(filters) })}`,
    [seed, filters]
  );

  const load = useCallback(async (keepPlace = false) => {
    try {
      if (!located.current) {
        located.current = true;
        await refreshLocationQuietly();
      }
      const r = await api<DeckResponse>(query(0));
      nextOffset.current = r.nextOffset ?? null;
      setItems(r.items ?? []);
      setHasLocation(r.meHasLocation !== false);
      // После разрешения геолокации остаёмся на той же карточке — порядок тот же (то же зерно).
      if (!keepPlace) setIndex(0);
    } catch {
      nextOffset.current = null;
      setItems([]);
    }
  }, [query]);

  useEffect(() => {
    load();
  }, [load]);


  // Подгружаем следующие анкеты заранее; уже показанные не повторяем.
  const loadMore = useCallback(async () => {
    const offset = nextOffset.current;
    if (offset == null || loadingMore.current) return;
    loadingMore.current = true;
    try {
      const r = await api<DeckResponse>(query(offset));
      nextOffset.current = r.nextOffset ?? null;
      setItems((list) => {
        const seen = new Set((list ?? []).map((x) => x.id));
        return [...(list ?? []), ...(r.items ?? []).filter((x) => !seen.has(x.id))];
      });
    } catch {
      // Следующая попытка — при следующем свайпе.
    } finally {
      loadingMore.current = false;
    }
  }, [query]);

  useEffect(() => {
    if (items && index >= items.length - 5) loadMore();
  }, [index, items, loadMore]);

  function applyFilters(next: PeopleFilters) {
    setFiltersOpen(false);
    startId.current = undefined;
    nextOffset.current = null;
    animateNext();
    setItems(null);
    setDeckKey((k) => k + 1);
    setFilters(next);
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
  const filterSheet = <PeopleFilterSheet visible={filtersOpen} value={filters} onApply={applyFilters} onClose={() => setFiltersOpen(false)} />;

  async function allowLocation() {
    setGeoBusy(true);
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== "granted") {
        setGeoHidden(true);
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api("/api/me/location", { body: { lat: pos.coords.latitude, lon: pos.coords.longitude } });
      animateNext();
      setHasLocation(true);
      load(true);
    } catch {
      Alert.alert("Не получилось", "Не удалось определить место. Попробуй позже");
    } finally {
      setGeoBusy(false);
    }
  }

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }).current;

  function removePerson(id: string) {
    animateNext();
    setItems((list) => (list ? list.filter((x) => x.id !== id) : list));
  }

  const back = () => (router.canGoBack() ? router.back() : router.replace("/(tabs)"));

  if (items === null) {
    return (
      <View style={styles.center}>
        <Aurora />
        <ActivityIndicator color={colors.violet} />
      </View>
    );
  }

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

  const pages: Page[] = [...items.map((p) => ({ kind: "person" as const, p })), { kind: "end" }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <FlatList
        key={deckKey}
        ref={listRef}
        data={pages}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        initialScrollIndex={Math.min(index, pages.length - 1)}
        getItemLayout={(_, i) => ({ length: W, offset: W * i, index: i })}
        keyExtractor={(pg) => (pg.kind === "person" ? pg.p.id : "end")}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={{ itemVisiblePercentThreshold: 60 }}
        windowSize={3}
        renderItem={({ item: pg, index: i }) =>
          pg.kind === "person" ? (
            <View style={{ width: W }}>
              <PersonView id={pg.p.id} preview={pg.p} active={Math.abs(i - index) <= 1} onBack={back} onGone={removePerson} topAction={filterBtn} />
            </View>
          ) : (
            <View style={[styles.end, { width: W, paddingTop: insets.top + 60 }]}>
              <Aurora />
              <Mosya pose="wave" size={150} />
              <View style={[styles.filterAbs, { top: insets.top + 8 }]}>{filterBtn}</View>
              <Text style={styles.endTitle}>Пока всё</Text>
              <Text style={styles.endText}>Ты посмотрел всех, кто рядом. Создай встречу — и люди с похожими интересами найдут тебя сами.</Text>
              <Btn title="Создать встречу" onPress={() => router.push("/create")} style={{ alignSelf: "stretch", marginTop: 10 }} />
              <Btn kind="o" title="Смотреть сначала" onPress={() => listRef.current?.scrollToIndex({ index: 0, animated: true })} style={{ alignSelf: "stretch" }} />
              <Btn kind="o" title="Назад" onPress={back} style={{ alignSelf: "stretch" }} />
            </View>
          )
        }
      />

      {!hasLocation && !geoHidden && pages[index]?.kind === "person" ? (
        <Glass strong style={[styles.geo, { bottom: insets.bottom + 96 }]}>
          <View style={styles.geoIc}>
            <Icon name="nav" size={18} color={colors.violet} />
          </View>
          <Text style={styles.geoText}>Покажем, кто ближе к тебе. Видно только примерное расстояние — точное место никто не узнает.</Text>
          <View style={{ gap: 6 }}>
            <Btn title="Разрешить" onPress={allowLocation} loading={geoBusy} style={styles.geoBtn} />
            <Text onPress={() => setGeoHidden(true)} style={styles.geoLater}>
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
