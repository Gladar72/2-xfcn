// «Вам поставили сердечко» — перенос components/people/HeartsSheet.tsx мини-аппа.
// Строка в профиле, пока есть неотвеченные; шторка открывается сама, если есть новые.
// «В ответ» → «Это взаимно!» → «Позвать на встречу». «👋 Хочу на встречу» — намёк.
import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, useFocusEffect, type Href } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { api } from "@/lib/api";
import { Sheet } from "@/components/Sheet";
import { Creature, K, KI, KPressGlass, Press, kem, kf } from "@/components/k";
import { HeartBurst, type HeartBurstRef } from "@/components/k/HeartBurst";

type Heart = {
  notificationId: string;
  unread: boolean;
  userId: string;
  name: string;
  age: number | null;
  avatarUrl: string | null;
  ratingAvg: number;
  meetings: number;
  commonInterests: string[];
};

const HEART = "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z";
const PINK = "#FF4F8B";

function HeartBadge({ size }: { size: number }) {
  return (
    <View style={{ position: "absolute", right: -3, bottom: -3, width: size, height: size, borderRadius: size / 2, backgroundColor: PINK, borderWidth: size > 30 ? 3 : 2, borderColor: "#fff", alignItems: "center", justifyContent: "center" }}>
      <Svg width={size * 0.48} height={size * 0.48} viewBox="0 0 24 24"><Path d={HEART} fill="#fff" /></Svg>
    </View>
  );
}

