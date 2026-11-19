import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { f } from "@/lib/theme";

/** Острый конец метки совпадает с её координатой; фото и резервная иконка внутри одной капли. */
type PinProps = { count: number; photo?: never; icon?: never; badge?: never }
  | { count?: never; photo?: string | null; icon: string; badge?: string };

export function EventPin({ photo, icon, badge, count }: PinProps) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = !!photo && failedPhoto !== photo;
  return (
    <View style={s.box}>
      <View style={s.drop} />
      {count !== undefined ? <View style={s.count}><Text numberOfLines={1} adjustsFontSizeToFit style={s.countText}>{count}</Text></View> :
        <Image source={{ uri: showPhoto ? photo : icon }} contentFit={showPhoto ? "cover" : "contain"} style={s.image}
        onError={showPhoto ? () => setFailedPhoto(photo) : undefined} />}
      {badge && showPhoto ? <Image source={{ uri: badge }} style={s.badge} contentFit="contain" /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: 56, height: 60, alignItems: "center" },
  drop: { position: "absolute", top: 2, width: 48, height: 48, borderRadius: 24, borderBottomLeftRadius: 0, backgroundColor: "#17141F", transform: [{ rotate: "-45deg" }] },
  count: { marginTop: 5, width: 42, height: 42, alignItems: "center", justifyContent: "center" },
  countText: { ...f("600"), fontSize: 20, color: "#fff", includeFontPadding: false },
  image: { marginTop: 5, width: 42, height: 42, borderRadius: 21, backgroundColor: "#F3F1F6" },
  badge: { position: "absolute", right: 0, bottom: 8, width: 21, height: 21, borderRadius: 11, backgroundColor: "#fff" },
});
