// Строка встречи в поиске — перенос RowCard мини-аппа (components/proto/ui.tsx):
// обложка 64, название, «Бизнес»/иконка · день, время · расстояние, лица идущих, «N из M · нужно ещё K», кнопка справа.
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { router, type Href } from "expo-router";
import { coverUri } from "@/lib/covers";
import { eventIcon } from "@/lib/theme";
import type { FeedEvent } from "@/lib/types";
import { K, KPressGlass, kf } from "./index";

function dayLong(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("ru-RU", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
}

export function RowCard({ e }: { e: FeedEvent }) {
  const going = e.seatsTaken + 1;
  const max = e.seatsTotal + 1;
  const full = e.seatsTaken >= e.seatsTotal;
  const cover = coverUri(e.photoUrl);
  const status = e.isMine ? "mine" : e.myApplicationStatus ?? null;
  const btn = status === "mine" ? { t: "Моя", bg: "rgba(23,20,31,0.06)", c: K.ink } : status === "pending" ? { t: "Ждём ответа", bg: "rgba(255,170,90,0.2)", c: "#B4610F" } : status === "accepted" ? { t: "Иду ✓", bg: "rgba(47,168,106,0.14)", c: "#1E7A4B" } : full ? { t: "Мест нет", bg: "rgba(23,20,31,0.06)", c: K.ink3 } : { t: "Я иду", bg: "rgba(23,20,31,0.07)", c: K.ink };
  const faces = (e.goingPreview ?? []).slice(0, 3);
  return (
    <KPressGlass onPress={() => router.push(`/event/${e.id}` as Href)} style={{ borderRadius: 22 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 10 }}>
        <View style={{ width: 64, height: 64, borderRadius: 16, overflow: "hidden", backgroundColor: "#F3EFFF", alignItems: "center", justifyContent: "center" }}>
          {cover ? <Image source={{ uri: cover }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" /> : <Image source={{ uri: eventIcon(e) }} style={{ width: 44, height: 44 }} contentFit="contain" />}
        </View>
        <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
          <Text style={kf("500", 15)} numberOfLines={1}>{e.title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, flexWrap: "wrap" }}>
            {e.isBusiness ? (
              <View style={{ height: 18, paddingHorizontal: 6, borderRadius: 6, backgroundColor: K.ink, justifyContent: "center" }}>
                <Text style={kf("600", 10.5, { color: "#fff" })}>Бизнес</Text>
              </View>
            ) : (
              <Image source={{ uri: eventIcon(e) }} style={{ width: 16, height: 16 }} contentFit="contain" />
            )}
            <Text style={kf("400", 12.5, { color: K.ink2 })} numberOfLines={1}>
              {dayLong(e.eventDate)}, {e.eventTime.slice(0, 5)}
            </Text>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            {faces.length ? (
              <View style={{ flexDirection: "row" }}>
                {faces.map((p, i) => (
                  <Image key={i} source={{ uri: p.avatarUrl ?? undefined }} style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 1.5, borderColor: "#fff", marginLeft: i ? -6 : 0, backgroundColor: "#ddd" }} contentFit="cover" />
                ))}
              </View>
            ) : null}
            {e.isLive ? <Text style={kf("500", 12.5, { color: "#1E9E5A" })}>● Идёт сейчас</Text> : null}
            <Text style={kf("400", 12.5, { color: K.ink2 })} numberOfLines={1}>
              {full ? "Заполнено" : <>{going} из {max} · <Text style={{ color: "#E2408A" }}>нужно ещё {max - going}</Text></>}
            </Text>
          </View>
        </View>
        <View style={{ height: 36, paddingHorizontal: 13, borderRadius: 18, backgroundColor: btn.bg, justifyContent: "center" }}>
          <Text style={kf("500", 13, { color: btn.c })}>{btn.t}</Text>
        </View>
      </View>
    </KPressGlass>
  );
}
