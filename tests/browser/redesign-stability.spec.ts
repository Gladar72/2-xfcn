import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

const cover = "/brand/covers/coffee.webp";
const people = Array.from({ length: 3 }, (_, i) => ({
  id: `stable-${i}`, name: `Человек ${i}`, age: 30, city: "Тюмень", avatarUrl: cover,
  photos: [cover], bio: "Люблю прогулки", interests: [], sharedInterests: [],
  commonInterests: [], ratingAvg: 5, completedMeetingsCount: 2,
}));
const active = (page: Page) => page.locator('section[data-id="person"]:not(.ghost)');
const event = {
  id: "meeting", title: "Очень длинное название встречи для знакомства с новыми людьми и совместной прогулки по городу",
  eventDate: "2026-11-08", eventTime: "18:00:00", seatsTaken: 1, seatsTotal: 5,
  photoUrl: cover, category: { slug: "coffee", name: "Совместная тренировка на свежем воздухе" },
  organizer: people[0], myApplicationStatus: "accepted",
};

async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", r => {
    const u = new URL(r.request().url());
    const json = u.pathname === "/api/people" ? { items: people, city: "Тюмень", nextOffset: null }
      : u.pathname.startsWith("/api/users/") ? people.find(p => u.pathname.endsWith(p.id))
      : u.pathname === "/api/me/profile" ? { ...people[0], id: "me" }
      : u.pathname === "/api/categories" ? { categories: [{ id: "c", slug: "coffee", name: "Кофе" }, { id: "k", slug: "cinema", name: "Кино" }], trainingTypes: [] }
      : u.pathname === "/api/events" ? { items: u.searchParams.has("business") ? [] : [event] }
      : { items: [], events: [], people: [], count: 0 };
    return r.fulfill({ json });
  });
}

test("one category tap opens its loading screen before a slow API response", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/events?**", async r => {
    if (new URL(r.request().url()).searchParams.has("category")) await gate;
    await r.fulfill({ json: { items: [event] } }).catch(() => {});
  });
  try {
    await page.goto("/feed");
    await page.getByRole("button", { name: "Кофе", exact: true }).tap();
    await expect(page).toHaveURL(/category=coffee/, { timeout: 2000 });
    await expect(page.locator('[data-id="cat"] .sk').first()).toBeVisible();
  } finally { release(); }
});

test("category failure offers retry, and changing category discards the old response", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/events?**", r => r.fulfill(failed
    ? { status: 503, json: { error: "unavailable" } }
    : { json: { items: [event] } }));
  await page.goto("/feed?category=coffee");
  await expect(page.getByText("Не удалось загрузить встречи.", { exact: true })).toBeVisible();
  await expect(page.getByText("Пока пусто", { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).tap();
  await expect(page.locator('[data-id="cat"] .row')).toHaveCount(1);

  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/events?**", async r => {
    const category = new URL(r.request().url()).searchParams.get("category");
    if (category === "walk") await gate;
    await r.fulfill({ json: { items: [{ ...event, title: category === "walk" ? "Старый ответ" : "Новый ответ" }] } }).catch(() => {});
  });
  try {
    await page.evaluate(() => history.pushState(null, "", "/feed?category=walk"));
    await expect(page.locator('[data-id="cat"]:not(.ghost) h1')).toHaveText("Прогулка");
    await page.evaluate(() => history.pushState(null, "", "/feed?category=cinema"));
    await expect(page.locator('[data-id="cat"]:not(.ghost) h1')).toHaveText("Кино");
    await expect(page.getByText("Новый ответ", { exact: true })).toBeVisible();
    release();
    await page.waitForTimeout(150);
    await expect(page.getByText("Старый ответ", { exact: true })).toHaveCount(0);
  } finally { release(); }
});

