import { Linking } from "react-native";

/** Маршрут до места встречи в Яндекс Картах (приложение, если стоит, иначе сайт). */
export async function openRoute(lat: number, lon: number) {
  const app = `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lon}&rtt=auto`;
  const web = `https://yandex.ru/maps/?rtext=~${lat},${lon}&rtt=auto`;
  try {
    await Linking.openURL(app);
  } catch {
    await Linking.openURL(web);
  }
}
