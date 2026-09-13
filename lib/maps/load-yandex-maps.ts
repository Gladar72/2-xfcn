"use client";

/**
 * Загружает Yandex Maps JS API 3.0 один раз (даже при повторном монтировании
 * компонента карты — например, при переходах между вкладками).
 *
 * ВАЖНО: свериться с актуальной документацией перед изменением —
 * https://yandex.ru/maps-api/docs/js-api/common/quickstart.html
 * В частности, для JS API 3.0 у ключа обязательно должно быть заполнено
 * поле "Ограничение по HTTP Referer" в кабинете разработчика, иначе карта
 * не загрузится.
 */

declare global {
  interface Window {
    ymaps3?: YMaps3Namespace;
  }
}

// Минимальный набор типов — JS API 3.0 не поставляет собственные типы,
// а сторонние @types часто отстают от версии. Расширяем по мере необходимости.
export interface YMaps3Namespace {
  ready: Promise<void>;
  import: (moduleName: string) => Promise<Record<string, unknown>>;
  [key: string]: unknown;
}

let loadPromise: Promise<YMaps3Namespace> | null = null;

export function loadYandexMaps(): Promise<YMaps3Namespace> {
  if (loadPromise) return loadPromise;

  loadPromise = new Promise((resolve, reject) => {
    if (window.ymaps3) {
      window.ymaps3.ready.then(() => resolve(window.ymaps3!));
      return;
    }

    const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;
    if (!apiKey) {
      reject(new Error("Отсутствует NEXT_PUBLIC_YANDEX_MAPS_API_KEY"));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${apiKey}&lang=ru_RU`;
    script.async = true;
    script.onload = () => {
      if (!window.ymaps3) {
        reject(new Error("ymaps3 не появился после загрузки скрипта"));
        return;
      }
      window.ymaps3.ready.then(() => resolve(window.ymaps3!));
    };
    script.onerror = () => reject(new Error("Не удалось загрузить Yandex Maps JS API"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