test("profile photo survives an image optimizer failure", async ({ page }) => {
  await fixture(page);
  const original = "https://db.mesto-go.ru/storage/v1/object/public/photos/test.jpg";
  await page.route("**/api/users/stable-0", r => r.fulfill({ json: { ...people[0], avatarUrl: original, photos: [original] } }));
  const bytes = await readFile("public/brand/covers/coffee.webp");
  await page.route(original, r => r.fulfill({ contentType: "image/webp", body: bytes }));
  await page.route("**/_next/image?**", r => r.fulfill({ status: 503, body: "unavailable" }));
  await page.goto("/people/stable-0");
  await expect.poll(() => active(page).locator(".gal > img.on").evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
  await expect(active(page).locator(".gal > img.on")).toHaveAttribute("src", original);
});

test("late like status cannot undo a completed like", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  let started = false;
  await page.route("**/api/likes**", async r => {
    if (r.request().method() === "GET") { started = true; await gate; }
    await r.fulfill({ json: { liked: r.request().method() !== "GET", mutual: false } }).catch(() => {});
  });
  try {
    await page.goto("/people/stable-0");
    await expect.poll(() => started).toBe(true);
    await page.getByRole("button", { name: "Поставить сердечко", exact: true }).tap();
    await expect(page.getByRole("button", { name: "Убрать сердечко", exact: true })).toBeVisible();
    release();
    await page.waitForTimeout(200);
    await expect(page.getByRole("button", { name: "Убрать сердечко", exact: true })).toBeVisible();
  } finally { release(); }
});

test("accepted status and long event text fit the compact home card", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await fixture(page);
  await page.goto("/feed");
  const card = page.locator(".k-hc").first();
  await expect(card.locator(".k-cta")).toHaveText("Ты идёшь");
  const fits = await card.evaluate(el => {
    const box = el.getBoundingClientRect();
    const tag = el.querySelector(".k-tg")!.getBoundingClientRect();
    const title = el.querySelector(".k-tt")!.getBoundingClientRect();
    return tag.right <= box.right && title.top > tag.bottom && title.height <= 60;
  });
  expect(fits).toBe(true);
});

test("a slow next photo keeps the original visible, without zoom or a blue press effect", async ({ page }) => {
  await fixture(page);
  const second = "/brand/covers/walk.webp";
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/users/stable-0", r => r.fulfill({ json: { ...people[0], photos: [cover, second] } }));
  await page.route(`**${second}`, async r => { await gate; await r.continue().catch(() => {}); });
  try {
    await page.goto("/people/stable-0");
    const shown = active(page).locator(".gal > img.on");
    await expect.poll(() => shown.evaluate((im: HTMLImageElement) => im.complete && im.naturalWidth > 0)).toBe(true);
    await active(page).locator(".body").tap({ position: { x: 300, y: 200 } });
    await expect(shown).toHaveAttribute("src", cover);
    await expect(shown).toHaveCSS("transform", "none");
    release();
    await expect(shown).toHaveAttribute("src", second);
    await expect(shown).toHaveCSS("transform", "none");
    expect(await shown.evaluate(el => getComputedStyle(el).transitionProperty)).toBe("opacity");
  } finally { release(); }
});

test("profile shows real activity and distance, and its action buttons fit 320 pixels", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await fixture(page);
  await page.route("**/api/users/stable-0", r => r.fulfill({ json: {
    ...people[0], gender: "female", distanceM: 1400, lastActiveAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  } }));
  await page.goto("/people/stable-0");
  await expect(active(page).getByText("Была 5 минут назад", { exact: true })).toBeVisible();
  await expect(active(page).locator(".dist")).toContainText("1,4");
  await expect(active(page).getByRole("button", { name: "Подписаться на события" })).toBeVisible();
  await expect.poll(() => active(page).evaluate(el => Math.round(el.getBoundingClientRect().left))).toBe(0);
  const bounds = await active(page).locator(".cta button").evaluateAll(elements => elements.map(el => {
    const r = el.getBoundingClientRect(); return { left: r.left, right: r.right };
  }));
  for (let i = 0; i < bounds.length; i++) {
    expect(bounds[i]!.left).toBeGreaterThanOrEqual(i ? bounds[i - 1]!.right : 0);
    expect(bounds[i]!.right).toBeLessThanOrEqual(320);
  }
});

