/** Ссылка на маршрут до точки в Яндекс Картах (откуда — определят сами Карты). */
export function routeUrl(latitude: number, longitude: number): string {
  return `https://yandex.ru/maps/?rtext=~${latitude},${longitude}&rtt=auto`;
}

/** Открывает маршрут: внутри Telegram — через openLink (во внешнем браузере / приложении Карт). */
export function openRoute(latitude: number, longitude: number): void {
  const url = routeUrl(latitude, longitude);
  const tg = (window as unknown as { Telegram?: { WebApp?: { openLink?: (u: string) => void } } }).Telegram?.WebApp;
  if (tg?.openLink) tg.openLink(url);
  else window.open(url, "_blank", "noopener");
}