export function HeartsSheet({ openOnMount }: { openOnMount?: boolean }) {
  const [items, setItems] = useState<Heart[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [mutual, setMutual] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const burst = useRef<HeartBurstRef>(null);

  const load = useCallback(() => {
    api<{ items?: Heart[] }>("/api/me/hearts")
      .then((d) => {
        const list = d?.items ?? [];
        setItems(list);
        if (list.length && (openOnMount || list.some((h) => h.unread))) setOpen(true);
      })
      .catch(() => {});
  }, [openOnMount]);
  useFocusEffect(useCallback(() => load(), [load]));
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  function close() {
    setOpen(false);
    setMutual(false);
    const ids = items.filter((h) => h.unread).map((h) => h.notificationId);
    if (ids.length) {
      setItems((l) => l.map((h) => ({ ...h, unread: false })));
      api("/api/notifications", { method: "PATCH", body: { ids } }).catch(() => {});
    }
  }

  const h = items[0];
  if (!h) return toast ? <Text style={[kf("500", 13, { color: K.ink2 }), { textAlign: "center", marginTop: 14 }]}>{toast}</Text> : null;
  const rest = items.length - 1;

  function next() {
    setItems((l) => {
      const n = l.slice(1);
      if (n.length === 0) setOpen(false);
      return n;
    });
    setMutual(false);
  }
  function invite() {
    if (!h) return;
    setOpen(false);
    router.push({ pathname: "/person/[id]", params: { id: h.userId, invite: "1" } } as unknown as Href);
  }

  async function post(kind: "heart" | "hint") {
    if (busy || !h) return;
    setBusy(true);
    if (kind === "heart") burst.current?.fire();
    try {
      await api("/api/likes", { body: { userId: h.userId, kind } });
      if (kind === "heart") setMutual(true);
      else {
        setToast(`Намекнули ${h.name}: «Хочу на встречу» 👋`);
        next();
      }
    } catch (e) {
      if ((e as { status?: number }).status === 429)
        Alert.alert(kind === "heart" ? "Сегодня сердечки закончились" : "Намёков на сегодня хватит", "Завтра можно ещё");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <KPressGlass onPress={() => setOpen(true)} style={{ borderRadius: 22, marginTop: 14 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, paddingHorizontal: 14 }}>
          <View style={{ width: 44, height: 44 }}>
            {h.avatarUrl ? <Image source={{ uri: h.avatarUrl }} style={{ width: 44, height: 44, borderRadius: 22 }} contentFit="cover" /> : <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "#EFE8FF" }} />}
            <HeartBadge size={22} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={kf("600", 15)}>{items.length > 1 ? `Вам поставили ${items.length} сердечка` : "Вам поставили сердечко"}</Text>
            <Text style={kf("400", 13, { color: K.ink2 })} numberOfLines={1}>
              {items.length > 1 ? `${h.name} и ещё ${rest}` : h.name} · ответьте или позовите на встречу
            </Text>
          </View>
          <KI n="chev" size={18} />
        </View>
      </KPressGlass>

      <Sheet visible={open} onClose={close}>
        <View style={{ alignItems: "center", marginTop: 4 }}>
          <View style={{ width: 110, height: 110 }}>
            {h.avatarUrl ? (
              <Image source={{ uri: h.avatarUrl }} style={{ width: 110, height: 110, borderRadius: 55, borderWidth: 4, borderColor: "#fff" }} contentFit="cover" />
            ) : (
              <View style={{ width: 110, height: 110, borderRadius: 55, backgroundColor: "#EFE8FF", borderWidth: 4, borderColor: "#fff" }} />
            )}
            <HeartBadge size={40} />
          </View>
        </View>
        <Text style={[kf("500", 28, { ls: -0.02 }), { textAlign: "center", marginTop: 14 }]}>
          {mutual ? "Это " : "Вам поставили "}
          <Text style={kem(28)}>{mutual ? "взаимно!" : "сердечко"}</Text>
        </Text>
        <Text style={[kf("400", 15, { lh: 1.45, color: K.ink2 }), { textAlign: "center", marginTop: 6, marginHorizontal: 4 }]}>
          <Text style={{ color: K.ink, fontWeight: "600" }}>{h.name}{h.age ? `, ${h.age}` : ""}</Text>
          {h.meetings > 0 ? ` · ${h.meetings} встреч` : ""}
          {h.ratingAvg > 0 ? ` · ★ ${h.ratingAvg.toFixed(1).replace(".", ",")}` : ""}
          {h.commonInterests.length ? `\nОбщее: ${h.commonInterests.slice(0, 3).join(", ").toLowerCase()}` : ""}
        </Text>

        {mutual ? (
          <View style={{ flexDirection: "row", gap: 10, alignItems: "center", marginTop: 14 }}>
            <Creature size={54} variant="e" />
            <View style={{ flex: 1, borderRadius: 18, paddingVertical: 10, paddingHorizontal: 12, backgroundColor: "rgba(124,92,255,0.08)" }}>
              <Text style={kf("400", 14, { lh: 1.4 })}>{`Ура! ${h.name} теперь знает, что это взаимно. Самое время позвать куда-нибудь`}</Text>
            </View>
          </View>
        ) : null}

        <Press dark haptic onPress={invite} style={{ marginTop: 16, height: 54, borderRadius: 27, backgroundColor: K.ink, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" }}>
          <KI n="cal" size={18} color="#fff" />
          <Text style={kf("500", 16, { color: "#fff" })}>Позвать на встречу</Text>
        </Press>

        {mutual ? (
          <Press onPress={next} style={btnO}>
            <Text style={kf("500", 15)}>{rest > 0 ? `Дальше · ещё ${rest}` : "Готово"}</Text>
          </Press>
        ) : (
          <>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
              <View style={{ flex: 1 }}>
                <Press disabled={busy} onPress={() => post("heart")} style={[btnO, { marginTop: 0, flexDirection: "row", gap: 6 }]}>
                  <Svg width={18} height={18} viewBox="0 0 24 24"><Path d={HEART} fill={PINK} /></Svg>
                  <Text style={kf("500", 15)}>В ответ</Text>
                </Press>
                <HeartBurst ref={burst} size={52} />
              </View>
              <Press disabled={busy} onPress={() => post("hint")} style={[btnO, { marginTop: 0, flex: 1 }]}>
                <Text style={kf("500", 15)}>👋 Хочу на встречу</Text>
              </Press>
            </View>
            {rest > 0 ? (
              <Press onPress={next} style={{ alignSelf: "center", padding: 8, marginTop: 4 }}>
                <Text style={kf("400", 14, { color: K.ink2 })}>{`Ещё ${rest} ${rest === 1 ? "человек поставил" : "человека поставили"} сердечко — смотреть`}</Text>
              </Press>
            ) : null}
          </>
        )}
      </Sheet>
      {toast ? <Text style={[kf("500", 13, { color: K.ink2 }), { textAlign: "center", marginTop: 8 }]}>{toast}</Text> : null}
    </>
  );
}

const btnO = { marginTop: 10, height: 52, borderRadius: 26, borderWidth: 1, borderColor: "rgba(23,20,31,0.12)", backgroundColor: "rgba(255,255,255,0.7)", alignItems: "center" as const, justifyContent: "center" as const };
