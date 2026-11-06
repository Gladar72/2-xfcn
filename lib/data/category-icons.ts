/**
 * Категория → путь к иконке прототипа 2026 (public/brand/pi).
 * Общий источник для всех мест интерфейса, где нужна иконка категории.
 */
export const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/pi/training.svg",
  cinema: "/brand/pi/kino.svg",
  coffee: "/brand/pi/kofe.svg",
  breakfast: "/brand/pi/zavtrak.svg",
  dinner: "/brand/pi/uzhin.svg",
  walk: "/brand/pi/walk.svg",
  active: "/brand/pi/camp.svg",
  party: "/brand/pi/party.svg",
  business: "/brand/pi/biz.svg",
  custom: "/brand/pi/other.svg",
};

/** Типы тренировок → 3D-иконки. Неизвестный тип — общая иконка тренировки. */
export const TRAINING_ICON: Record<string, string> = {
  running: "/brand/pi/run.svg",
  run: "/brand/pi/run.svg",
  gym: "/brand/pi/gym.svg",
  yoga: "/brand/pi/yoga.svg",
  cycling: "/brand/pi/bike.svg",
  bike: "/brand/pi/bike.svg",
  football: "/brand/pi/football.svg",
  tennis: "/brand/pi/tennis.svg",
  padel: "/brand/pi/padel.svg",
  swimming: "/brand/pi/swim.svg",
  swim: "/brand/pi/swim.svg",
  boxing: "/brand/pi/box.svg",
  martial: "/brand/pi/box.svg",
  ski: "/brand/pi/ski.svg",
  skiing: "/brand/pi/ski.svg",
  roller: "/brand/pi/roller.svg",
  hyrox: "/brand/pi/hyrox.svg",
  custom: "/brand/pi/training.svg",
  hike: "/brand/pi/hike.svg",
  hiking: "/brand/pi/hike.svg",
};

export function trainingIcon(slug?: string | null): string {
  if (!slug) return CATEGORY_ICON.training ?? "";
  return TRAINING_ICON[slug] ?? TRAINING_ICON[slug.split(/[-_]/)[0] ?? ""] ?? CATEGORY_ICON.training ?? "";
}
