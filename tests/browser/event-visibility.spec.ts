import { expect, test, type Page } from "@playwright/test";
const event = { id: "visible", title: "Тренировка не пропадает", eventDate: "2099-01-20", eventTime: "18:00:00", photoUrl: "/brand/covers/coffee.webp", seatsTotal: 4, seatsTaken: 0, status: "published", category: { slug: "training", name: "Тренировка" }, organizer: { id: "host", name: "Андрей" }, viewerStatus: "none", participants: [] };
const biz = { ...event, id: "biz-visible", title: "Вечеринка FORMA", isBusiness: true };
const more = { ...biz, id: "more", title: "Вторая страница афиши" };
const home = (page: Page) => page.locator('section[data-id="home"]:not(.ghost)');
async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["feed", "event", "business", "search"] }));
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", r => {
    const url = new URL(r.request().url());
    const json = url.pathname === "/api/me/profile" ? { id: "me", city: "Тюмень" }
      : url.pathname === "/api/categories" ? { categories: [{ id: "training", slug: "training", name: "Тренировка" }], trainingTypes: [] }
      : url.pathname === "/api/events/visible" ? event
      : url.pathname === "/api/events" ? { items: url.searchParams.get("business") === "true" ? [biz] : [event] }
      : { items: [], events: [], count: 0 };
    return r.fulfill({ json });
  });
}
for (const failure of ["http", "invalid"] as const) {
  test(`home retains personal and business events after a ${failure} refresh failure`, async ({ page }) => {
    await fixture(page); let failed = false;
    await page.route("**/api/events?**", r => r.fulfill(failed
      ? { status: failure === "http" ? 503 : 200, json: { error: "unavailable" } }
      : { json: { items: new URL(r.request().url()).searchParams.get("business") === "true" ? [biz] : [event] } }));
    await page.goto("/feed");
    await expect(home(page).locator('a[href="/events/visible"]')).toBeVisible();
    await expect(home(page).locator('a[href="/events/biz-visible"]')).toHaveCount(1);
    failed = true;
    await page.evaluate(() => window.dispatchEvent(new Event("mesto:location-updated")));
    await expect(home(page).getByRole("alert").filter({ hasText: "личные встречи" })).toBeVisible();
    await expect(home(page).locator('a[href="/events/visible"]')).toHaveCount(1);
    await expect(home(page).locator('a[href="/events/biz-visible"]')).toHaveCount(1);
    await expect(home(page).getByText("Сегодня пока тихо", { exact: false })).toHaveCount(0);
    failed = false;
    await home(page).getByRole("button", { name: "Повторить загрузку встреч" }).click();
    await home(page).getByRole("button", { name: "Повторить загрузку афиши" }).click();
    await expect(home(page).getByRole("alert")).toHaveCount(0);
  });
}
test("first-load failure offers retry and does not claim there are no meetings", async ({ page }) => {
  await fixture(page); let failed = true;
  await page.route("**/api/events?**", r => r.fulfill(failed ? { status: 503, json: {} } : { json: { items: [event] } }));
  await page.goto("/feed");
  await expect(home(page).getByRole("button", { name: "Повторить загрузку встреч" })).toBeVisible();
  await expect(home(page).getByText("Сегодня пока тихо", { exact: false })).toHaveCount(0);
  failed = false;
  await home(page).getByRole("button", { name: "Повторить загрузку встреч" }).click();
  await expect(home(page).locator('a[href="/events/visible"]')).toBeVisible();
});
test("a late older refresh cannot replace a newer successful event list", async ({ page }) => {
  await fixture(page); let generation = 0; let waiting = false; let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/events?**", async r => {
    if (new URL(r.request().url()).searchParams.get("business") === "true") return r.fulfill({ json: { items: [biz] } });
    const version = generation;
    if (version === 1) { waiting = true; await gate; }
    await r.fulfill({ json: { items: version === 1 ? [] : [{ ...event, title: version === 2 ? "Актуальная тренировка" : event.title }] } }).catch(() => {});
  });
  try {
    await page.goto("/feed"); await expect(home(page).getByText(event.title, { exact: true })).toBeVisible();
    generation = 1; await page.evaluate(() => window.dispatchEvent(new Event("mesto:location-updated"))); await expect.poll(() => waiting).toBe(true);
    generation = 2; await page.evaluate(() => window.dispatchEvent(new Event("mesto:location-updated")));
    await expect(home(page).getByText("Актуальная тренировка", { exact: true })).toBeVisible();
    release(); await expect(home(page).locator('a[href="/events/visible"]')).toHaveCount(1);
  } finally { release(); }
});
test("a missing city response cannot silently switch the user to another city", async ({ page }) => {
  await fixture(page); let failed = true; const eventRequests: string[] = [];
  page.on("request", r => { if (new URL(r.url()).pathname === "/api/events") eventRequests.push(r.url()); });
  await page.route("**/api/me/profile?summary=1", r => r.fulfill(failed ? { status: 503, json: {} } : { json: { city: "Москва" } }));
  await page.goto("/feed");
  await expect(home(page).getByRole("button", { name: "Повторить загрузку города" })).toBeVisible(); expect(eventRequests).toHaveLength(0);
  failed = false; await home(page).getByRole("button", { name: "Повторить загрузку города" }).click();
  await expect(home(page).locator('a[href="/events/visible"]')).toBeVisible();
  expect(eventRequests.every(url => new URL(url).searchParams.get("city") === "Москва")).toBe(true);
});
test("business shows its first page before a slow second page and keeps it if that page fails", async ({ page }) => {
  await fixture(page); let release = () => {}; let failed = true; const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/events?**", async r => {
    const second = new URL(r.request().url()).searchParams.get("page") === "1";
    if (second && failed) { await gate; return r.fulfill({ status: 503, json: {} }).catch(() => {}); }
    return r.fulfill({ json: { items: second ? [more] : [biz], hasMore: !second } });
  });
  try {
    await page.goto("/business"); await expect(page.getByText(biz.title, { exact: true })).toBeVisible();
    release(); await expect(page.locator('[data-id="business"]').getByRole("alert")).toContainText("Не удалось загрузить всю афишу");
    await expect(page.getByText(biz.title, { exact: true })).toBeVisible();
    await expect(page.getByText("пока не публиковали", { exact: false })).toHaveCount(0);
    failed = false; await page.getByRole("button", { name: "Попробовать снова" }).click();
    await expect(page.getByText(more.title, { exact: true })).toBeVisible();
    await expect(page.locator('[data-id="business"]').getByRole("alert")).toHaveCount(0);
  } finally { release(); }
});
for (const path of ["/search", "/feed?category=training"] as const) {
  test(`${path} loads events past the first page`, async ({ page }) => {
    await fixture(page);
    await page.route("**/api/events?**", r => { const second = new URL(r.request().url()).searchParams.get("page") === "1"; return r.fulfill({ json: { items: second ? [more] : [event], hasMore: !second } }); });
    await page.goto(path);
    await expect(page.getByText(more.title, { exact: true })).toBeVisible();
    await expect(page.getByText(event.title, { exact: true })).toBeVisible();
  });
}
test("event, share window and back open and close with one tap on repeated visits", async ({ page }) => {
  await fixture(page); await page.goto("/feed");
  for (let i = 0; i < 2; i++) {
    await home(page).locator('a[href="/events/visible"]').click({ position: { x: 40, y: 80 } });
    await expect(page).toHaveURL(/\/events\/visible$/);
    await page.getByRole("button", { name: "Поделиться", exact: true }).first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.getByRole("button", { name: "Закрыть диалог", exact: true }).click({ position: { x: 10, y: 10 } });
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/feed$/);
    await expect(home(page).locator('a[href="/events/visible"]')).toBeVisible();
  }
});