for (const isBusiness of [false, true]) {
  test(`${isBusiness ? "business" : "personal"} event shows five people, all remaining guests open in a sheet`, async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 740 });
    await fixture(page);
    await page.route("**/api/events/meeting", r => r.fulfill({ json: {
      ...event, isBusiness, status: "published", viewerStatus: "none", seatsTotal: 25, seatsTaken: 18,
      description: "Ждём всех", costType: "free", category: { slug: "coffee", name: "Кофе" },
      participants: Array.from({ length: 17 }, (_, i) => ({ id: `guest-${i}`, name: `Гость ${i}`, avatarUrl: cover, anonymous: i === 16 })),
    } }));
    await page.goto("/events/meeting");
    const screen = page.locator('[data-id="event"]:not(.ghost)');
    await expect(screen.locator(".k-title")).toContainText("Очень длинное");
    expect(await screen.locator(".k-spacer").evaluate(el => el.getBoundingClientRect().height)).toBeGreaterThan(360);
    if (isBusiness) {
      const chat = screen.getByRole("button", { name: "Чат встречи", exact: true });
      await expect(chat).toContainText("Чат события");
      const bounds = await chat.boundingBox();
      expect(bounds!.width).toBeGreaterThan(260);
      expect(bounds!.height).toBeGreaterThanOrEqual(48);
    }
    await screen.locator(".scroll").evaluate(el => { el.scrollTop = el.scrollHeight; });
    const mapBottom = (await screen.locator(".k-mapbox").boundingBox())!;
    const footer = (await screen.locator(".k-cta").boundingBox())!;
    const gap = footer.y - (mapBottom.y + mapBottom.height);
    expect(gap).toBeGreaterThanOrEqual(0);
    expect(gap).toBeLessThanOrEqual(24);
    const preview = screen.locator(".participant-preview");
    await expect(preview.locator("a")).toHaveCount(5);
    await expect(preview.locator(".participant-more")).toContainText("+13");
    await preview.locator(".participant-more").scrollIntoViewIfNeeded();
    expect(await preview.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await preview.getByRole("button", { name: "Показать всех участников: 18" }).tap();
    const dialog = page.getByRole("dialog", { name: "Кто идёт", exact: true });
    await expect(dialog.locator(".participant-row")).toHaveCount(18);
    await expect(dialog.locator('a[href="/people/guest-16"]')).toHaveCount(0);
    await dialog.locator('a[href="/people/guest-0"]').tap();
    await expect(page).toHaveURL(/\/people\/guest-0$/);
  });
}

test("short secondary screens have no menu-sized bottom gap", async ({ page }) => {
  await fixture(page);
  await page.goto("/chats");
  const scroll = page.locator('[data-id="chats"] .scroll');
  const bottom = await scroll.evaluate(el => parseFloat(getComputedStyle(el).paddingBottom));
  expect(bottom).toBeLessThanOrEqual(58);

});

test("a late swipe click cannot activate the next person's controls, but the next tap works", async ({ page }) => {
  await fixture(page);
  let likes = 0;
  await page.route("**/api/likes**", r => {
    if (r.request().method() === "POST") likes++;
    return r.fulfill({ json: { liked: r.request().method() === "POST", mutual: false } });
  });
  await page.goto("/people");
  await expect(active(page).locator("h1")).toContainText("Человек 0");
  const body = active(page).locator(".body");
  await body.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 280, clientY: 250 }] });
  await body.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: 80, clientY: 250 }], cancelable: true });
  await body.dispatchEvent("touchend", { touches: [], changedTouches: [{ identifier: 0, clientX: 80, clientY: 250 }] });
  await expect(active(page).locator("h1")).toContainText("Человек 1");
  await expect(active(page)).toHaveCSS("animation-name", "none");
  const heart = active(page).getByRole("button", { name: "Поставить сердечко", exact: true });
  await heart.dispatchEvent("click", { detail: 1 });
  expect(likes).toBe(0);
  await heart.tap();
  await expect.poll(() => likes).toBe(1);
});

