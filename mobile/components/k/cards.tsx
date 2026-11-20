// Карточки главной мини-аппа: .k-hc (встреча), .k-mz/.k-mt (мозаика людей), .k-inv (пригласить).
import type { ReactNode } from "react";
import { Dimensions, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { FireChip } from "@/components/Fire";
import { coverUri } from "@/lib/covers";
import { costShort, dayShort, plural } from "@/lib/format";
import { interestIcon, distanceShort } from "@/lib/interests";
import type { FeedEvent, PersonCard } from "@/lib/types";
import { K, KI, KGlass, KPressGlass, PhotoShade, Press, kem, kf } from "./index";

const SCREEN_W = Dimensions.get("window").width;
/** .k-hs > .k-hc: две карточки на экран — (100% − 16) / 2, не шире 220, пропорция 3 : 4.2. */
export const HC_W = Math.min(220, Math.floor((SCREEN_W - 40 - 16) / 2));
export const HC_H = Math.round((HC_W * 4.2) / 3);
/** Внутри .k-biz поля 14 вместо 20. */
export const HC_W_BIZ = Math.min(220, Math.floor((SCREEN_W - 40 - 16) / 2));

/** Заголовок в две строки, последнее слово — Lora Italic (TwoLine из мини-аппа). */
export function TwoLine({ text, size = 15, emSize = 17, color = "#fff" }: { text: string; size?: number; emSize?: number; color?: string }) {
  const t = text.trim();
  const i = t.lastIndexOf(" ");
  const base = [kf("500", size, { lh: 1.2, ls: -0.01, color })];
  if (i < 3 || t.length > 34) return <Text style={base} numberOfLines={3}>{t}</Text>;
  return (
    <Text style={base} numberOfLines={3}>
      {t.slice(0, i)}
      {"\n"}
      <Text style={[kem(emSize), { color }]}>{t.slice(i + 1)}</Text>
    </Text>
  );
}

/** Вертикальная карточка встречи .k-hc: тег, название, «когда · кто», «Я иду» и огонёк. */
export function KHc({ e, width = HC_W, cta, tag }: { e: FeedEvent; width?: number; cta?: string; tag?: ReactNode }) {
  const going = e.seatsTaken + 1;
  const max = e.seatsTotal + 1;
  const left = Math.max(0, e.seatsTotal - e.seatsTaken);
  const when = `${dayShort(e.eventDate)}, ${e.eventTime.slice(0, 5)}`;
  const who = e.isBusiness
    ? left > 0 ? `${left} ${plural(left, "место", "места", "мест")}` : "мест нет"
    : e.isAnonymous || e.organizerHidden ? "анонимно" : e.organizer?.name ?? null;
  const kind = e.trainingType?.name ?? e.category?.name;
  const defTag: ReactNode = e.isLive ? (
    <Text style={kf("400", 12, { color: "#fff" })}><Text style={{ color: "#5BE39A" }}>● </Text>Идёт сейчас</Text>
  ) : e.isBusiness ? (e.isPromoted || e.isBoosted ? "↑ В топе" : e.category?.name ?? "Афиша")
    : e.isAnonymous || e.organizerHidden ? `${going} из ${max} · анонимно` : `${going} из ${max}${kind ? ` · ${kind.toLowerCase()}` : ""}`;
  const status = e.isMine ? "Моя встреча" : e.myApplicationStatus === "accepted" ? "Ты идёшь" : e.myApplicationStatus === "pending" ? "Заявка отправлена" : null;
  const t = tag ?? defTag;
  const cover = coverUri(e.photoUrl);
  const height = Math.round((width * 4.2) / 3);
  return (
    <Press photo onPress={() => router.push(`/event/${e.id}` as Href)} style={{ width, height, borderRadius: 26, backgroundColor: "#282330" }}>
      {cover ? (
        <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} cachePolicy="memory-disk" recyclingKey={e.id} />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: "#2B2737" }]} />
      )}
      <PhotoShade from={0.38} to={0.78} />
      <KGlass tone="gw" style={{ position: "absolute", top: 10, left: 10, maxWidth: width - 20, height: 28, borderRadius: 14, justifyContent: "center", paddingHorizontal: 10 }}>
        {typeof t === "string" ? <Text style={kf("400", 12, { color: "#fff" })} numberOfLines={1}>{t}</Text> : t}
      </KGlass>
      <View style={{ position: "absolute", left: 12, right: 12, bottom: 12 }}>
        <TwoLine text={e.title} />
        <Text style={[kf("400", 11.5, { color: "#fff" }), { opacity: 0.85, marginTop: 4 }]} numberOfLines={1}>
          {[when, who].filter(Boolean).join(" · ")}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 8 }}>
          <View style={{ height: 28, paddingHorizontal: 10, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.92)", justifyContent: "center", flexShrink: 1 }}>
            <Text style={kf("600", 12)} numberOfLines={1}>{cta ?? status ?? (e.isBusiness ? costShort(e) : "Я иду")}</Text>
          </View>
          <FireChip eventId={e.id} count={e.fireCount ?? 0} mine={!!e.myFire} />
        </View>
      </View>
    </Press>
  );
}

