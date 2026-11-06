import { expect, test, type Page } from "@playwright/test";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const people = Array.from({ length: 11 }, (_, i) => ({ id: id(i + 1), name: `Человек ${i + 1}`, age: 28, gender: "female", city: "Тюмень", avatarUrl: "/brand/covers/coffee.webp", photos: ["/brand/covers/coffee.webp"], interests: [], sharedInterests: [], ratingAvg: 5, completedMeetingsCount: 1, distanceM: i === 2 ? null : 700, distanceKm: i === 2 ? null : 0 }));
const active = (page: Page) => page.locator('section[data-id="person"]:not(.ghost)');

async function setup(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["deck", "feed"] }));
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  const requests: URL[] = [];
  const seeds: string[] = [];
  let moved = false;
  await page.route("**/api/**", r => {
    const url = new URL(r.request().url());
    if (url.pathname === "/api/people") {
      requests.push(url);
      const seed = url.searchParams.get("seed") ?? "missing";
      if (!seeds.includes(seed)) seeds.push(seed);
      // A deterministic stand-in for database seeded shuffle; SQL tests cover the real order.
      const shift = seeds.indexOf(seed) % people.length;
      let list = [...people.slice(shift), ...people.slice(0, shift)];
      const start = list.find(p => p.id === url.searchParams.get("start"));
      if (start) list = [start, ...list.filter(p => p.id !== start.id)];
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const deck = url.searchParams.has("deck");
      const selected = deck ? list.slice(offset, offset + 4) : list;
      // Include an overlapping row on later pages to verify client duplicate protection.
      const rows = deck && offset ? [list[0]!, ...selected] : selected;
      return r.fulfill({ json: { items: rows.map(p => ({ ...p, distanceM: p.distanceM === null ? null : moved ? 1800 : 700 })), city: "Тюмень", meHasLocation: true, nextOffset: deck && offset + 4 < list.length ? offset + 4 : null } });
    }
    const json = url.pathname.startsWith("/api/users/") ? people.find(p => url.pathname.endsWith(p.id))
      : url.pathname === "/api/me/profile" ? { city: "Тюмень" }
      : url.pathname === "/api/categories" ? { categories: [], trainingTypes: [] }
      : url.pathname === "/api/interests" ? { interests: [] } : { items: [] };
    return r.fulfill({ json });
  });
  return { requests, move: () => { moved = true; } };
}
async function swipe(page: Page, right = false) {
  const body = active(page).locator(".body");
  const x1 = right ? 80 : 280, x2 = right ? 280 : 80;
  await body.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: x1, clientY: 300 }] });
  await body.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: x2, clientY: 300 }] });
  await body.dispatchEvent("touchend", { touches: [], changedTouches: [{ identifier: 0, clientX: x2, clientY: 300 }] });
}
async function resume(page: Page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}
const latestSeed = (requests: URL[]) => requests.at(-1)!.searchParams.get("seed");

test("both swipe directions show each person once across pages; GPS and focus never rewind the deck", async ({ page }) => {
  const f = await setup(page);
  await page.goto(`/people?city=Тюмень&start=${id(5)}`);
  await expect(active(page).locator("h1")).toHaveText("Человек 5, 28");
  const seed = latestSeed(f.requests);
  const names: string[] = [];
  for (let i = 0; i < people.length; i++) {
    const name = await active(page).locator("h1").innerText();
    expect(names).not.toContain(name); names.push(name);
    if (name === "Человек 3, 28") await expect(active(page).locator(".dist")).toHaveCount(0);
    if (i === 2) {
      f.move();
      await page.evaluate(() => { window.dispatchEvent(new Event("mesto:location-updated")); window.dispatchEvent(new Event("focus")); });
      await expect(active(page).locator(".dist")).toContainText("≈ 1,8");
      await expect(active(page).locator("h1")).toHaveText(name);
    }
    await swipe(page, i % 2 === 0);
    if (i < people.length - 1) await expect(active(page).locator("h1")).not.toHaveText(name);
  }
  await expect(page.locator('[data-id="deck-end"]')).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("mesto:location-updated")));
  await expect(active(page)).toHaveCount(0);
  expect(new Set(names).size).toBe(people.length);
  expect(f.requests.every(u => u.searchParams.get("seed") === seed)).toBe(true);
  expect(f.requests.filter(u => u.searchParams.has("offset")).every(u => u.searchParams.get("start") === id(5))).toBe(true);
  await expect(page.getByRole("button", { name: "Смотреть сначала" })).toHaveCount(0);
});

test("app re-entry and repeated apply create a new deck; a clicked photo is pinned only on entry", async ({ page }) => {
  const f = await setup(page);
  await page.goto(`/people?city=Тюмень&start=${id(9)}`);
  await expect(active(page).locator("h1")).toHaveText("Человек 9, 28");
  const first = latestSeed(f.requests);
  await resume(page);
  await expect.poll(() => latestSeed(f.requests)).not.toBe(first);
  await expect(active(page).locator("h1")).not.toHaveText("Человек 9, 28");
  expect(f.requests.at(-1)!.searchParams.get("start")).toBeNull();
  for (let i = 0; i < 2; i++) {
    const previous = latestSeed(f.requests);
    await page.getByRole("button", { name: "Фильтры", exact: true }).tap();
    await page.getByRole("button", { name: "Женщины", exact: true }).tap();
    await page.getByRole("button", { name: "Показать анкеты", exact: true }).tap();
    await expect.poll(() => latestSeed(f.requests)).not.toBe(previous);
    await expect(active(page).locator("h1")).toBeVisible();
    expect(f.requests.at(-1)!.searchParams.get("gender")).toBe("female");
  }
});

test("home remixes after browser and Telegram resume while ordinary GPS keeps its seed", async ({ page }) => {
  const f = await setup(page);
  await page.goto("/feed");
  // Главная брендбука 2026: мозаика из трёх человек (дальше — «Листать»).
  await expect(page.locator(".k-mt")).toHaveCount(3);
  const first = latestSeed(f.requests);
  await page.evaluate(() => window.dispatchEvent(new Event("mesto:location-updated")));
  await expect(page.locator(".k-mt")).toHaveCount(3);
  expect(latestSeed(f.requests)).toBe(first);
  await resume(page);
  await expect.poll(() => latestSeed(f.requests)).not.toBe(first);
  const second = latestSeed(f.requests);
  await page.evaluate(() => {
    const bridge = (window as unknown as { Telegram: { WebView: { receiveEvent: (name: string, data: { is_visible: boolean }) => void } } }).Telegram.WebView;
    bridge.receiveEvent("visibility_changed", { is_visible: false });
    bridge.receiveEvent("visibility_changed", { is_visible: true });
  });
  await expect.poll(() => latestSeed(f.requests)).not.toBe(second);
  expect(f.requests.every(u => u.searchParams.get("city") === "Тюмень")).toBe(true);
});
