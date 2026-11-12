"use client";

import { useEffect, useRef, useState } from "react";
import { photoThumb } from "@/lib/photos/thumb";
import { observeCover } from "@/lib/photos/observe-cover";

/** Decode only nearby card covers; keep originals as a recovery source. */
export function EventCardCover({ url }: { url?: string | null }) {
  return <CardCover key={url ?? "empty"} url={url} />;
}
function CardCover({ url }: { url?: string | null }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const preset = url?.match(/^(?:https?:\/\/[^/]+)?(\/brand\/covers\/[a-z0-9_-]+\.webp)$/)?.[1];
  const primary = preset ? `/_next/image?url=${encodeURIComponent(preset)}&w=640&q=80` : photoThumb(url, 210, true);
  const sources = [...new Set([primary, url].filter((src): src is string => !!src))];
  useEffect(() => {
    if (!ref.current || !url) return;
    return observeCover(ref.current, () => setReady(true));
  }, [url]);
  useEffect(() => {
    const retry = () => setAttempt(0);
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, []);
  return <span ref={ref} className="k-card-cover" aria-hidden>
    {ready && sources[attempt] && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={sources[attempt]} alt="" decoding="async" draggable={false} onError={() => setAttempt(attempt + 1)} />
    )}
  </span>;
}
