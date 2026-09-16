export interface AddressSuggestion {
  address: string;
  latitude: number;
  longitude: number;
}

/**
 * Прямое геокодирование: текст → варианты адресов с координатами.
 * Используется для автодополнения, когда пользователь вводит адрес
 * вручную (не тапая по карте) — при выборе варианта карта сама
 * перемещается и ставит точку (см. LocationPicker, externalCoords).
 *
 * Тот же серверный роут /api/geocode, что и для обратного геокодирования —
 * ключ платного тарифа остаётся только на сервере.
 */
export async function searchAddress(query: string, city?: string): Promise<AddressSuggestion[]> {
  if (query.trim().length < 3) return [];
  try {
    const params = new URLSearchParams({ query });
    if (city) params.set("city", city);
    const res = await fetch(`/api/geocode?${params.toString()}`);
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data?.suggestions) ? data.suggestions : [];
  } catch {
    return [];
  }
}
