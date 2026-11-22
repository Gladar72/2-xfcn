import type { CSSProperties } from "react";

type Variant = "p" | "e" | "anonymous" | "business";
const images = { p: "plain", e: "eyes", anonymous: "anonymous", business: "business" } as const;

/** Animated artwork from the App Store client. The static frame respects reduced motion. */
export function Creature({ size, variant = "e", className = "" }: { size?: number; variant?: Variant; className?: string }) {
  const image = variant === "e" && size && size > 104 ? "eyes-large" : images[variant];
  const style: CSSProperties = { display: "block", width: size ?? "100%", height: size ?? "100%", maxWidth: "100%", position: "relative" };
  return <picture className={`k-crf ${className}`} style={style} aria-hidden>
    <source media="(prefers-reduced-motion: reduce)" srcSet={`/brand/creature/m${variant === "p" ? "p" : "e"}00.webp`} />
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/brand/creature/ios60/${image}.webp`} alt="" draggable={false}
      style={{ display: "block", width: "100%", height: "100%", objectFit: "contain" }} />
  </picture>;
}
