import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page) {
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/api/me/profile" ? { city: "Тюмень" }
      : path === "/api/categories" ? { categories: [] }
        : { items: [] };
    await route.fulfill({ json });
  });
}

const event = (title: string) => ({
  id: title, title, city: "Тюмень", eventDate: "2026-11-02", eventTime: "18:00:00",
  seatsTotal: 5, seatsTaken: 0, category: { slug: "coffee", name: "Кофе" },
  organizer: { id: "other", name: "Алексей", age: 30, ratingAvg: 5 },
});

test("subscription outage offers retry instead of selling another subscription", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/subscriptions", (route) => route.fulfill(failed
    ? { status: 503, json: { error: "unavailable" } }
    : { json: { active: true, plan: "premium" } }));
  await page.goto("/create");
  await expect(page.getByText("Не удалось проверить подписку.", { exact: true })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByText("Не удалось проверить подписку.", { exact: true })).toHaveCount(0);
  await expect(page.locator('[data-id="create"]')).toBeVisible();
});

test("failed chat list is not shown as an empty account and can be retried", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/conversations", (route) => route.fulfill(failed
    ? { status: 500, json: { error: "fetch_failed" } }
    : { json: { items: [{ conversationId: "test", eventTitle: "Прогулка в парке", unreadCount: 0, lastMessage: null }] } }));
  await page.goto("/chats");
  await expect(page.getByText("Не удалось загрузить чаты.", { exact: true })).toBeVisible();
  await expect(page.getByText("Когда тебя примут на встречу, её чат появится здесь.")).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByText("Прогулка в парке", { exact: true })).toBeVisible();
});

test("event network failure is recoverable and does not claim the event was deleted", async ({ page }) => {
  await fixture(page);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  let failed = true;
  await page.route("**/api/events/test", (route) => failed
    ? route.abort()
    : route.fulfill({ status: 404, json: { error: "not_found" } }));
  await page.goto("/events/test");
  await expect(page.getByText("Не удалось загрузить встречу.", { exact: true })).toBeVisible();
  await expect(page.getByText("Встреча не найдена", { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByText("Встреча не найдена", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("a slow old search cannot overwrite a newer date filter", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  let started = false;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/events?**", async (route) => {
    const date = new URL(route.request().url()).searchParams.get("date");
    if (date === "today") { started = true; await gate; }
    await route.fulfill({ json: { items: date ? [event(date === "today" ? "Сегодняшняя встреча" : "Завтрашняя встреча")] : [] } });
  });
  await page.goto("/search");
  await expect(page.getByText("Ничего не нашлось", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Сегодня", exact: true }).click();
  await expect.poll(() => started).toBe(true);
  await page.getByRole("button", { name: "Завтра", exact: true }).click();
  await expect(page.getByText("Завтрашняя встреча", { exact: true })).toBeVisible();
  release();
  // Let the deliberately delayed response and any React update finish.
  await page.waitForTimeout(300);
  await expect(page.getByText("Завтрашняя встреча", { exact: true })).toBeVisible();
  await expect(page.getByText("Сегодняшняя встреча", { exact: true })).toHaveCount(0);
});

test("changing the map filter cancels the old automatic retry", async ({ page }) => {
  await fixture(page);
  let oldRequests = 0;
  await page.route("**/api/events/map**", (route) => {
    const date = new URL(route.request().url()).searchParams.get("date");
    if (!date) oldRequests++;
    return route.fulfill(date
      ? { status: 400, json: { error: "city_required" } }
      : { status: 503, json: { error: "fetch_failed" } });
  });
  const firstFailure = page.waitForResponse((r) => new URL(r.url()).pathname === "/api/events/map" && r.status() === 503);
  await page.goto("/map");
  await firstFailure;
  await page.getByRole("button", { name: "Завтра", exact: true }).click();
  await expect(page.getByText("Сначала заверши регистрацию.", { exact: true })).toBeVisible();
  const before = oldRequests; // React Strict Mode may have cancelled a mount request.
  await page.waitForTimeout(1100);
  expect(oldRequests).toBe(before);
  await expect(page.getByText("Сначала заверши регистрацию.", { exact: true })).toBeVisible();
});

test("map remains loading while waiting for its one automatic retry", async ({ page }) => {
  await fixture(page);
  let requests = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/api/events/map**", async (route) => {
    requests++;
    if (requests > 1) await gate;
    await route.fulfill(requests === 1
      ? { status: 503, json: { error: "fetch_failed" } }
      : { status: 400, json: { error: "city_required" } });
  });
  await page.goto("/map");
  await expect.poll(() => requests).toBe(2);
  await expect(page.getByText("Загружаем карту…", { exact: true })).toBeVisible();
  release();
  await expect(page.getByText("Сначала заверши регистрацию.", { exact: true })).toBeVisible();
});
