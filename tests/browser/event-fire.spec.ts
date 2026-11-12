import { expect, test, type Page } from "@playwright/test";

const event = { id: "fire-test", title: "Тренировка HYROX", eventDate: "2026-12-10", eventTime: "18:00:00",
  seatsTaken: 0, seatsTotal: 3, status: "published", viewerStatus: "none", participants: [],
  category: { slug: "training", name: "Тренировка" }, organizer: { id: "host", name: "Андрей" },
  costType: "free", isBusiness: false, fireCount: 0, myFire: false };

async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["feed", "event"] }));
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === "/api/me/profile" ? { id: "me", city: "Тюмень" }
      : path === "/api/events/fire-test" ? event
      : path === "/api/events" ? { items: [event] }
      : { items: [], categories: [], events: [], count: 0 } });
  });
}
const homeFire = (page: Page) => page.locator('section[data-id="home"]:not(.ghost) .k-fc').first();

test("the fire is beside the price and updates immediately, without opening the event", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/events/fire-test/fire", async r => { await gate; await r.fulfill({ json: { fired: true, count: 1 } }).catch(() => {}); });
  try {
    await page.goto("/feed");
    const chip = homeFire(page);
    const card = chip.locator("..");
    const price = await card.locator(".k-cta").boundingBox();
    const fire = await chip.boundingBox();
    expect(price).not.toBeNull(); expect(fire).not.toBeNull();
    expect(Math.abs(price!.y + price!.height / 2 - fire!.y - fire!.height / 2)).toBeLessThan(2);
    expect(fire!.x).toBeGreaterThanOrEqual(price!.x + price!.width);
    await chip.tap();
    await expect(chip).toHaveAttribute("aria-pressed", "true");
    await expect(chip).toHaveText("1");
    await expect(page).toHaveURL(/\/feed$/);
    await page.locator('a.k-hc[href="/events/fire-test"]').first().screenshot({ path: test.info().outputPath("fire-layout.png") });
    release();
  } finally { release(); }
});

test("a reaction in an event appears on home before a slow save or feed reload finishes", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/events/fire-test/fire", async r => { await gate; await r.fulfill({ json: { fired: true, count: 1 } }).catch(() => {}); });
  try {
    await page.goto("/feed");
    await page.locator('a.k-hc[href="/events/fire-test"]').first().click({ position: { x: 40, y: 80 } });
    await page.locator('section:not(.ghost) .k-fire').tap();
    await page.goBack();
    await expect(homeFire(page)).toHaveAttribute("aria-pressed", "true");
    await expect(homeFire(page)).toHaveText("1");
  } finally { release(); }
});

test("failed saves restore the count and announce the failure", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/events/fire-test/fire", r => r.fulfill({ status: 503, json: { error: "unavailable" } }));
  await page.goto("/feed");
  await homeFire(page).tap();
  await expect(homeFire(page)).toHaveAttribute("aria-pressed", "false");
  await expect(homeFire(page)).toHaveText("");
  await expect(page.getByText("Не удалось сохранить огонёк. Попробуй ещё раз.", { exact: true })).toBeVisible();
});
