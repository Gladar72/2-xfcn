/**
 * template.tsx пересоздаётся при каждом переходе между разделами — новый
 * экран мягко въезжает справа с пружиной (как в прототипе). Нижняя
 * навигация живёт в layout.tsx и не анимируется.
 */
export default function AppSectionTemplate({ children }: { children: React.ReactNode }) {
  return <div className="m-page">{children}</div>;
}
