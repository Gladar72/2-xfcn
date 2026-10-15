"use client";

/**
 * Примерная геопозиция для «Люди рядом» и «встречи рядом» (браузер / мини-приложение).
 * На сервер уходит точка, которую он сразу огрубляет до сетки ~500 м (/api/me/location).
 */
const SENT_KEY = "mesto_geo_sent_at";
const EVERY_MS = 10 * 60e3;

/** Разрешение на геопозицию уже дано (без окна-запроса). Если браузер не умеет сказать — false. */
export async function geoGranted(): Promise<boolean> {
  try {
    const st = await navigator.permissions?.query({ name: "geolocation" as PermissionName });
    return st?.state === "granted";
  } catch {
    return false;
  }
}

/** Берёт текущую точку и отправляет на сервер. Может показать системный запрос, если разрешения ещё нет. */
export function sendMyLocation(): Promise<boolean> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(false);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        fetch("/api/me/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        })
          .then((r) => {
            if (r.ok) {
              try {
                localStorage.setItem(SENT_KEY, String(Date.now()));
              } catch {
                /* без хранилища — просто отправим в следующий раз снова */
              }
            }
            resolve(r.ok);
          })
          .catch(() => resolve(false));
      },
      () => resolve(false),
      { enableHighAccuracy: false, maximumAge: 10 * 60e3, timeout: 15e3 }
    );
  });
}

/**
 * Тихо обновить точку при заходе: только если разрешение уже есть и с прошлого раза
 * прошло больше 10 минут. Возвращает true, если точка обновилась (стоит перезагрузить ленту).
 */
export async function refreshLocationSilently(): Promise<boolean> {
  try {
    const last = Number(localStorage.getItem(SENT_KEY) ?? 0);
    if (Date.now() - last < EVERY_MS) return false;
  } catch {
    /* нет хранилища — проверяем разрешение как обычно */
  }
  if (!(await geoGranted())) return false;
  return sendMyLocation();
}
