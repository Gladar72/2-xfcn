import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const id = "00000000-0000-4000-8000-000000000012";
const portrait = "https://db.mesto-go.ru/storage/v1/object/public/photos/speed.jpg";
const person = { id, name: "Анна", age: 28, city: "Тюмень", avatarUrl: portrait, photos: [portrait],
  sharedInterests: [], sharedCount: 0, interests: [], ratingAvg: 5, completedMeetingsCount: 1 };
const active = (page: Page) => page.locator('section[data-id="person"]:not(.ghost)');

async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["feed", "deck", "person"] }));
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === "/api/me/profile" ? { city: "Тюмень" }
      : path === "/api/people" ? { items: [person], city: "Тюмень", meHasLocation: true, nextOffset: null }
      : path.startsWith("/api/users/") ? person : { items: [], categories: [] } });
  });
  const bytes = await readFile("public/brand/covers/coffee.webp");
  await page.route("**/_next/image?**", r => r.fulfill({ contentType: "image/webp", body: bytes }));
  return bytes;
}

test("Browse opens the already loaded first portrait while validation is slow", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/people?deck=1**", async r => { await gate; await r.fulfill({ json: { items: [person], nextOffset: null } }).catch(() => {}); });
  const originals: string[] = [];
  page.on("request", r => { if (r.url() === portrait) originals.push(r.url()); });
  try {
    await page.goto("/feed");
    await expect(page.locator(".k-mt")).toHaveCount(1);
    const thumbnail = await page.locator(".k-mt").evaluate(el => getComputedStyle(el).backgroundImage.slice(5, -2));
    await page.getByRole("link", { name: "Листать", exact: true }).tap();
    await expect(active(page).locator(".gal > img.on")).toHaveJSProperty("src", thumbnail);
    await expect.poll(() => active(page).locator(".gal > img.on").evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
    release();
    await expect(active(page).getByRole("button", { name: "Поставить сердечко" })).toBeVisible();
    await expect(active(page).locator(".gal > img.on")).toHaveJSProperty("src", thumbnail);
    expect(originals).toEqual([]);
  } finally { release(); }
});

test("returning home retains the people mosaic during a slow refresh", async ({ page }) => {
  await fixture(page);
  await page.goto("/feed");
  await expect(page.locator(".k-mt")).toHaveCount(1);
  await page.locator(".k-mt").tap();
  await expect(active(page)).toBeVisible();
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/people?city=**", async r => { await gate; await r.fulfill({ json: { items: [person], meHasLocation: true } }).catch(() => {}); });
  try {
    await page.goBack();
    await expect(page.locator('section[data-id="home"]:not(.ghost) .k-mt')).toHaveCount(1);
    await expect(page.locator('section[data-id="home"]:not(.ghost) .k-mt')).toContainText("Анна");
  } finally { release(); }
});

test("the current portrait loads before the next, without fetching the whole gallery", async ({ page }) => {
  const bytes = await fixture(page);
  const photos = Array.from({ length: 5 }, (_, i) => `/test-portraits/${i}.webp`);
  const requests: string[] = [];
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route(`**/api/users/${id}`, r => r.fulfill({ json: { ...person, avatarUrl: photos[0], photos } }));
  await page.route("**/test-portraits/**", async r => {
    const path = new URL(r.request().url()).pathname;
    requests.push(path);
    if (path === photos[0]) await gate;
    await r.fulfill({ contentType: "image/webp", body: bytes }).catch(() => {});
  });
  try {
    await page.goto(`/people/${id}`, { waitUntil: "domcontentloaded" });
    await expect(active(page).locator(".gal > img")).toHaveCount(1);
    await expect(active(page).locator(".gal > img")).toHaveAttribute("fetchpriority", "high");
    await expect.poll(() => requests.length).toBe(1);
    expect(requests).toEqual([photos[0]]);
    release();
    await expect(active(page).locator(".gal > img")).toHaveCount(2);
    await expect.poll(() => requests.length).toBe(2);
    expect(requests).toEqual(photos.slice(0, 2));
    await active(page).locator(".body").tap({ position: { x: 300, y: 200 } });
    await expect(active(page).locator(".gal > img.on")).toHaveAttribute("src", photos[1]!);
    await expect.poll(() => requests.length).toBe(3);
    expect(requests).toEqual(photos.slice(0, 3));
  } finally { release(); }
});
