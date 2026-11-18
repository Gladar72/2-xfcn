import { useState } from "react";
import { StyleSheet, View } from "react-native";
import { Image } from "expo-image";

/** Острый конец метки совпадает с её координатой; фото и резервная иконка внутри одной капли. */
export function EventPin({ photo, icon, badge }: { photo?: string | null; icon: string; badge?: string }) {
  const [failedPhoto, setFailedPhoto] = useState<string | null>(null);
  const showPhoto = !!photo && failedPhoto !== photo;
  return (
    <View style={s.box}>
      <View style={s.drop} />
      <Image source={{ uri: showPhoto ? photo : icon }} contentFit={showPhoto ? "cover" : "contain"} style={s.image}
        onError={showPhoto ? () => setFailedPhoto(photo) : undefined} />
      {badge && showPhoto ? <Image source={{ uri: badge }} style={s.badge} contentFit="contain" /> : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { width: 56, height: 61, alignItems: "center" },
  drop: { position: "absolute", top: 2, width: 48, height: 48, borderRadius: 24, borderBottomLeftRadius: 0, backgroundColor: "#17141F", transform: [{ rotate: "-45deg" }] },
  image: { marginTop: 5, width: 42, height: 42, borderRadius: 21, backgroundColor: "#F3F1F6" },
  badge: { position: "absolute", right: 0, bottom: 8, width: 21, height: 21, borderRadius: 11, backgroundColor: "#fff" },
});
