"use client";

import { useState } from "react";
import { photoThumb } from "@/lib/photos/thumb";
import { mosyaSrc } from "@/components/brand/Mosya";

/** Share this URL with preloading: a different width is a separate network request. */
export const personPhotoUrl = (src: string) => src;

type Props = { src: string; className?: string; onReady?: () => void };

export function PersonPhoto({ src, className, onReady }: Props) {
  return <RecoveringPhoto key={src} src={src} className={className} onReady={onReady} />;
}

function RecoveringPhoto({ src, className, onReady }: Props) {
  const [failed, setFailed] = useState(0);
  // Full-screen portraits use the stored original, without a second lossy encode.
  const optimized = photoThumb(src, 420, true);
  const candidates = [...new Set([src, optimized, mosyaSrc("wave")])];
  const current = candidates[Math.min(failed, candidates.length - 1)]!;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={current} className={className} alt="" decoding="async" draggable={false}
      onLoad={async e => { const img = e.currentTarget; await img.decode().catch(() => {}); onReady?.(); }}
      onError={() => setFailed(n => Math.min(n + 1, candidates.length - 1))} />
  );
}