test("a slow subscription response does not insert a button or move the profile actions", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/follows?**", async r => { await gate; await r.fulfill({ json: { following: false, followers: 0, events: [] } }).catch(() => {}); });
  try {
    await page.goto("/people/stable-0");
    const bell = active(page).getByRole("button", { name: "Подписаться на события", exact: true });
    await expect(bell).toBeVisible();
    await expect(bell).toBeDisabled();
    await expect.poll(() => active(page).evaluate(el => Math.round(el.getBoundingClientRect().left))).toBe(0);
    const before = await bell.boundingBox();
    release();
    await expect(bell).toBeEnabled();
    expect(await bell.boundingBox()).toEqual(before);
  } finally { release(); }
});

test("loading full profile permissions keeps the chat button visually stable", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/users/stable-0", async r => {
    await gate;
    await r.fulfill({ json: { ...people[0], canMessage: false } }).catch(() => {});
  });
  try {
    await page.goto("/people");
    const chat = active(page).getByRole("button", { name: "Написать", exact: true });
    await expect(chat).toBeVisible();
    await expect(chat).toHaveCSS("opacity", "1");
    const before = await chat.boundingBox();
    const response = page.waitForResponse("**/api/users/stable-0");
    release();
    await response;
    await chat.tap();
    await expect(page.getByText("Пока написать нельзя — у вас ещё не было общей встречи. Позови на свою встречу или создай новую 😉", { exact: true })).toBeVisible();
    await expect(chat).toHaveCSS("opacity", "1");
    expect(await chat.boundingBox()).toEqual(before);
  } finally { release(); }
});

test("back closes the profile in one tap even after same-URL history updates", async ({ page }) => {
  await fixture(page);
  await page.goto("/feed");
  await page.locator(".k-mt").first().tap();
  await expect(active(page).locator("h1")).toContainText("Человек 0");
  await page.evaluate(() => {
    history.pushState(history.state, "", location.href);
    history.pushState(history.state, "", location.href);
  });
  await active(page).getByRole("button", { name: "Назад", exact: true }).tap();
  await expect(page).toHaveURL(/\/feed$/);
});

test("an empty profile has no empty description frame and reveals the whole photo", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/users/stable-0", r => r.fulfill({ json: { ...people[0], bio: "  ", interests: [] } }));
  await page.goto("/people/stable-0");
  await expect(active(page).locator("h1")).toBeVisible();
  await expect(active(page).locator(".about")).toHaveCount(0);
  await expect.poll(() => active(page).evaluate(el => Math.round(el.getBoundingClientRect().left))).toBe(0);
  const photo = (await active(page).locator(".gal").boundingBox())!;
  expect(photo.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
  const name = (await active(page).locator(".nm").boundingBox())!;
  expect(name.y).toBeGreaterThan(page.viewportSize()!.height * 0.65);
  await active(page).getByRole("button", { name: "О себе", exact: true }).tap();
  const report = active(page).getByRole("button", { name: "Пожаловаться или заблокировать", exact: true });
  await expect(report).toBeInViewport();
  await active(page).locator(".body").evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect.poll(() => active(page).evaluate(el => {
    const report = el.querySelector('.report')!.getBoundingClientRect();
    const buttons = el.querySelector('.cta')!.getBoundingClientRect();
    const gap = buttons.top - report.bottom;
    return gap >= 0 && gap <= 24;
  })).toBe(true);
});

