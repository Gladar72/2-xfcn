import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Dimensions, FlatList, StyleSheet, Text, View, type ViewToken } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { Aurora, Btn, Glass, Mosya, RoundBtn } from "@/components/brand";
import { Icon } from "@/components/Icon";
import { PersonView } from "@/components/people/PersonView";
import { api } from "@/lib/api";
import { animateNext } from "@/lib/feedback";
import { colors, FONT } from "@/lib/theme";
import type { PersonCard } from "@/lib/types";
import { useGuide } from "@/lib/guide";

const { width: W } = Dimensions.get("window");

type Page = { kind: "person"; p: PersonCard } | { kind: "end" };

/**
 * «Люди рядом» — колода профилей (app/(app)/people в мини-приложении).
 * Листаем свайпом влево/вправо; полный профиль грузится для видимой
 * карточки и соседних.
 */
export default function PeopleScreen() {
  useGuide("people");
  const { start } = useLocalSearchParams<{ start?: string }>();
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<PersonCard[] | null>(null);
  const [hasLocation, setHasLocation] = useState(true);
  const [index, setIndex] = useState(0);
  const [geoBusy, setGeoBusy] = useState(false);
  const [geoHidden, setGeoHidden] = useState(false);
  const listRef = useRef<FlatList<Page>>(null);
  const firstLoad = useRef(true);

  const load = useCallback(async () => {
    try {
      const r = await api<{ items: PersonCard[]; meHasLocation?: boolean }>("/api/people?deck=1");
      setItems(r.items ?? []);
      setHasLocation(r.meHasLocation !== false);
      // Стартовую карточку выбираем только при первом открытии — после
      // повторной загрузки (например, разрешили геолокацию) остаёмся, где были.
      if (firstLoad.current) {
        firstLoad.current = false;
        setIndex(start ? Math.max(0, (r.items ?? []).findIndex((x) => x.id === start)) : 0);
      }
    } catch {
      setItems([]);
    }
  }, [start]);

  useEffect(() => {
    load();
  }, [load]);

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
      load();
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
        <Mosya pose="wave" size={150} />
        <Text style={styles.endTitle}>Скоро здесь появятся люди</Text>
        <Text style={styles.endText}>Добавь интересы в профиле — Мося подберёт людей, с которыми тебе будет о чём поговорить.</Text>
        <Btn title="Добавить интересы" onPress={() => router.push("/interests")} style={{ alignSelf: "stretch", marginTop: 10 }} />
      </View>
    );
  }

  const pages: Page[] = [...items.map((p) => ({ kind: "person" as const, p })), { kind: "end" }];

  return (
    <View style={{ flex: 1, backgroundColor: colors.milk }}>
      <FlatList
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
              <PersonView id={pg.p.id} preview={pg.p} active={Math.abs(i - index) <= 1} onBack={back} onGone={removePerson} />
            </View>
          ) : (
            <View style={[styles.end, { width: W, paddingTop: insets.top + 60 }]}>
              <Aurora />
              <Mosya pose="wave" size={150} />
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
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  backAbs: { position: "absolute", left: 16 },
  end: { flex: 1, alignItems: "center", paddingHorizontal: 24, gap: 10 },
  endTitle: { fontFamily: FONT, fontSize: 26, fontWeight: "500", color: colors.ink, letterSpacing: -0.6, textAlign: "center" },
  endText: { fontFamily: FONT, fontSize: 15, lineHeight: 21, color: colors.ink2, textAlign: "center" },
  geo: { position: "absolute", left: 12, right: 12, borderRadius: 24, padding: 12, flexDirection: "row", alignItems: "center", gap: 10 },
  geoIc: { width: 36, height: 36, borderRadius: 12, backgroundColor: colors.lav, alignItems: "center", justifyContent: "center" },
  geoText: { flex: 1, fontFamily: FONT, fontSize: 12.5, lineHeight: 17, color: colors.ink2 },
  geoBtn: { height: 38, paddingHorizontal: 14 },
  geoLater: { fontFamily: FONT, fontSize: 12.5, color: colors.grey, textAlign: "center" },
});
