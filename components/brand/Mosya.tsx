/* eslint-disable @next/next/no-img-element */

/** Позы маскота Моси (глянцевая лавандовая метка, 4 ножки). */
export type MosyaPose = "stand" | "wave" | "jump" | "run" | "sit" | "phone" | "think" | "glasses";

export const mosyaSrc = (pose: MosyaPose) => `/brand/mosya/mosya_${pose}.webp`;

export function Mosya({
  pose = "stand",
  size = 120,
  className,
  style,
}: {
  pose?: MosyaPose;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <img
      src={mosyaSrc(pose)}
      alt=""
      width={size}
      height={size}
      className={className}
      style={{ objectFit: "contain", ...style }}
      draggable={false}
    />
  );
}
