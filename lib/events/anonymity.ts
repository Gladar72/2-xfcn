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
