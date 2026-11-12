import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const portrait = "https://db.mesto-go.ru/storage/v1/object/public/photos/entry.jpg";
const person = { id: "00000000-0000-4000-8000-000000000001", name: "Анна", age: 28,
  avatarUrl: portrait, photos: [portrait], bio: "Люблю кофе", sharedInterests: [], interests: [],
  sharedCount: 0, ratingAvg: 5, completedMeetingsCount: 2, distanceM: 500 };
const active = (page: Page) => page.locator('section[data-id="person"]:not(.ghost)');
const shown = (page: Page) => active(page).locator(".gal > img.on");

async function fixture(page: Page) {
  const bytes = await readFile("public/brand/covers/coffee.webp");
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["deck", "person", "feed"] }));
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", r => {
    const path = new URL(r.request().url()).pathname;
    const json = path === "/api/people" ? { items: [person], meHasLocation: true }
      : path.startsWith("/api/users/") ? person
      : path === "/api/me/profile" ? { city: "Тюмень" }
      : path === "/api/categories" ? { categories: [], trainingTypes: [] }
      : { items: [] };
    return r.fulfill({ json });
  });
  await page.route("**/_next/image?**", r => r.fulfill({ contentType: "image/webp", body: bytes }));
  await page.route(portrait, r => r.fulfill({ contentType: "image/webp", body: bytes }));
  return bytes;
}

test("opening a home portrait never fades the selected card back to transparent", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/people?deck=1**", async r => {
    await gate;
    await r.fulfill({ json: { items: [person], meHasLocation: true } }).catch(() => {});
  });
  try {
    await page.goto("/feed");
    await page.locator(".k-mt").filter({ hasText: person.name }).tap();
    await expect(active(page)).toBeVisible({ timeout: 20_000 });
    await expect.poll(() => shown(page).evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
    await page.evaluate(() => {
      const state = { frames: [] as number[], done: false };
      (window as unknown as { entryFrames: typeof state }).entryFrames = state;
      function sample() {
        const card = document.querySelector('section[data-id="person"]:not(.ghost)');
        const image = card?.querySelector<HTMLImageElement>(".gal > img.on");
        state.frames.push(card && image?.naturalWidth
          ? Number(getComputedStyle(card).opacity) * Number(getComputedStyle(image).opacity) : 0);
        if (state.frames.length < 40) requestAnimationFrame(sample);
        else state.done = true;
      }
      requestAnimationFrame(sample);
    });
    release();
    await expect(active(page).getByRole("button", { name: "Поставить сердечко" })).toBeVisible();
    await page.waitForFunction(() => (window as unknown as { entryFrames: { done: boolean } }).entryFrames.done);
    const frames = await page.evaluate(() => (window as unknown as { entryFrames: { frames: number[] } }).entryFrames.frames);
    expect(Math.min(...frames)).toBeGreaterThanOrEqual(0.99);
  } finally { release(); }
});

for (const available of [true, false]) {
  test(`the loaded home thumbnail survives slow validation (available=${available})`, async ({ page }) => {
    const bytes = await fixture(page);
    let releaseDeck = () => {};
    let releasePhoto = () => {};
    const deckGate = new Promise<void>(resolve => { releaseDeck = resolve; });
    const photoGate = new Promise<void>(resolve => { releasePhoto = resolve; });
    const sideRequests: string[] = [];
    page.on("request", r => { if (/\/api\/(likes|follows)/.test(r.url())) sideRequests.push(r.url()); });
    await page.route("**/api/people?deck=1**", async r => {
      await deckGate;
      await r.fulfill({ json: { items: available ? [person] : [], meHasLocation: true } }).catch(() => {});
    });
    await page.route(portrait, async r => {
      await photoGate;
      await r.fulfill({ contentType: "image/webp", body: bytes }).catch(() => {});
    });
    try {
      await page.goto("/feed");
      const card = page.locator(".k-mt").filter({ hasText: person.name });
      const thumbnail = await card.evaluate(el => getComputedStyle(el).backgroundImage.slice(5, -2));
      // The feed already decoded this exact thumbnail; its original is still slow.
      await page.evaluate(async src => { const im = new Image(); im.src = src; await im.decode(); }, thumbnail);
      await card.tap();
      await expect(active(page)).toBeVisible({ timeout: 20_000 });
      await expect.poll(() => shown(page).evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
      await expect(active(page).getByRole("button", { name: "Поставить сердечко" })).toHaveCount(0);
      expect(sideRequests).toEqual([]);
      releaseDeck();
      if (!available) {
        await expect(page.getByText("Этот профиль больше недоступен.", { exact: true })).toBeVisible();
        await expect(active(page)).toHaveCount(0);
        expect(sideRequests).toEqual([]);
        return;
      }
      await expect(active(page).getByRole("button", { name: "Поставить сердечко" })).toBeVisible();
      await expect(shown(page)).toHaveJSProperty("src", thumbnail);
      releasePhoto();
      // Full profile reuses the mosaic thumbnail; no second original download.
      await expect(shown(page)).toHaveJSProperty("src", thumbnail);
      await expect.poll(() => shown(page).evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
    } finally { releaseDeck(); releasePhoto(); }
  });
}
