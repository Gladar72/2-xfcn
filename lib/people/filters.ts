export const PEOPLE_MIN_AGE = 18;
export const PEOPLE_MAX_AGE = 65; // 65 means no upper age limit.
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PeopleFilters {
  gender: "all" | "male" | "female";
  ageMin: number;
  ageMax: number;
  interests: string[];
}
export const DEFAULT_PEOPLE_FILTERS: PeopleFilters = { gender: "all", ageMin: 18, ageMax: 65, interests: [] };

/** The same strict contract is used by the URL, dialog and server. */
export function readPeopleFilters(params: Pick<URLSearchParams, "get">): PeopleFilters | null {
  const gender = params.get("gender") ?? "all";
  const low = params.get("ageMin") ?? "18";
  const high = params.get("ageMax") ?? "65";
  const raw = params.get("interests");
  if (!["all", "male", "female"].includes(gender) || !/^\d{2}$/.test(low) || !/^\d{2}$/.test(high)) return null;
  const ageMin = Number(low), ageMax = Number(high);
  if (ageMin < 18 || ageMax > 65 || ageMin > ageMax) return null;
  if (raw !== null && (!raw || raw.length > 3699)) return null;
  const interests = raw ? [...new Set(raw.toLowerCase().split(","))].sort() : [];
  if (interests.length > 100 || interests.some(id => !UUID_PATTERN.test(id))) return null;
  return { gender: gender as PeopleFilters["gender"], ageMin, ageMax, interests };
}

export function peopleFilterParams(filters: PeopleFilters): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.gender !== "all") params.set("gender", filters.gender);
  if (filters.ageMin !== 18) params.set("ageMin", String(filters.ageMin));
  if (filters.ageMax !== 65) params.set("ageMax", String(filters.ageMax));
  if (filters.interests.length) params.set("interests", [...filters.interests].sort().join(","));
  return params;
}

export function hasPeopleFilters(filters: PeopleFilters): boolean {
  return filters.gender !== "all" || filters.ageMin !== 18 || filters.ageMax !== 65 || filters.interests.length > 0;
}
