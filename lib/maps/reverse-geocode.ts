/**
 * Обратное геокодирование: координаты → человекочитаемый адрес.
 * Используется, чтобы автоматически подставлять адрес при выборе точки
 * на карте в мастере создания встречи.
 *
 * Сам запрос к Yandex Geocoder уходит с СЕРВЕРА (см. app/api/geocode) —
 * ключ платного тарифа (YANDEX_GEOCODER_API_KEY, без префикса
 * NEXT_PUBLIC_) не должен попадать в код браузера, иначе его можно
 * вытащить из бандла сайта и накрутить лишних платных запросов.
 *
 * Если Geocoder недоступен (ключ не настроен/лимит исчерпан/ошибка сети) —
 * просто возвращает null, поле адреса остаётся пустым для ручного
 * заполнения (безопасный фолбэк, ничего не ломается).
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  try {
    const res = await fetch(`/api/geocode?lat=${latitude}&lng=${longitude}`);
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data?.address === "string" ? data.address : null;
  } catch {
    return null;
  }
}
