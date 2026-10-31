import { expect, test, type Locator, type Page } from "@playwright/test";

const photo = "/brand/covers/coffee.webp";
const person = {
  id: "other", name: "Алексей", age: 30, city: "Тюмень", avatarUrl: photo,
  photos: [photo, "/brand/covers/walk.webp"], bio: "Люблю прогулки и встречи с друзьями. ".repeat(20),
  interests: [], commonInterests: [], ratingAvg: 5, ratingCount: 1,
  completedMeetingsCount: 4, eventsOrganizedCount: 2, eventsAttendedCount: 4,
};
const meeting = {
  id: "test", title: "Встреча в парке", city: "Тюмень",
  description: "Поговорим о планах, прогуляемся и выберем место для кофе. ".repeat(24),
  eventDate: "2026-11-02", eventTime: "18:00:00", eventEndTime: "20:00:00",
  status: "published", costType: "free", isBusiness: false, photoUrl: photo,
  category: { slug: "coffee", name: "Кофе", emoji: null }, trainingType: null,
  placeName: "Парк", address: null, latitude: null, longitude: null,
  seatsTotal: 5, seatsTaken: 1, organizer: person, participants: [], viewerStatus: "none",
};

async function fixture(page: Page) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/api/me/profile" || path === "/api/users/other" ? person
      : path === "/api/events/test" ? meeting
        : path === "/api/events" ? { items: Array.from({ length: 12 }, (_, i) => ({ ...meeting, id: `test-${i}` })) }
          : path === "/api/categories" ? { categories: [meeting.category], trainingTypes: [] }
            : path === "/api/subscriptions" ? { active: false }
              : { items: [], events: [], people: [] };
    await route.fulfill({ json });
  });
}

async function scrollInside(page: Page, scroller: Locator, dy: number) {
  if (page.context().browser()!.browserType().name() === "webkit") {
    // Playwright mobile WebKit does not support wheel/touch-drag injection.
    // Check its scroll geometry here; native input/chaining runs in Chromium.
    await scroller.evaluate((el, y) => el.scrollBy(0, y), dy);
  } else {
    const box = (await scroller.boundingBox())!;
    // Use the padding, not a nested city wheel that owns its own scrolling.
    await page.mouse.move(box.x + 8, box.y + box.height / 2);
    await page.mouse.wheel(0, dy);
  }
  // Scrolling and its compositor animation settle after dispatch.
  await page.waitForTimeout(220);
}

async function exerciseEnds(page: Page, scroller: Locator) {
  await expect(scroller).toBeVisible();
  await scroller.evaluate((el) => { el.scrollTop = 0; });
  await scrollInside(page, scroller, -800);
  expect(await scroller.evaluate((el) => el.scrollTop)).toBe(0);
  await scrollInside(page, scroller, 180);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
  await scroller.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await scrollInside(page, scroller, 800);
  expect(await scroller.evaluate((el) => Math.abs(el.scrollTop - (el.scrollHeight - el.clientHeight)))).toBeLessThanOrEqual(1);
  await scrollInside(page, scroller, -180);
  await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeGreaterThan(20);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await scroller.evaluate((el) => { el.scrollTop = 0; });
}

for (const kind of ["photo", "business", "placeholder"] as const) {
  test(`event ${kind}: stops at both ends with no gap between cover and details`, async ({ page }, testInfo) => {
    await fixture(page);
    await page.route("**/api/events/test", (route) => route.fulfill({ json: {
      ...meeting, isBusiness: kind === "business", photoUrl: kind === "placeholder" ? null : photo,
    } }));
    await page.goto("/events/test");
    const body = page.locator(".ev .body");
    await expect(page.getByText(meeting.title, { exact: true })).toBeVisible();
    await exerciseEnds(page, body);
    const gap = await page.locator(".ev").evaluate((screen) => {
      const cover = screen.querySelector(".ph")!.getBoundingClientRect();
      const sheet = screen.querySelector(".sheet2")!.getBoundingClientRect();
      return sheet.top - cover.bottom;
    });
    expect(gap).toBeLessThanOrEqual(0);
    await page.screenshot({ path: testInfo.outputPath(`event-${kind}.png`), animations: "disabled" });
  });
}

