import { describe, expect, it } from "vitest";
import { coverSources } from "@/lib/photos/cover-sources";
import { photoThumb } from "@/lib/photos/thumb";

describe("event cover recovery", () => {
  const stored = "https://db.mesto-go.ru/storage/v1/object/public/event-photos/example/photo.jpg";
  it("loads a feed cover through the app and retains the exact original on failure", () => {
    const [primary = "", original] = coverSources(stored, 480);
    const query = new URL(primary, "https://2-xfcn.vercel.app").searchParams;
    expect(primary.startsWith("/_next/image?")).toBe(true);
    expect(query.get("url")).toBe(stored);
    expect(query.get("w")).toBe("1920");
    expect(original).toBe(stored);
    expect(coverSources(stored, 480)).toHaveLength(2);
  });
  it("keeps full-size profile photos unchanged", () => {
    expect(photoThumb(stored, 480)).toBe(stored);
  });
  it("loads bundled presets on the current origin even from old stored domains", () => {
    for (const host of ["mesto-go.ru", "new.mesto-go.ru", "2-xfcn.vercel.app"]) {
      expect(coverSources(`https://${host}/brand/covers/dinner.webp`)[0]).toBe("/brand/covers/dinner.webp");
    }
  });
  it("does not rewrite an unrelated host or discard image query parameters", () => {
    const external = "https://example.com/brand/covers/dinner.webp?signature=keep%2Bexact";
    expect(coverSources(external)).toEqual([external]);
    expect(coverSources("/brand/covers/dinner.webp")).toEqual(["/brand/covers/dinner.webp"]);
    expect(coverSources(stored + "?v=2")[1]).toBe(stored + "?v=2");
  });
});
