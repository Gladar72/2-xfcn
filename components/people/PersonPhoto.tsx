"use client";

import { useEffect, useRef, useState } from "react";
import { photoThumb } from "@/lib/photos/thumb";
import { mosyaSrc } from "@/components/brand/Mosya";

/** Share this URL with preloading: a different width is a separate network request. */
export const personPhotoUrl = (src: string) => photoThumb(src, 320, true);

type Props = { priority?: boolean; src: string; className?: string; retry?: number; onReady?: () => void; onFailure?: () => void };

export function PersonPhoto({ retry = 0, ...props }: Props) {
  return <RecoveringPhoto key={`${props.src}:${retry}`} {...props} />;
}

function RecoveringPhoto({ src, className, onReady, onFailure, priority = false }: Props) {
  const [failed, setFailed] = useState(0);
  const image = useRef<HTMLImageElement>(null);
  const callbacks = useRef({ onReady, onFailure });
  callbacks.current = { onReady, onFailure };
  // The same 1080px image as the home mosaic: reuse the browser cache on entry.
  // Originals stay available as a fallback if optimization is unavailable.
  const candidates = [...new Set([personPhotoUrl(src), src])];
  const exhausted = failed >= candidates.length;
  const current = candidates[failed];
  useEffect(() => {
    if (exhausted) { callbacks.current.onFailure?.(); return; }
    const img = image.current;
    if (!img) return;
    let settled = false;
    const timer = setTimeout(fail, 10_000);
    function loaded() {
      if (settled || !img?.naturalWidth) return;
      settled = true;
      clearTimeout(timer);
      // onLoad/complete already means this image can be shown. Waiting for
      // decode() again can hang indefinitely in a Telegram WebView.
      callbacks.current.onReady?.();
    }
    function fail() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      // React may replay this effect for an already-failed cached image.
      // Advancing from the captured candidate is idempotent; incrementing the
      // latest state could skip the optimizer before it is requested.
      setFailed(failed + 1);
    }
    img.addEventListener("load", loaded);
    img.addEventListener("error", fail);
    if (img.complete) { if (img.naturalWidth) loaded(); else fail(); }
    return () => {
      settled = true; clearTimeout(timer);
      img.removeEventListener("load", loaded); img.removeEventListener("error", fail);
    };
  }, [current, exhausted, failed]);
  return (
    // A new candidate needs a fresh element: complete/naturalWidth can still
    // describe the previous failed URL immediately after changing src.
    // eslint-disable-next-line @next/next/no-img-element
    <img key={current ?? "placeholder"} ref={image} src={current ?? mosyaSrc("wave")} className={className} alt="" fetchPriority={priority ? "high" : "low"} decoding="async" draggable={false} />
  );
}
