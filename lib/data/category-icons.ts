/**
 * Категория → путь к 3D-иконке (редизайн 2026: глянцевые иконки в стиле Моси).
 * Общий источник для всех мест интерфейса, где нужна иконка категории.
 */
export const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/cat3d/i_gym.svg",
  cinema: "/brand/cat3d/i_kino.svg",
  coffee: "/brand/cat3d/i_kofe.svg",
  breakfast: "/brand/cat3d/i_zavtrak.svg",
  dinner: "/brand/cat3d/i_uzhin.svg",
  walk: "/brand/cat3d/i_hike.svg",
  active: "/brand/cat3d/i_camp.svg",
  party: "/brand/cat3d/i_party.svg",
  business: "/brand/cat3d/i_biz.svg",
  custom: "/brand/cat3d/i_art.svg",
};

/** Типы тренировок → 3D-иконки. Неизвестный тип — общая иконка тренировки. */
export const TRAINING_ICON: Record<string, string> = {
  running: "/brand/cat3d/i_run.svg",
  run: "/brand/cat3d/i_run.svg",
  gym: "/brand/cat3d/i_gym.svg",
  yoga: "/brand/cat3d/i_yoga.svg",
  cycling: "/brand/cat3d/i_bike.svg",
  bike: "/brand/cat3d/i_bike.svg",
  football: "/brand/cat3d/i_football.svg",
  tennis: "/brand/cat3d/i_tennis.svg",
  padel: "/brand/cat3d/i_tennis.svg",
  swimming: "/brand/cat3d/i_swim.svg",
  swim: "/brand/cat3d/i_swim.svg",
  boxing: "/brand/cat3d/i_box.svg",
  martial: "/brand/cat3d/i_box.svg",
  ski: "/brand/cat3d/i_ski.svg",
  skiing: "/brand/cat3d/i_ski.svg",
  roller: "/brand/cat3d/i_roller.svg",
  hyrox: "/brand/cat3d/i_box.svg",
  custom: "/brand/cat3d/i_roller.svg",
  hike: "/brand/cat3d/i_hike.svg",
  hiking: "/brand/cat3d/i_hike.svg",
};

export function trainingIcon(slug?: string | null): string {
  if (!slug) return CATEGORY_ICON.training ?? "";
  return TRAINING_ICON[slug] ?? TRAINING_ICON[slug.split(/[-_]/)[0] ?? ""] ?? CATEGORY_ICON.training ?? "";
}
