import { expect, test, type Page } from "@playwright/test";

const anna = { id: "00000000-0000-4000-8000-000000000001", name: "Анна", age: 28, avatarUrl: "/brand/covers/coffee.webp", photos: ["/brand/covers/coffee.webp"], bio: "Люблю кофе", sharedInterests: [], interests: [], sharedCount: 0, ratingAvg: 5, completedMeetingsCount: 2, distanceM: 500 };
const boris = { ...anna, id: "00000000-0000-4000-8000-000000000002", name: "Борис", avatarUrl: "/brand/covers/walk.webp", photos: ["/brand/covers/walk.webp"], bio: "Люблю гулять" };
const active = (page: Page) => page.locator('section[data-id="person"]:not(.ghost)');

async function fixture(page: Page) {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    const start = url.searchParams.get("start");
    const json = url.pathname === "/api/people"
      ? { items: url.searchParams.has("deck") ? (start === anna.id ? [anna, boris] : [boris, anna]) : [anna, boris], meHasLocation: true }
      : url.pathname === `/api/users/${anna.id}` ? anna
      : url.pathname === `/api/users/${boris.id}` ? boris
      : url.pathname === "/api/me/profile" ? { city: "Тюмень" }
      : url.pathname === "/api/categories" ? { categories: [], trainingTypes: [] }
      : { items: [] };
    return route.fulfill({ json });
  });
}

test("a nearby photo opens that exact person and swiping still opens the next person", async ({ page }) => {
  await fixture(page);
  const requests: string[] = [];
  page.on("request", (r) => { if (r.url().includes("/api/people?deck=1")) requests.push(r.url()); });
  await page.goto("/feed");
  await page.locator(".pcard").filter({ hasText: anna.name }).tap();
  await expect(active(page).getByRole("heading", { name: "Анна, 28", exact: true })).toBeVisible();
  await expect(active(page).locator(".gal > img.on")).toHaveAttribute("src", anna.avatarUrl);
  expect(requests.some((url) => new URL(url).searchParams.get("start") === anna.id)).toBe(true);
  const body = active(page).locator(".body");
  await body.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 280, clientY: 250 }] });
  await body.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: 100, clientY: 250 }] });
  await body.dispatchEvent("touchend", { changedTouches: [{ identifier: 0, clientX: 100, clientY: 250 }], touches: [] });
  await expect(active(page).getByRole("heading", { name: "Борис, 28", exact: true })).toBeVisible();
  await expect(active(page).locator(".gal > img.on")).toHaveAttribute("src", boris.avatarUrl);
});

test("an unavailable selection never silently opens the first person", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/people?**", (r) => r.fulfill({ json: { items: [boris], meHasLocation: true } }));
  await page.goto(`/people?start=${anna.id}`);
  await expect(page.getByText("Этот профиль больше недоступен.", { exact: true })).toBeVisible();
  await expect(active(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Поставить сердечко" })).toHaveCount(0);
});

test("query navigation resets the selected person and does not keep the old photo", async ({ page }) => {
  await fixture(page);
  await page.goto(`/people?start=${anna.id}`);
  await expect(active(page).getByRole("heading", { name: "Анна, 28", exact: true })).toBeVisible();
  await page.evaluate((id) => window.history.pushState(null, "", `/people?start=${id}`), boris.id);
  await expect(active(page).getByRole("heading", { name: "Борис, 28", exact: true })).toBeVisible();
  await expect(active(page).locator(".gal > img.on")).toHaveAttribute("src", boris.avatarUrl);
  await page.goBack();
  await expect(active(page).getByRole("heading", { name: "Анна, 28", exact: true })).toBeVisible();
  await expect(active(page).locator(".gal > img.on")).toHaveAttribute("src", anna.avatarUrl);
});

test("a slow response for the old selection cannot replace the newly selected person", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const pending = new Promise<void>((resolve) => { release = resolve; });
  let started = false;
  let aborted = false;
  page.on("requestfailed", (r) => {
    if (r.url().includes(`/api/people?deck=1&start=${anna.id}`)) aborted = true;
  });
  await page.route(`**/api/people?deck=1&start=${anna.id}`, async (r) => {
    started = true;
    await pending;
    await r.fulfill({ json: { items: [anna], meHasLocation: true } }).catch(() => {});
  });
  try {
    await page.goto(`/people?start=${anna.id}`);
    await expect.poll(() => started).toBe(true);
    await page.evaluate((id) => window.history.pushState(null, "", `/people?start=${id}`), boris.id);
    await expect(active(page).getByRole("heading", { name: "Борис, 28", exact: true })).toBeVisible();
    await expect.poll(() => aborted).toBe(true);
    release();
    await expect(active(page).locator(".gal > img.on")).toHaveAttribute("src", boris.avatarUrl);
  } finally { release(); }
});

test("a failed selection load can be retried without opening somebody else", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/people?**", (r) => r.fulfill(failed
    ? { status: 503, json: { error: "unavailable" } }
    : { json: { items: [boris, anna], meHasLocation: true } }));
  await page.goto(`/people?start=${anna.id}`);
  await expect(page.getByText("Не удалось загрузить людей. Попробуй ещё раз.", { exact: true })).toBeVisible();
  await expect(active(page)).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).tap();
  await expect(active(page).getByRole("heading", { name: "Анна, 28", exact: true })).toBeVisible();
  await expect(active(page).locator(".gal > img.on")).toHaveAttribute("src", anna.avatarUrl);
});
