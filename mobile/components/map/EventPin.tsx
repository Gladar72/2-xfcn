import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { f } from "@/lib/theme";

/** Острый конец метки совпадает с её координатой; фото и резервная иконка внутри одной капли. */
export function EventPin({ photo, icon, badge, count }: { photo?: string | null; icon: string; badge?: string; count?: number }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = !!photo && failedPhoto !== photo;
  return (
    <View style={s.box}>
      <View style={s.drop} />
      <Image source={{ uri: showPhoto ? photo : icon }} contentFit={showPhoto ? "cover" : "contain"} style={s.image}
        onError={showPhoto ? () => setFailedPhoto(photo) : undefined} />
      {count ? <View style={s.count}><Text style={s.number}>{count > 99 ? "99+" : count}</Text></View> :
        badge && showPhoto ? <Image source={{ uri: badge }} style={s.badge} contentFit="contain" /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: 56, height: 61, alignItems: "center" },
  drop: { position: "absolute", top: 2, width: 48, height: 48, borderRadius: 24, borderBottomLeftRadius: 0, backgroundColor: "#17141F", transform: [{ rotate: "-45deg" }] },
  image: { marginTop: 5, width: 42, height: 42, borderRadius: 21, backgroundColor: "#F3F1F6" },
  badge: { position: "absolute", right: 0, bottom: 8, width: 21, height: 21, borderRadius: 11, backgroundColor: "#fff" },
  count: { position: "absolute", right: 0, top: 0, minWidth: 22, height: 22, paddingHorizontal: 3, borderRadius: 11, backgroundColor: "#fff", borderColor: "#17141F", borderWidth: 2, alignItems: "center", justifyContent: "center" },
  number: { fontSize: 11, ...f("600"), color: "#17141F" },
});
