import { expect, test, type Page } from "@playwright/test";

const anna = { id: "00000000-0000-4000-8000-000000000001", name: "Анна", age: 28, avatarUrl: "/brand/covers/coffee.webp", photos: ["/brand/covers/coffee.webp"], bio: "Люблю кофе", sharedInterests: [], interests: [], ratingAvg: 5, completedMeetingsCount: 2, distanceM: 700, distanceKm: 0 };
const boris = { ...anna, id: "00000000-0000-4000-8000-000000000002", name: "Борис", distanceM: 2300, distanceKm: 2 };

async function fixture(page: Page, permission: "granted" | "prompt" | "denied" = "granted", empty = false) {
  await page.clock.install();
  await page.addInitScript(({ permission }) => {
    let state = permission;
    let coords = { latitude: 57.15123, longitude: 65.53123 };
    let visible = true;
    const watchers = new Map<number, PositionCallback>();
    let seq = 0;
    const pos = () => ({ coords: { ...coords, accuracy: 50 }, timestamp: Date.now() }) as GeolocationPosition;
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state }) } });
    Object.defineProperty(navigator, "geolocation", { configurable: true, value: {
      getCurrentPosition: (ok: PositionCallback, fail: PositionErrorCallback) => {
        if (state === "denied") return fail({ code: 1 } as GeolocationPositionError);
        state = "granted";
        ok(pos());
      },
      watchPosition: (ok: PositionCallback) => { const id = ++seq; watchers.set(id, ok); queueMicrotask(() => ok(pos())); return id; },
      clearWatch: (id: number) => watchers.delete(id),
    } });
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visible ? "visible" : "hidden" });
    Object.assign(window, {
      movePerson: (lat: number, lon: number) => { coords = { latitude: lat, longitude: lon }; watchers.forEach((cb) => cb(pos())); },
      setAppVisible: (value: boolean) => { visible = value; document.dispatchEvent(new Event("visibilitychange")); },
    });
  }, { permission });
  const writes: { lat: number; lon: number }[] = [];
  let saved = false;
  let moscow = false;
  await page.route("**/api/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/me/location") {
      const point = route.request().postDataJSON();
      writes.push(point); saved = true; moscow = point.lon < 50;
      return route.fulfill({ json: { ok: true } });
    }
    const person = saved ? (moscow ? boris : anna) : { ...anna, distanceM: null, distanceKm: null };
    const selected = url.searchParams.get("start") === boris.id ? { ...boris, distanceM: moscow ? 2300 : 700 } : person;
    const json = url.pathname === "/api/people" ? { items: empty && !saved ? [] : [url.searchParams.has("deck") ? selected : person], meHasLocation: saved }
      : url.pathname.startsWith("/api/users/") ? (url.pathname.endsWith(boris.id) ? boris : anna)
      : url.pathname === "/api/me/profile" ? { city: "Тюмень" }
      : url.pathname === "/api/categories" ? { categories: [], trainingTypes: [] }
      : { items: [] };
    return route.fulfill({ json });
  });
  return writes;
}
const move = (page: Page, lat: number, lon: number) => page.evaluate(({ lat, lon }) => {
  (window as unknown as { movePerson: (lat: number, lon: number) => void }).movePerson(lat, lon);
}, { lat, lon });
const visible = (page: Page, value: boolean) => page.evaluate((value) => {
  (window as unknown as { setAppVisible: (value: boolean) => void }).setAppVisible(value);
}, value);

test("movement updates home cards and distances without replacing the open person", async ({ page }) => {
  const writes = await fixture(page);
  await page.goto("/feed");
  await expect(page.locator(".pcard")).toContainText("Анна");
  await expect(page.locator(".pcard")).toContainText("≈ 700");
  expect(writes[0]!.lat).toBeCloseTo(57.15, 5);
  expect(writes[0]!.lon).toBeCloseTo(65.53, 5);
  await move(page, 55.75, 37.615);
  await page.clock.fastForward(31_000);
  await expect(page.locator(".pcard")).toContainText("Борис");
  await expect(page.locator(".pcard")).toContainText("≈ 2,3");
  await page.locator(".pcard").tap();
  await expect(page.locator('section[data-id="person"]:not(.ghost) .dist')).toContainText("≈ 2,3");
  await move(page, 57.15, 65.53);
  await page.clock.fastForward(31_000);
  await expect(page.locator('section[data-id="person"]:not(.ghost) h1')).toHaveText("Борис, 28");
  await expect(page.locator('section[data-id="person"]:not(.ghost) .dist')).toContainText("≈ 700");
});

test("returning to the app refreshes location and watching stops while hidden", async ({ page }) => {
  const writes = await fixture(page);
  await page.goto("/feed");
  await expect(page.locator(".pcard")).toContainText("≈ 700");
  await visible(page, false);
  const count = writes.length;
  await move(page, 55.75, 37.615);
  await page.clock.fastForward(31_000);
  expect(writes).toHaveLength(count);
  await visible(page, true);
  await expect(page.locator(".pcard")).toContainText("Борис");
  await expect(page.locator(".pcard")).toContainText("≈ 2,3");
});

test("an empty city still offers geolocation and explicit permission loads nearby people", async ({ page }) => {
  const writes = await fixture(page, "prompt", true);
  await page.goto("/feed");
  await expect(page.getByRole("button", { name: /Показать, кто рядом/ })).toBeVisible();
  expect(writes).toHaveLength(0);
  await page.getByRole("button", { name: /Показать, кто рядом/ }).tap();
  await expect(page.locator(".pcard")).toContainText("Анна");
  await expect(page.locator(".pcard")).toContainText("≈ 700");
});

test("permission denied preserves city fallback without invented distances or automatic requests", async ({ page }) => {
  const writes = await fixture(page, "denied");
  await page.goto("/feed");
  await expect(page.getByText("Люди в твоём городе", { exact: true })).toBeVisible();
  await expect(page.locator(".pcard")).not.toContainText("≈");
  await page.getByRole("button", { name: /Показать, кто рядом/ }).tap();
  expect(writes).toHaveLength(0);
  await expect(page.locator(".pcard")).toContainText("Анна");
});
