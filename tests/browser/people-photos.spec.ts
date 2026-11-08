import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const first = "/brand/covers/coffee.webp";
const second = "/brand/covers/walk.webp";
const person = { id: "photo-0", name: "Анна", age: 28, city: "Тюмень", avatarUrl: first,
  photos: [first, second], bio: "Люблю прогулки", interests: [], sharedInterests: [],
  commonInterests: [], ratingAvg: 0, completedMeetingsCount: 1 };
const active = (page: Page) => page.locator('section[data-id="person"]:not(.ghost)');
const shown = (page: Page) => active(page).locator(".gal > img.on");

async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["deck", "person", "feed"] }));
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", r => {
    const path = new URL(r.request().url()).pathname;
    const json = path === "/api/people" ? { items: [person], city: "Тюмень", nextOffset: null }
      : path.startsWith("/api/users/") ? person
      : path === "/api/me/profile" ? { ...person, id: "me" }
      : { items: [], events: [], people: [] };
    return r.fulfill({ json });
  });
}

test("a full profile keeps its preview photo until the replacement photo loads", async ({ page }) => {
  await fixture(page);
  let profileReady = () => {};
  let photoReady = () => {};
  const profileGate = new Promise<void>(r => { profileReady = r; });
  const photoGate = new Promise<void>(r => { photoReady = r; });
  await page.route("**/api/users/photo-0", async r => {
    await profileGate;
    await r.fulfill({ json: { ...person, avatarUrl: second, photos: [second] } }).catch(() => {});
  });
  await page.route(`**${second}`, async r => { await photoGate; await r.continue().catch(() => {}); });
  try {
    await page.goto("/people", { waitUntil: "domcontentloaded" });
    await expect.poll(() => shown(page).evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
    profileReady();
    await expect(active(page).locator(`.gal > img[src="${second}"]`)).toHaveCount(1);
    await expect(shown(page)).toHaveAttribute("src", first);
    photoReady();
    await expect(shown(page)).toHaveAttribute("src", second);
  } finally { profileReady(); photoReady(); }
});

test("a hanging WebView decode does not keep a loaded photo invisible", async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    HTMLImageElement.prototype.decode = () => new Promise<void>(() => {});
  });
  await page.goto("/people/photo-0");
  await expect.poll(() => active(page).locator(`img[src="${second}"]`).evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
  await active(page).locator(".body").tap({ position: { x: 300, y: 200 } });
  await expect(shown(page)).toHaveAttribute("src", second);
});

test("failed portraits have a working retry and recover without reopening the profile", async ({ page }) => {
  await fixture(page);
  const url = "https://db.mesto-go.ru/storage/v1/object/public/photos/retry.jpg";
  let failed = true;
  const bytes = await readFile(`public${first}`);
  await page.route("**/api/users/photo-0", r => r.fulfill({ json: { ...person, avatarUrl: url, photos: [url] } }));
  await page.route(url, r => r.fulfill(failed ? { status: 503, body: "unavailable" } : { contentType: "image/webp", body: bytes }));
  await page.route("**/_next/image?**", r => r.fulfill({ status: 503, body: "unavailable" }));
  await page.goto("/people/photo-0");
  await expect(active(page).getByText("Не удалось загрузить фото", { exact: true })).toBeVisible();
  failed = false;
  await active(page).getByRole("button", { name: "Загрузить фото снова", exact: true }).tap();
  await expect.poll(() => shown(page).evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
  await expect(shown(page)).toHaveAttribute("src", url);
  await expect(active(page).getByText("Не удалось загрузить фото", { exact: true })).toHaveCount(0);
});

test("rapid photo taps keep the last loaded portrait until the selected photo is ready", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route(`**${second}`, async r => { await gate; await r.continue().catch(() => {}); });
  try {
    await page.goto("/people/photo-0", { waitUntil: "domcontentloaded" });
    await expect.poll(() => shown(page).evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
    for (let i = 0; i < 5; i++) await active(page).locator(".body").tap({ position: { x: 300, y: 200 } });
    await expect(shown(page)).toHaveAttribute("src", first);
    await expect(active(page).getByText("Загружаем фото…", { exact: true })).toBeVisible();
    release();
    await expect(shown(page)).toHaveAttribute("src", second);
    await expect(active(page).getByText("Загружаем фото…", { exact: true })).toHaveCount(0);
  } finally { release(); }
});

for (const trigger of ["button", "online"] as const) {
  test(`${trigger} recovery preserves an already loaded fallback portrait`, async ({ page }) => {
    await fixture(page);
    const url = "https://db.mesto-go.ru/storage/v1/object/public/photos/fallback.jpg";
    const bytes = await readFile(`public${first}`);
    let failed = true;
    let release = () => {};
    const gate = new Promise<void>(r => { release = r; });
    await page.route("**/api/users/photo-0", r => r.fulfill({ json: { ...person, avatarUrl: url, photos: [url, second] } }));
    await page.route(url, r => r.fulfill({ status: 503, body: "unavailable" }));
    await page.route("**/_next/image?**", r => r.fulfill({ contentType: "image/webp", body: bytes }));
    await page.route(`**${second}`, async r => {
      if (failed) return r.fulfill({ status: 503, body: "unavailable" });
      await gate;
      await r.continue().catch(() => {});
    });
    try {
      await page.goto("/people/photo-0");
      await expect(shown(page)).toHaveAttribute("src", /\/_next\/image/);
      await expect.poll(() => shown(page).evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
      const visibleImage = await shown(page).elementHandle();
      await active(page).locator(".body").tap({ position: { x: 300, y: 200 } });
      await expect(active(page).getByText("Не удалось загрузить фото", { exact: true })).toBeVisible();
      failed = false;
      if (trigger === "button") await active(page).getByRole("button", { name: "Загрузить фото снова", exact: true }).tap();
      else await page.evaluate(() => window.dispatchEvent(new Event("online")));
      await expect(active(page).getByText("Загружаем фото…", { exact: true })).toBeVisible();
      expect(await visibleImage!.evaluate((im: HTMLImageElement) => im.isConnected && im.naturalWidth > 0 && im.classList.contains("on"))).toBe(true);
      release();
      await expect(shown(page)).toHaveAttribute("src", second);
    } finally { release(); }
  });
}
