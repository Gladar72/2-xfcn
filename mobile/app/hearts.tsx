import { useCallback, useMemo, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Creature, K, KGlass, KRb, KTitle, PearlBg, Press, kf } from "@/components/k";
import { KMosaic } from "@/components/k/cards";
import { heartPage, heartTime, type IncomingHeart } from "@/lib/hearts";

export default function HeartsScreen() {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<IncomingHeart[]>([]);
  const [onlyNew, setOnlyNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [attempt, retry] = useState(0);
  const complete = useRef(false);
  const list = useRef<FlatList<IncomingHeart[]>>(null);
  useFocusEffect(useCallback(() => {
    const controller = new AbortController();
    const {signal} = controller;
    async function load() {
      setError(false);
      setLoading(true);
      const people = new Map<string, IncomingHeart>();
      let cursor: string | null = null;
      do {
        const page = await heartPage(cursor, signal);
        if (signal.aborted) return;
        for (const person of page.items) if (!people.has(person.id)) people.set(person.id, person);
        cursor = page.nextCursor;
        // Keep an already populated list stable when returning from a profile.
        if (!complete.current || !cursor) setItems([...people.values()]);
      } while (cursor);
      complete.current = true;
    }
    load().catch(() => { if (!signal.aborted) setError(true); })
      .finally(() => { if (!signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt]));
  const unread = useMemo(() => items.filter(p => p.unread), [items]);
  const groups = useMemo(() => {
    const visible = onlyNew ? unread : items;
    const rows: IncomingHeart[][] = [];
    for (let i = 0; i < visible.length; i += 3) rows.push(visible.slice(i,i+3));
    return rows;
  }, [onlyNew, items, unread]);
  function show(fresh: boolean) {
    if (fresh !== onlyNew) { list.current?.scrollToOffset({ offset: 0, animated: false }); setOnlyNew(fresh); }
  }
  function open(p: IncomingHeart) {
    router.push({ pathname: "/person/[id]", params: { id: p.id, heart: "1", name: p.name, ...(p.age ? {age: String(p.age)} : {}), ...(p.avatarUrl ? {avatar:p.avatarUrl} : {}) } });
  }
  return <View style={{ flex: 1, backgroundColor: K.pearl }}>
    <PearlBg />
    <FlatList ref={list} data={groups} keyExtractor={row => row[0].id}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: insets.top + 8, paddingBottom: insets.bottom + 24 }}
      onRefresh={() => retry(x => x+1)} refreshing={loading && complete.current}
      ListHeaderComponent={<View>
        <KRb icon="back" accessibilityLabel="Назад" onPress={() => router.canGoBack() ? router.back() : router.replace("/(tabs)/profile")} />
        <KTitle parts={["Тебе поставили\n", { em: "сердечко" }]} size={38} style={{ marginTop:20 }} />
        <KGlass style={{ height:44, borderRadius:22, padding:4, marginTop:16 }}>
          <View style={{ flex:1, flexDirection:"row" }}>
            {([false,true] as const).map(fresh => <Press key={String(fresh)} onPress={() => show(fresh)} style={{ flex:1, borderRadius:18, alignItems:"center", justifyContent:"center", backgroundColor: fresh === onlyNew ? K.ink : "transparent" }}>
              <Text style={kf("500",13.5,{color:fresh === onlyNew ? "#fff" : K.ink})}>{fresh ? "Новые" : "Все"} · {(loading && !complete.current) || error ? "…" : fresh ? unread.length : items.length}</Text>
            </Press>)}
          </View>
        </KGlass>
      </View>}
      renderItem={({item}) => <KMosaic people={item} isNew={p=>p.unread} subtitle={p=>heartTime(p.createdAt)} onOpen={open} />}
      ListEmptyComponent={!loading && !error ? <View style={{ alignItems:"center", padding:30, gap:10 }}><Creature size={92} /><Text style={kf("500",18)}>{onlyNew ? "Все сердечки просмотрены" : "Пока нет сердечек"}</Text><Text style={kf("400",14,{color:K.ink2})}>{onlyNew ? "Профили остались во вкладке «Все»." : "Здесь появятся люди, которым ты понравился."}</Text></View> : null}
      ListFooterComponent={error ? <Press onPress={()=>retry(x=>x+1)} style={{ padding:16 }}><Text style={kf("500",15)}>Не удалось загрузить сердечки · Повторить</Text></Press> : loading && !complete.current ? <ActivityIndicator style={{ marginTop:20 }} color={K.ink} /> : null} />
  </View>;
}