test("profile photos still switch and details scroll in both directions", async ({ page }) => {
  await fixture(page);
  await page.goto("/people/other");
  const body = page.locator(".pr .body");
  const active = page.locator(".gal > img.on");
  await expect(active).toHaveAttribute("src", photo);
  // The transparent top of the scroll layer handles taps on the gallery.
  await body.tap({ position: { x: 300, y: 170 } });
  await expect(active).toHaveAttribute("src", person.photos[1]!);
  await exerciseEnds(page, body);
  expect(await page.locator(".pr").evaluate((screen) => screen.querySelector(".sheet2")!.getBoundingClientRect().top - screen.querySelector(".gal")!.getBoundingClientRect().bottom)).toBeLessThanOrEqual(0);
});

for (const path of ["/feed", "/profile", "/search"] as const) {
  test(`${path}: normal vertical scrolling still reaches both ends`, async ({ page }) => {
    await fixture(page);
    await page.setViewportSize({ width: 390, height: 640 });
    await page.goto(path);
    const scroller = page.locator("section.scr:not(.ghost) > .scroll").first();
    await expect.poll(() => scroller.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeGreaterThan(200);
    await exerciseEnds(page, scroller);
  });
}

test("filter sheet and city wheel scroll independently without moving the page", async ({ page }) => {
  await fixture(page);
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/search");
  await page.getByRole("button", { name: "Фильтры", exact: true }).tap();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  await exerciseEnds(page, sheet);
  const wheel = sheet.locator(".wh").first();
  await expect(wheel).toBeVisible();
  const parentTop = await sheet.evaluate((el) => el.scrollTop);
  await wheel.evaluate((el) => { el.scrollTop = 0; });
  await scrollInside(page, wheel, -600);
  expect(await wheel.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await sheet.evaluate((el) => el.scrollTop)).toBe(parentTop);
  await scrollInside(page, wheel, 160);
  await expect.poll(() => wheel.evaluate((el) => el.scrollTop)).toBeGreaterThan(20);
});

test("horizontal event rails still scroll and vertical gestures over cards move the feed", async ({ page, browserName }) => {
  test.skip(browserName === "webkit", "Native wheel injection is unavailable in mobile WebKit");
  await fixture(page);
  await page.goto("/feed");
  const rail = page.locator(".rail").first();
  const scroller = page.locator("section.scr:not(.ghost) > .scroll").first();
  await expect.poll(() => rail.locator(".hero").count()).toBeGreaterThan(1);
  await rail.scrollIntoViewIfNeeded();
  const box = (await rail.boundingBox())!;
  await page.mouse.move(box.x + 160, Math.max(100, box.y + 160));
  await page.mouse.wheel(280, 0);
  await expect.poll(() => rail.evaluate((el) => el.scrollLeft)).toBeGreaterThan(30);
  const top = await scroller.evaluate((el) => el.scrollTop);
  await page.mouse.wheel(0, 180);
  await expect.poll(() => scroller.evaluate((el) => el.scrollTop)).toBeGreaterThan(top + 20);
});

test("touch dragging the event at either end stays bounded and reverse gestures still scroll", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP touch injection is only available in Chromium");
  await fixture(page);
  await page.goto("/events/test");
  const body = page.locator(".ev .body");
  await expect(page.getByText(meeting.title, { exact: true })).toBeVisible();
  const client = await page.context().newCDPSession(page);
  const swipe = async (from: number, to: number) => {
    const points = (y: number) => [{ x: 150, y, id: 0 }];
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: points(from) });
    for (let step = 1; step <= 12; step++) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: points(from + (to - from) * step / 12) });
      const bounds = await body.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
      expect(bounds.top).toBeGreaterThanOrEqual(0);
      expect(bounds.top).toBeLessThanOrEqual(bounds.max + 1);
      await page.waitForTimeout(20);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await page.waitForTimeout(300);
  };
  await swipe(200, 500);
  expect(await body.evaluate((el) => el.scrollTop)).toBe(0);
  await swipe(500, 200);
  await expect.poll(() => body.evaluate((el) => el.scrollTop)).toBeGreaterThan(100);
  await body.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await swipe(500, 200);
  await swipe(200, 500);
  await expect.poll(() => body.evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeGreaterThan(100);
});
