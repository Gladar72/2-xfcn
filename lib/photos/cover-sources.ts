import { photoThumb } from "@/lib/photos/thumb";

const APP_HOSTS = new Set(["mesto-go.ru", "www.mesto-go.ru", "new.mesto-go.ru", "2-xfcn.vercel.app"]);

/** Cover loads through the app first; the original remains a recovery source. */
export function coverSources(url: string, displayPx = 640): string[] {
  let primary = url;
  try {
    const parsed = new URL(url);
    // Presets are shipped with every app build. Use the current origin so old
    // Telegram buttons do not depend on another domain to display them.
    if (parsed.protocol === "https:" && APP_HOSTS.has(parsed.hostname) &&
        /^\/brand\/covers\/[a-z]+\.webp$/.test(parsed.pathname)) {
      primary = parsed.pathname + parsed.search;
    }
  } catch {
    // Relative assets and local previews already work on the current origin.
  }
  // Unlike profile galleries, feed covers can use the image optimizer. This
  // keeps the browser request on the app origin and serves a supported format.
  const optimized = photoThumb(primary, displayPx, true);
  return [...new Set([optimized, primary, url])];
}
