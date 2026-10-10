import { useId } from "react";
import { LOGO_LETTERS, LOGO_M, LOGO_VIEWBOX, MARK_VIEWBOX } from "./logo-paths";

const GRAD_STOPS = (
  <>
    <stop offset="0" stopColor="#7A45FF" />
    <stop offset=".55" stopColor="#B04CFF" />
    <stop offset="1" stopColor="#FF6FA0" />
  </>
);

interface LogoProps {
  /** Высота логотипа в px (ширина считается сама). */
  height?: number;
  /** Цвет букв. По умолчанию — currentColor. */
  color?: string;
  /** «м» фирменным градиентом. */
  gradientM?: boolean;
  className?: string;
}

/** Полный логотип «место». */
export function Wordmark({ height = 28, color = "currentColor", gradientM = false, className }: LogoProps) {
  const [, , w = 1, h = 1] = LOGO_VIEWBOX.split(" ").map(Number);
  const id = "mwg" + useId().replace(/:/g, "");
  return (
    <svg
      viewBox={LOGO_VIEWBOX}
      height={height}
      width={(height * w) / h}
      className={className}
      role="img"
      aria-label="Место"
      style={{ display: "block", overflow: "visible" }}
    >
      {gradientM && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {GRAD_STOPS}
          </linearGradient>
        </defs>
      )}
      <g transform="scale(1,-1)">
        <path d={LOGO_M} fill={gradientM ? `url(#${id})` : color} />
        <g fill={color}>
          {LOGO_LETTERS.map((l, i) => (
            <path key={i} d={l.d} transform={l.transform} />
          ))}
        </g>
      </g>
    </svg>
  );
}

/** Сокращённый знак — одна «м» с петлёй. */
export function MarkM({ height = 28, color = "currentColor", gradientM = false, className }: LogoProps) {
  const [, , w = 1, h = 1] = MARK_VIEWBOX.split(" ").map(Number);
  const id = "mmg" + useId().replace(/:/g, "");
  return (
    <svg
      viewBox={MARK_VIEWBOX}
      height={height}
      width={(height * w) / h}
      className={className}
      role="img"
      aria-label="Место"
      style={{ display: "block", overflow: "visible" }}
    >
      {gradientM && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            {GRAD_STOPS}
          </linearGradient>
        </defs>
      )}
      <g transform="scale(1,-1)">
        <path d={LOGO_M} fill={gradientM ? `url(#${id})` : color} />
      </g>
    </svg>
  );
}
