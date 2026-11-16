import { ActionSheetIOS, Alert, Linking, Platform } from "react-native";

/**
 * «Маршрут» — сначала спрашиваем, чем строить (Яндекс Карты, 2ГИС, Карты телефона).
 * «Отмена» — ничего не открываем. Раньше отказ в системном окне считался ошибкой,
 * и мы всё равно открывали Яндекс Карты через сайт.
 */
export function openRoute(lat: number, lon: number) {
  const opts: [string, () => void][] = [
    ["Яндекс Карты", () => open(`yandexmaps://maps.yandex.ru/?rtext=~${lat},${lon}&rtt=auto`, `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`)],
    ["2ГИС", () => open(`dgis://2gis.ru/routeSearch/rsType/car/to/${lon},${lat}`, `https://2gis.ru/routeSearch/rsType/car/to/${lon},${lat}`)],
    Platform.OS === "ios"
      ? ["Карты Apple", () => open(`maps://?daddr=${lat},${lon}`, `https://maps.apple.com/?daddr=${lat},${lon}`)]
      : ["Google Карты", () => open(`google.navigation:q=${lat},${lon}`, `https://www.google.com/maps/dir/?api=1&destination=${lat},${lon}`)],
  ];
  if (Platform.OS === "ios") {
    ActionSheetIOS.showActionSheetWithOptions(
      { title: "Построить маршрут", options: [...opts.map((o) => o[0]), "Отмена"], cancelButtonIndex: opts.length },
      (i) => opts[i]?.[1]()
    );
  } else {
    Alert.alert("Построить маршрут", undefined, [...opts.map(([text, onPress]) => ({ text, onPress })), { text: "Отмена", style: "cancel" as const }], { cancelable: true });
  }
}

/** Приложение установлено — открываем его; нет — сайт. Отказ пользователя в системном окне — ничего не делаем. */
async function open(app: string, web: string) {
  const has = await Linking.canOpenURL(app).catch(() => false);
  if (has) {
    Linking.openURL(app).catch(() => {});
    return;
  }
  Linking.openURL(web).catch(() => {});
}