test("organizer can reach cancellation at the end; closing confirmation needs one tap", async ({ page }, info) => {
  await fixture(page);
  let cancelled = 0;
  await page.route("**/api/events/meeting", r => {
    if (r.request().method() === "PATCH") { cancelled++; return r.fulfill({ json: { ok: true } }); }
    return r.fulfill({ json: { ...event, viewerStatus: "organizer", organizer: { ...people[0], id: "me" }, status: "published", participants: [], startsAt: "2099-11-08T18:00:00Z" } });
  });
  await page.goto("/events/meeting");
  const screen = page.locator('section[data-id="event"]:not(.ghost)');
  const cancel = screen.getByRole("button", { name: "Отменить встречу", exact: true });
  await expect(screen.getByRole("link", { name: /Редактировать/ })).toHaveCount(1);
  await expect(screen.locator(":scope > .k-cta")).toHaveCount(0);
  await cancel.scrollIntoViewIfNeeded();
  await screen.locator(":scope > .scroll").evaluate(el => { el.scrollTop = el.scrollHeight; });
  const cancelBox = (await cancel.boundingBox())!;
  expect(page.viewportSize()!.height - cancelBox.y - cancelBox.height).toBeLessThanOrEqual(48);
  const mapBox = (await screen.locator('.k-mapbox').boundingBox())!;
  const actions = (await screen.locator('.tiles2').boundingBox())!;
  expect(actions.y - mapBox.y - mapBox.height).toBeGreaterThanOrEqual(12);
  expect(actions.y - mapBox.y - mapBox.height).toBeLessThanOrEqual(24);
  await page.screenshot({ path: info.outputPath('owner-event.png') });
  expect((await cancel.boundingBox())!.height).toBeGreaterThanOrEqual(48);
  await cancel.tap();
  await expect(page.getByRole("heading", { name: "Отменить встречу?", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Не сейчас", exact: true }).tap();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(cancelled).toBe(0);
  await cancel.tap();
  await page.getByRole("button", { name: "Да, отменить", exact: true }).tap();
  await expect.poll(() => cancelled).toBe(1);
  await expect(screen.getByText("Эта встреча отменена организатором.", { exact: true })).toBeVisible();
});

test("a one-emoji bio uses a compact graphite panel and top-aligned portrait", async ({ page }, info) => {
  await fixture(page);
  await page.route("**/api/users/stable-0", r => r.fulfill({ json: { ...people[0], bio: "✨" } }));
  await page.goto("/people/stable-0");
  // Production CSS minifies zero percentages to zero pixels; both keep the top edge.
  await expect(active(page).locator('.gal > img.on')).toHaveCSS('object-position', /^50% 0(?:px|%)$/);
  await expect(active(page).locator('h1')).toBeVisible();
  await page.screenshot({ path: info.outputPath('profile-photo.png'), animations: 'disabled' });
  await active(page).locator('.body').evaluate(el => { el.scrollTop = el.scrollHeight; });
  const bio = active(page).locator('.about');
  await expect(bio).toHaveCSS('background-color', 'rgb(43, 40, 51)');
  await expect(bio).toHaveCSS('color', 'rgb(245, 244, 247)');
  expect((await bio.boundingBox())!.height).toBeLessThanOrEqual(60);
  await page.screenshot({ path: info.outputPath('profile-bio.png') });
});

test("subscription can recover from a failed load and serializes rapid taps", async ({ page }) => {
  await fixture(page);
  let reads = 0;
  let writes = 0;
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/follows**", async route => {
    if (route.request().method() === "GET") {
      reads++;
      return route.fulfill(reads === 1 ? { status: 503, json: { error: "offline" } }
        : { json: { following: false, followers: 2, events: [] } });
    }
    writes++;
    await gate;
    await route.fulfill({ json: { following: true, followers: 3 } }).catch(() => {});
  });
  try {
    await page.goto("/people/stable-0");
    await active(page).getByRole("button", { name: "Повторить загрузку подписки" }).tap();
    const bell = active(page).getByRole("button", { name: "Подписаться на события", exact: true });
    await expect(bell).toBeEnabled();
    await bell.tap();
    const pending = active(page).getByRole("button", { name: "Вы подписаны — отписаться" });
    await expect(pending).toBeDisabled();
    await pending.dispatchEvent("click");
    await expect.poll(() => writes).toBe(1);
    release();
    await expect(pending).toBeEnabled();
    await expect(pending).toHaveAttribute("aria-pressed", "true");
  } finally { release(); }
});

test("a delayed chat response cannot reopen the previous person's chat after a swipe", async ({ page }) => {
  await fixture(page);
  let release = () => {};
  let started = false;
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route("**/api/conversations/direct", async route => {
    started = true;
    await gate;
    await route.fulfill({ json: { conversationId: "old-person-chat" } }).catch(() => {});
  });
  try {
    await page.goto("/people");
    await active(page).getByRole("button", { name: "Написать", exact: true }).tap();
    await expect.poll(() => started).toBe(true);
    const body = active(page).locator(".body");
    await body.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 280, clientY: 250 }] });
    await body.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: 80, clientY: 250 }], cancelable: true });
    await body.dispatchEvent("touchend", { touches: [], changedTouches: [{ identifier: 0, clientX: 80, clientY: 250 }] });
    await expect(active(page).locator("h1")).toContainText("Человек 1");
    release();
    await page.waitForTimeout(350);
    await expect(page).toHaveURL(/\/people$/);
    await expect(active(page).locator("h1")).toContainText("Человек 1");
  } finally { release(); }
});

