/**
 * Грубая оценка смещения UTC для точки на территории России по долготе.
 * Нужна, потому что event_time хранится "наивным" временем — тем самым,
 * что организатор ввёл на своём телефоне (в СВОЁМ местном поясе), без
 * привязки к часовому поясу. Сравнивать такое значение с now() (который
 * всегда в UTC) напрямую нельзя — разница в несколько часов может сделать
 * встречу либо "уже прошедшей", когда она ещё идёт, либо наоборот
 * "ещё идущей" на самом деле давно закончившуюся (см. lib/reviews/complete-due-events.ts).
 *
 * Границы примерные (реальные пояса не строго вертикальные по карте), но
 * этого достаточно, чтобы не промахиваться на много часов, как было раньше
 * без всякой поправки вообще.
 */
export function estimateRussiaUtcOffsetHours(longitude: number | null | undefined): number {
  if (longitude == null) return 3; // нет координат — считаем московское время (самый частый случай)
  if (longitude < 30) return 2; // Калининград
  if (longitude < 41) return 3; // Москва и европейская часть России
  if (longitude < 49) return 4; // Самара, Ижевск
  if (longitude < 61) return 5; // Екатеринбург, Тюмень
  if (longitude < 76) return 6; // Омск
  if (longitude < 105) return 7; // Красноярск, Новосибирск
  if (longitude < 116) return 8; // Иркутск
  if (longitude < 133) return 9; // Якутск, Чита
  if (longitude < 145) return 10; // Владивосток
  if (longitude < 156) return 11; // Сахалин, Магадан
  return 12; // Камчатка, Чукотка
}

/**
 * Превращает "наивную" пару дата+время (введённую организатором в своём
 * местном поясе) в настоящий момент UTC — с поправкой на оценённое
 * смещение пояса по долготе точки встречи.
 */
export function localEventTimeToUtc(dateIso: string, timeIso: string, longitude: number | null | undefined): Date {
  const offsetHours = estimateRussiaUtcOffsetHours(longitude);
  // "Z" заставляет распарсить как UTC независимо от таймзоны процесса —
  // без этого поведение зависело бы от TZ окружения сервера.
  const naiveAsUtc = new Date(`${dateIso}T${timeIso}Z`);
  return new Date(naiveAsUtc.getTime() - offsetHours * 60 * 60 * 1000);
}
