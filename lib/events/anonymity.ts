/**
 * Анонимные встречи: организатор скрыт, пока его не одобрили.
 *
 * Пока заявка участника не одобрена, вместо имени и фото организатора
 * показываем «Анонимный организатор» (рейтинг и число встреч остаются —
 * чтобы было доверие), точный адрес и название места скрыты, а точка на
 * карте округлена до района (~1 км). После одобрения участник видит всё:
 * профиль организатора, адрес и попадает в чат встречи.
 *
 * Сервис всегда знает, кто организатор: жалобы и модерация работают как
 * обычно. Бизнес-события анонимными быть не могут.
 */
export const ANONYMOUS_ORGANIZER_NAME = "Анонимный организатор";
/** Пол анонимного организатора — его видно всем (имя и фото — нет). */
export type AnonGender = "female" | "male" | null;
export function anonGender(g: string | null | undefined): AnonGender {
  return g === "female" || g === "male" ? g : null;
}
/** «Анонимная девушка» / «Анонимный парень» — вместо имени скрытого организатора. */
export function anonymousOrganizerName(g: string | null | undefined): string {
  const x = anonGender(g);
  return x === "female" ? "Анонимная девушка" : x === "male" ? "Анонимный парень" : ANONYMOUS_ORGANIZER_NAME;
}
/** «Анонимно · девушка» — подпись-чип у анонимной встречи. */
export function anonymousTag(g: string | null | undefined): string {
  const x = anonGender(g);
  return x === "female" ? "Анонимно · девушка" : x === "male" ? "Анонимно · парень" : "Анонимно";
}
export const HIDDEN_PLACE_TEXT = "Место откроется после одобрения заявки";

/** Видит ли зритель организатора и точный адрес анонимной встречи. */
export function canSeeAnonymousDetails(opts: {
  isAnonymous: boolean | null | undefined;
  isOrganizer: boolean;
  applicationStatus: string | null | undefined;
}): boolean {
  if (!opts.isAnonymous) return true;
  return opts.isOrganizer || opts.applicationStatus === "accepted";
}

/** Точка «на уровне района»: ~1 км, без точного адреса. */
export function fuzzCoordinate(value: number | null): number | null {
  if (value === null || value === undefined) return value;
  return Math.round(value * 100) / 100;
}

/**
 * Анонимная встреча: профили друг друга видят ТОЛЬКО организатор и одобренный
 * участник (по решению владельца). Остальные — включая других участников и
 * организатора до одобрения заявки — видят только пол и условное имя
 * «Анонимная девушка №37». Номер постоянный для пары «встреча + человек»,
 * чтобы в чате было понятно, кто есть кто. Сам человек видит себя как обычно.
 */
export function anonAlias(eventId: string, userId: string, gender: string | null | undefined, isOrganizer = false): string {
  if (isOrganizer) return anonymousOrganizerName(gender);
  let h = 0;
  const s = `${eventId}:${userId}`;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const n = (h % 90) + 10;
  const x = anonGender(gender);
  return `${x === "female" ? "Анонимная девушка" : x === "male" ? "Анонимный парень" : "Аноним"} №${n}`;
}
