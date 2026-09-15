/**
 * Обратное геокодирование: координаты → человекочитаемый адрес.
 * Используется, чтобы автоматически подставлять адрес при выборе точки
 * на карте в мастере создания встречи — не заставлять человека вводить
 * его руками, если это можно определить по координатам.
 *
 * Использует тот же ключ, что и сама карта (NEXT_PUBLIC_YANDEX_MAPS_API_KEY).
 * Geocoder API — отдельный продукт Yandex Cloud; если для этого ключа он
 * не включён, запрос просто вернёт ошибку/пустой результат — тогда поле
 * адреса остаётся пустым и человек заполняет его сам, как раньше
 * (безопасный фолбэк, ничего не ломается).
 */
export async function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://geocode-maps.yandex.ru/1.x/?apikey=${apiKey}&geocode=${longitude},${latitude}&format=json&results=1&lang=ru_RU`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const text = data?.response?.GeoObjectCollection?.featureMember?.[0]?.GeoObject?.metaDataProperty
      ?.GeocoderMetaData?.text;

    return typeof text === "string" ? text : null;
  } catch {
    return null;
  }
}
