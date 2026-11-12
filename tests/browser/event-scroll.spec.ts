import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const events = Array.from({ length: 30 }, (_, i) => ({ id: `scroll-${i}`, title: `Встреча ${i + 1}`,
  photoUrl: `https://db.mesto-go.ru/storage/v1/object/public/event-photos/scroll-${i}.jpg`,
  eventDate: "2027-01-20", eventTime: "18:00:00", seatsTaken: 0, seatsTotal: 3,
  isBusiness: false, category: { slug: "training", name: "Тренировка" }, organizer: { name: "Андрей" },
  fireCount: 0, myFire: false }));
const rail = (page: Page) => page.locator('section[data-id="home"]:not(.ghost) .k-hs').filter({ has: page.locator(".k-hc") }).first();

async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["feed"] }));
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  let refresh = false;
  const covers: string[] = [];
  const bytes = await readFile("public/brand/covers/coffee.webp");
  await page.route("**/_next/image?**", r => { covers.push(r.request().url()); return r.fulfill({ body: bytes, contentType: "image/webp" }); });
  await page.route("**/api/**", r => {
    const url = new URL(r.request().url());
    const json = url.pathname === "/api/me/profile" ? { city: "Тюмень" }
      : url.pathname === "/api/events" ? { items: url.searchParams.has("business") ? [] : refresh ? [...events].reverse().map(e => ({ ...e, fireCount: 7 })) : events }
      : { items: [], categories: [], count: 0, meHasLocation: true };
    return r.fulfill({ json });
  });
  return { covers, refresh: () => { refresh = true; } };
}

test("a long rail loads nearby covers and no live blur layers while scrolling", async ({ page }) => {
  const data = await fixture(page);
  await page.goto("/feed");
  const list = rail(page);
  await expect(list.locator(".k-hc")).toHaveCount(30);
  await expect.poll(() => data.covers.length).toBeGreaterThan(0);
  expect(data.covers.length).toBeLessThan(9);
  expect(data.covers.every(url => new URL(url).searchParams.get("w") === "640")).toBe(true);
  const filters = await list.locator(".k-gw,.k-fc").evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return style.getPropertyValue("backdrop-filter") || style.getPropertyValue("-webkit-backdrop-filter");
  }));
  expect(filters.every(value => value === "none")).toBe(true);
  await expect.poll(() => list.locator(".k-card-cover img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await list.locator(".k-hc").first().screenshot({ path: test.info().outputPath("scroll-card.png") });
  await list.evaluate(el => { el.scrollLeft = 2200; });
  await expect.poll(() => data.covers.length).toBeGreaterThan(8);
  expect(data.covers.length).toBeLessThan(22);
  await expect(page).toHaveURL(/\/feed$/);
  await list.evaluate(el => { el.scrollLeft = 0; });
  await expect(list.locator(".k-card-cover img").first()).toHaveJSProperty("complete", true);
});

test("background refresh updates counts without shuffling cards or moving the rail", async ({ page }) => {
  const data = await fixture(page);
  await page.goto("/feed");
  const list = rail(page);
  await expect(list.locator(".k-hc")).toHaveCount(30);
  await list.evaluate(el => { el.scrollLeft = 1500; });
  // Wait for native snap to settle before triggering a fresh server order.
  await expect.poll(() => list.evaluate(el => el.scrollLeft)).toBeGreaterThan(1000);
  const order = await list.locator(".k-hc").evaluateAll(nodes => nodes.map(n => n.getAttribute("href")));
  data.refresh();
  await page.evaluate(() => window.dispatchEvent(new Event("mesto:location-updated")));
  await expect(list.locator(".k-fc").first()).toHaveText("7");
  expect(await list.locator(".k-hc").evaluateAll(nodes => nodes.map(n => n.getAttribute("href")))).toEqual(order);
  expect(await list.evaluate(el => el.scrollLeft)).toBeGreaterThan(1000);
});

test("a failed optimized cover falls back once and remains tappable", async ({ page }) => {
  await fixture(page);
  const bytes = await readFile("public/brand/covers/coffee.webp");
  await page.route("**/_next/image?**", r => r.fulfill({ status: 503, body: "unavailable" }));
  await page.route("https://db.mesto-go.ru/**", r => r.fulfill({ body: bytes, contentType: "image/webp" }));
  await page.goto("/feed");
  await expect(rail(page).locator(".k-card-cover img").first()).toHaveAttribute("src", events[0]!.photoUrl);
  await expect.poll(() => rail(page).locator(".k-card-cover img").first().evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});
