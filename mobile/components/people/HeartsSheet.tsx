import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import { Creature, KI, K, kf, KPressGlass } from "@/components/k";
import { heartPage, type IncomingHeart } from "@/lib/hearts";

export function HeartsSheet({ openOnMount }: { openOnMount?: boolean }) {
  const [latest, setLatest] = useState<IncomingHeart | null>(null);
  const redirected = useRef(false);
  useFocusEffect(useCallback(() => {
    if (openOnMount && !redirected.current) {
      redirected.current = true;
      router.setParams({ hearts: undefined });
      router.push("/hearts");
      return;
    }
    if (!openOnMount) redirected.current = false;
    const controller = new AbortController();
    heartPage(null, controller.signal).then(page => {
      if (!controller.signal.aborted) setLatest(page.items[0] ?? null);
    }).catch(() => {});
    return () => controller.abort();
  }, [openOnMount]));

  return <KPressGlass onPress={() => router.push("/hearts")} style={{ borderRadius: 22, marginTop: 14 }}>
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
      <View style={{ width: 44, height: 44 }}>
        {latest?.avatarUrl ? <Image source={{ uri: latest.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" /> : <Creature size={44} />}
        <View style={{ position: "absolute", right: -3, bottom: -3, width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: "#fff", backgroundColor: "#FF4F8B", alignItems: "center", justifyContent: "center" }}><KI n="heart" size={13} color="#fff" /></View>
      </View>
      <View style={{ flex: 1 }}><Text style={kf("600",15)}>Входящие сердечки</Text><Text style={kf("400",13,{color:K.ink2})} numberOfLines={1}>{latest ? `${latest.name} · Смотреть всех` : "Кто поставил тебе сердечко"}</Text></View>
      <KI n="chev" size={18}/>
    </View>
  </KPressGlass>;
}
