/**
 * Фильтры «Людей рядом» — тот же контракт, что lib/people/filters.ts на сервере:
 * пол, возраст 18–65 (65 = «65+», без верхней границы), интересы (хотя бы один).
 */
export const PEOPLE_MIN_AGE = 18;
export const PEOPLE_MAX_AGE = 65;

export interface PeopleFilters {
  gender: "all" | "male" | "female";
  ageMin: number;
  ageMax: number;
  interests: string[];
}

export const DEFAULT_PEOPLE_FILTERS: PeopleFilters = { gender: "all", ageMin: PEOPLE_MIN_AGE, ageMax: PEOPLE_MAX_AGE, interests: [] };

export function hasPeopleFilters(f: PeopleFilters): boolean {
  return f.gender !== "all" || f.ageMin !== PEOPLE_MIN_AGE || f.ageMax !== PEOPLE_MAX_AGE || f.interests.length > 0;
}

/** Фильтры → query-параметры для /api/people (только отличные от «по умолчанию»). */
export function peopleFilterQuery(f: PeopleFilters): Record<string, string> {
  const q: Record<string, string> = {};
  if (f.gender !== "all") q.gender = f.gender;
  if (f.ageMin !== PEOPLE_MIN_AGE) q.ageMin = String(f.ageMin);
  if (f.ageMax !== PEOPLE_MAX_AGE) q.ageMax = String(f.ageMax);
  if (f.interests.length) q.interests = [...f.interests].sort().join(",");
  return q;
}

/**
 * Случайный UUID v4 для «зерна» перемешивания: новый заход — новая подборка,
 * а внутри одного захода порядок стабилен при подгрузке следующих анкет.
 */
export function newVisitSeed(): string {
  const hex = "0123456789abcdef";
  let s = "";
  for (let i = 0; i < 36; i++) {
    if (i === 8 || i === 13 || i === 18 || i === 23) s += "-";
    else if (i === 14) s += "4";
    else if (i === 19) s += hex[(Math.random() * 4) | 8];
    else s += hex[(Math.random() * 16) | 0];
  }
  return s;
}