/** Скелет карточки во время загрузки (.k-hc.k-sk). */
export function KHcSkeleton({ width = HC_W }: { width?: number }) {
  return <View style={{ width, height: Math.round((width * 4.2) / 3), borderRadius: 26, backgroundColor: "rgba(23,20,31,0.06)" }} />;
}

/** .k-inv: «Сегодня пока тихо — создай первую встречу». */
export function KInv({ text, onPress, width = HC_W }: { text: string; onPress: () => void; width?: number }) {
  return (
    <KPressGlass onPress={onPress} style={{ width, height: Math.round((width * 4.2) / 3), borderRadius: 26 }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12, paddingHorizontal: 18 }}>
        <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: K.ink, alignItems: "center", justifyContent: "center" }}>
          <Text style={kf("300", 32, { color: "#fff" })}>+</Text>
        </View>
        <Text style={[kf("500", 14, { lh: 1.3 }), { textAlign: "center" }]}>{text}</Text>
      </View>
    </KPressGlass>
  );
}

/** Мозаика людей .k-mz: одна большая (58%) и две маленькие (42%), высота 268. */
type MosaicPerson = Pick<PersonCard, "id" | "name" | "avatarUrl"> & {
  age: number | null;
  sharedCount?: number;
  sharedInterests?: string[];
  distanceM?: number | null;
};

export function KMosaic<P extends MosaicPerson>({ people, city, onOpen, isNew, subtitle }: {
  people: P[];
  city?: string | null;
  onOpen: (p: P) => void;
  isNew?: (p: P) => boolean;
  subtitle?: (p: P) => string;
}) {
  const m = people.slice(0, 3);
  if (!m.length) return null;
  const W = SCREEN_W - 40;
  const big = Math.round(W * 0.58 - 6);
  const small = Math.round(W * 0.42 - 6);
  const box = (i: number) => {
    if (m.length === 1) return { left: 0, top: 0, width: W, height: 268 };
    if (i === 0) return { left: 0, top: 0, width: big, height: 268 };
    if (m.length === 2) return { right: 0, top: 0, width: small, height: 268 };
    return i === 1 ? { right: 0, top: 0, width: small, height: 128 } : { right: 0, top: 140, width: small, height: 128 };
  };
  return (
    <View style={{ height: 268, marginTop: 14 }}>
      {m.map((q, i) => (
        <View key={q.id} style={[{ position: "absolute", borderRadius: 26, shadowColor: "rgb(60,40,110)", shadowOpacity: 0.14, shadowRadius: 12, shadowOffset: { width: 0, height: 10 } }, box(i)]}>
          <Press photo onPress={() => onOpen(q)} style={{ flex: 1, borderRadius: 26, backgroundColor: "#2B2737" }}>
            {q.avatarUrl ? <Image source={{ uri: q.avatarUrl }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition={{ top: "30%" }} transition={150} cachePolicy="memory-disk" /> : null}
            <PhotoShade from={0.5} to={0.72} />
            {isNew?.(q) ? (
              <KGlass tone="gd" style={{ position: "absolute", top: 9, left: 9, height: 28, paddingHorizontal: 9, borderRadius: 14, flexDirection: "row", gap: 5, alignItems: "center" }}>
                <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: "#FF4F8B", alignItems: "center", justifyContent: "center" }}><KI n="heart" size={12} color="#fff" /></View>
                <Text style={kf("500", 11.5, { color: "#fff" })}>Новое</Text>
              </KGlass>
            ) : (q.sharedCount ?? 0) > 0 ? (
              <KGlass tone="gw" style={{ position: "absolute", top: 9, left: 9, height: 28, borderRadius: 14 }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3, height: 28, paddingLeft: 5, paddingRight: 9 }}>
                  {(q.sharedInterests ?? []).slice(0, 2).map((n) => (
                    <Image key={n} source={{ uri: interestIcon(n) }} style={{ width: 18, height: 18 }} contentFit="contain" />
                  ))}
                  <Text style={kf("500", 11.5, { color: "#fff" })}>{q.sharedCount} общ.</Text>
                </View>
              </KGlass>
            ) : null}
            <View style={{ position: "absolute", left: 12, right: 12, bottom: 11 }}>
              <Text style={kf("500", 15, { color: "#fff" })} numberOfLines={1}>{q.name}{q.age ? `, ${q.age}` : ""}</Text>
              <Text style={[kf("400", 11.5, { color: "#fff" }), { opacity: 0.85, marginTop: 2 }]} numberOfLines={1}>
                {subtitle ? subtitle(q) : q.distanceM != null ? (q.distanceM <= 0 ? "рядом" : `≈ ${distanceShort(q.distanceM)}`) : city ?? ""}
              </Text>
            </View>
          </Press>
        </View>
      ))}
    </View>
  );
}
