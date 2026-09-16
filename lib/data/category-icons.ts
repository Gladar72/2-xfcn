/**
 * Категория → путь к 3D-иконке. Общий источник для всех мест интерфейса,
 * где нужна иконка категории встречи (карточка на главной, "Мои встречи",
 * аватарка чата и т.д.) — чтобы не дублировать и не рассинхронизировать
 * список в нескольких файлах.
 */
export const CATEGORY_ICON: Record<string, string> = {
  training: "/brand/3d/workout.png",
  cinema: "/brand/3d/movie.png",
  coffee: "/brand/3d/coffee.png",
  breakfast: "/brand/3d/breakfast.png",
  dinner: "/brand/3d/dinner.png",
  walk: "/brand/3d/walk.png",
  custom: "/brand/3d/custom-proposal.png",
};
