/**
 * Категория → путь к 3D-иконке (редизайн 2026: глянцевые иконки в стиле Моси).
 * Общий источник для всех мест интерфейса, где нужна иконка категории.
 */
export const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/cat3d/i_gym.webp",
  cinema: "/brand/cat3d/i_kino.webp",
  coffee: "/brand/cat3d/i_kofe.webp",
  breakfast: "/brand/cat3d/i_zavtrak.webp",
  dinner: "/brand/cat3d/i_uzhin.webp",
  walk: "/brand/cat3d/i_hike.webp",
  active: "/brand/cat3d/i_camp.webp",
  party: "/brand/cat3d/i_party.webp",
  business: "/brand/cat3d/i_biz.webp",
  custom: "/brand/cat3d/i_art.webp",
};

/** Типы тренировок → 3D-иконки. Неизвестный тип — общая иконка тренировки. */
export const TRAINING_ICON: Record<string, string> = {
  running: "/brand/cat3d/i_run.webp",
  run: "/brand/cat3d/i_run.webp",
  gym: "/brand/cat3d/i_gym.webp",
  yoga: "/brand/cat3d/i_yoga.webp",
  cycling: "/brand/cat3d/i_bike.webp",
  bike: "/brand/cat3d/i_bike.webp",
  football: "/brand/cat3d/i_football.webp",
  tennis: "/brand/cat3d/i_tennis.webp",
  padel: "/brand/cat3d/i_tennis.webp",
  swimming: "/brand/cat3d/i_swim.webp",
  swim: "/brand/cat3d/i_swim.webp",
  boxing: "/brand/cat3d/i_box.webp",
  martial: "/brand/cat3d/i_box.webp",
  ski: "/brand/cat3d/i_ski.webp",
  skiing: "/brand/cat3d/i_ski.webp",
  roller: "/brand/cat3d/i_roller.webp",
  hyrox: "/brand/cat3d/i_box.webp",
  custom: "/brand/cat3d/i_roller.webp",
  hike: "/brand/cat3d/i_hike.webp",
  hiking: "/brand/cat3d/i_hike.webp",
};

export function trainingIcon(slug?: string | null) {
  if (!slug) return CATEGORY_ICON.training;
  return TRAINING_ICON[slug] ?? TRAINING_ICON[slug.split(/[-_]/)[0]] ?? CATEGORY_ICON.training;
}
