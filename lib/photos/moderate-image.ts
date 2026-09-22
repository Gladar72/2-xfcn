/**
 * Проверка фото на наготу/пошлость перед загрузкой — через Sightengine
 * (https://sightengine.com), бесплатный тариф — 2000 проверок в месяц.
 *
 * Нужны переменные окружения SIGHTENGINE_API_USER и SIGHTENGINE_API_SECRET
 * (регистрация на sightengine.com → Dashboard → API credentials).
 *
 * ВАЖНО: этот код не был проверен вживую (нет доступа к реальному
 * интернету в песочнице, где он писался) — при первом реальном
 * использовании стоит внимательно проверить, что модерация точно
 * отклоняет то, что должна, и не блокирует нормальные фото.
 */

export type ModerationResult =
  | { safe: true }
  | { safe: false; reason: string };

const NUDITY_THRESHOLD = 0.5; // выше — считаем небезопасным

export async function moderateImage(buffer: Buffer, mimeType: string): Promise<ModerationResult> {
  const apiUser = process.env.SIGHTENGINE_API_USER;
  const apiSecret = process.env.SIGHTENGINE_API_SECRET;

  // Если модерация не настроена (нет ключей) — пропускаем молча, чтобы
  // не ломать загрузку фото целиком из-за отсутствующей интеграции.
  // Как только ключи появятся в переменных окружения — заработает сама.
  if (!apiUser || !apiSecret) {
    console.warn("moderateImage: SIGHTENGINE_API_USER/SECRET не настроены — модерация пропущена");
    return { safe: true };
  }

  try {
    const form = new FormData();
    form.append("media", new Blob([new Uint8Array(buffer)], { type: mimeType }), "photo");
    form.append("models", "nudity-2.1,offensive");
    form.append("api_user", apiUser);
    form.append("api_secret", apiSecret);

    const res = await fetch("https://api.sightengine.com/1.0/check.json", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      // Сервис недоступен/ошибка запроса — не блокируем пользователя из-за
      // проблем на стороне модерации, просто пропускаем с предупреждением.
      console.error("moderateImage: Sightengine вернул статус", res.status);
      return { safe: true };
    }

    const data = await res.json();

    // nudity-2.1: raw/partial — доля "откровенной"/"частичной" наготы,
    // safe — доля "безопасно". offensive — жесты/оскорбительный контент.
    const nudityRaw = data?.nudity?.raw ?? 0;
    const nudityPartial = data?.nudity?.partial ?? 0;
    const offensiveProb = data?.offensive?.prob ?? 0;

    if (nudityRaw > NUDITY_THRESHOLD || nudityPartial > NUDITY_THRESHOLD) {
      return { safe: false, reason: "nudity" };
    }
    if (offensiveProb > NUDITY_THRESHOLD) {
      return { safe: false, reason: "offensive" };
    }

    return { safe: true };
  } catch (err) {
    // Сеть/таймаут — та же логика: не блокируем пользователя из-за
    // временной недоступности сервиса модерации.
    console.error("moderateImage: ошибка запроса к Sightengine:", err);
    return { safe: true };
  }
}
