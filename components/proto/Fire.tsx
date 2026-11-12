/** «Огонёк» — значок для счётчика на карточке и кнопки на экране события. */
export function FireIcon({ size = 18, off = false }: { size?: number; off?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden style={{ flex: "none", display: "block" }}>
      <defs>
        <linearGradient id="k-fire-g" x1="0" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#FF4D12" />
          <stop offset=".6" stopColor="#FF8A1F" />
          <stop offset="1" stopColor="#FFC93C" />
        </linearGradient>
      </defs>
      <path
        fill={off ? "none" : "url(#k-fire-g)"}
        stroke={off ? "currentColor" : "none"}
        strokeWidth={off ? 1.7 : 0}
        strokeLinejoin="round"
        d="M12 2.2c.6 3.1 2.6 4.9 4.3 6.8 1.6 1.8 2.9 3.8 2.9 6.4A7.2 7.2 0 0 1 12 22.6a7.2 7.2 0 0 1-7.2-7.2c0-2.3 1-4.2 2.4-5.6.3 1.6 1.1 2.7 2.3 3.3-.4-3.9 1-7.7 2.5-10.9z"
      />
      {off ? null : <path fill="#FFE7A3" d="M12 13.2c.4 1.5 1.6 2.4 2.2 3.6.5 1 .5 2.1.1 3a3.1 3.1 0 0 1-4.7 1.1 3 3 0 0 1-1-3.3c.4-1.5 2.4-2.6 3.4-4.4z" />}
    </svg>
  );
}