for (const owner of [false, true]) {
  test(`105-person event stays compact for ${owner ? 'organizer' : 'guest'}, with first names and a paged drawer`, async ({ page }) => {
    await fixture(page);
    await page.route('**/api/events/meeting', r => r.fulfill({ json: {
      ...event, isBusiness: true, status: 'published', viewerStatus: owner ? 'organizer' : 'none',
      organizer: { ...people[0], id: 'organizer', name: 'FORMA' }, startsAt: '2099-11-08T18:00:00Z',
      seatsTaken: 104, seatsTotal: 200,
      participants: Array.from({ length: 104 }, (_, i) => ({ id: `crowd-${i}`, name: `Алексей Фамилия${i}`, avatarUrl: cover })),
    } }));
    await page.goto('/events/meeting');
    const screen = page.locator('section[data-id="event"]:not(.ghost)');
    const preview = screen.locator('.participant-preview');
    await expect(preview.locator('a')).toHaveCount(5);
    await expect(preview.locator('.participant-more')).toContainText('+100');
    await expect(screen.locator('.orgb .apl')).toHaveCount(0);
    const open = screen.getByRole('button', { name: owner ? 'Управлять участниками · 105' : 'Показать всех · 105', exact: true });
    await open.scrollIntoViewIfNeeded();
    await open.tap();
    const dialog = page.getByRole('dialog', { name: 'Кто идёт', exact: true });
    await expect(dialog.locator('.participant-row')).toHaveCount(30);
    await expect(dialog.locator('a[href="/people/crowd-0"]')).toHaveText('Алексей');
    await expect(dialog).not.toContainText('Фамилия');
    await dialog.getByRole('button', { name: 'Показать ещё · 75', exact: true }).scrollIntoViewIfNeeded();
    await dialog.getByRole('button', { name: 'Показать ещё · 75', exact: true }).tap();
    await expect(dialog.locator('.participant-row')).toHaveCount(60);
    await dialog.getByRole('button', { name: 'Закрыть список участников', exact: true }).scrollIntoViewIfNeeded();
    await dialog.getByRole('button', { name: 'Закрыть список участников', exact: true }).tap();
    await expect(dialog).toHaveCount(0);
    await open.tap();
    await expect(page.getByRole('dialog').locator('.participant-row')).toHaveCount(30);
  });
}

test('a slow event opens on the dark surface and Back works before the request finishes', async ({ page }) => {
  await fixture(page);
  let release = () => {};
  const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/events/meeting', async r => { await gate; await r.fulfill({ json: event }).catch(() => {}); });
  try {
    await page.goto('/events/meeting');
    const loading = page.getByLabel('Загрузка встречи', { exact: true });
    await expect(loading).toHaveCSS('background-color', 'rgb(23, 20, 31)');
    await loading.getByRole('button', { name: 'Назад', exact: true }).tap();
    await expect(page).toHaveURL(/\/feed$/);
    release();
    await expect(page.locator('section[data-id="event"]:not(.ghost)')).toHaveCount(0);
  } finally { release(); }
});

test('holding a photo before scrolling the feed does not trigger the press animation', async ({ page }) => {
  await fixture(page);
  await page.goto('/feed');
  for (const selector of ['.k-mt', '.k-hc']) {
    const card = page.locator(selector).first();
    await card.scrollIntoViewIfNeeded();
    await card.dispatchEvent('pointerdown', { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 350 });
    await page.waitForTimeout(150);
    await expect(card).not.toHaveClass(/k-down/);
    await card.dispatchEvent('pointermove', { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 200 });
    await card.dispatchEvent('pointercancel', { pointerType: 'touch', pointerId: 1 });
    await expect(page).toHaveURL(/\/feed$/);
  }
});
