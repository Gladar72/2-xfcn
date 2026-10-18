/**
 * Обратное геокодирование: координаты → человекочитаемый адрес.
 * Используется, чтобы автоматически подставлять адрес при выборе точки
 * на карте в мастере создания встречи.
 *
 * Сам запрос уходит на НАШ сервер (см. app/api/geocode), а тот спрашивает
 * бесплатный геокодер OpenStreetMap (Nominatim). Ключи не нужны.
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
