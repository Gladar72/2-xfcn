/**
 * Звезда рейтинга — одна и та же везде (карточка встречи, заявки, профиль,
 * мини-профиль в чате, страница встречи). Раньше где-то был эмодзи ⭐, где-то
 * серая контурная звезда — теперь везде одна золотая иконка.
 */
export function RatingStar({ size = 14 }: { size?: number }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/mesto/assets/icons/svg/star.svg"
      alt=""
      width={size}
      height={size}
      className="inline-block shrink-0 align-[-2px]"
    />
  );
}
