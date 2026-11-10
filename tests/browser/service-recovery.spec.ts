import { expect, test, type Page } from "@playwright/test";

const meeting = {
  id: "audit", title: "Тренировка HYROX", eventDate: "2026-11-10", eventTime: "18:00:00",
  seatsTaken: 0, seatsTotal: 3, status: "published", viewerStatus: "none", participants: [],
  category: { slug: "training", name: "Тренировка" }, organizer: { id: "host", name: "Андрей" },
  role: "participant", pendingApplicationsCount: 0, costType: "free", placeName: "Арена",
};

async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
  });
  await page.route("**/api/**", route => {
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path === "/api/me/profile" ? { id: "me", city: "Тюмень" }
      : path === "/api/events/audit" ? meeting : { items: [], events: [], count: 0 } });
  });
}

async function instagram(page: Page) {
  await page.goto("/events/audit");
  await page.getByRole("button", { name: "Поделиться", exact: true }).first().click();
  await page.getByRole("button", { name: "Instagram", exact: true }).click();
}

test("failed clipboard copy is visible and can be retried", async ({ page }) => {
  await fixture(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
      writeText: async () => { throw new DOMException("Denied", "NotAllowedError"); },
    } });
  });
  await instagram(page);
  await expect(page.getByText("✓ Ссылка скопирована", { exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Ссылка на встречу", { exact: true })).toHaveValue(/audit/);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async () => {} } });
  });
  await page.getByRole("button", { name: "Скопировать ссылку", exact: true }).click();
  await expect(page.getByText("✓ Ссылка скопирована", { exact: true })).toBeVisible();
});

for (const action of ["cancel", "error", "invalid", "success"] as const) {
  test(`Instagram ${action} does not trigger an unrelated download or tab`, async ({ page }) => {
    await fixture(page);
    await page.addInitScript((action) => {
      const state = { shared: 0, opened: 0 };
      Object.assign(window, { shareAudit: state });
      window.open = () => { state.opened++; return null; };
      Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
      Object.defineProperty(navigator, "share", { configurable: true, value: async () => {
        state.shared++;
        if (action === "cancel") throw new DOMException("Cancelled", "AbortError");
      } });
    }, action);
    const imageFailed = action === "error" || action === "invalid";
    await page.route("**/story.png?**", route => route.fulfill(imageFailed
      ? { status: action === "error" ? 503 : 200, contentType: "application/json", body: '{"error":"unavailable"}' }
      : { contentType: "image/png", body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWa0AAAAASUVORK5CYII=", "base64") }));
    await instagram(page);
    await page.getByRole("button", { name: "Открыть Instagram", exact: true }).click();
    if (imageFailed) await expect(page.getByRole("alert").filter({ hasText: "Не удалось подготовить сторис" })).toBeVisible();
    else await expect.poll(() => page.evaluate(() => (window as any).shareAudit.shared)).toBe(1);
    await expect(page.getByRole("button", { name: "Открыть Instagram", exact: true })).toBeEnabled();
    expect(await page.evaluate(() => (window as any).shareAudit)).toEqual({ shared: imageFailed ? 0 : 1, opened: 0 });
  });
}

test("declining a Telegram image download does not open Instagram and repeated taps are serialized", async ({ page }) => {
  await fixture(page);
  await page.route("**/story.png?**", route => route.fulfill({ contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jWa0AAAAASUVORK5CYII=", "base64") }));
  await instagram(page);
  await page.evaluate(() => {
    const state = { downloads: 0, opened: 0, finish: (_accepted: boolean) => {} };
    Object.assign(window, { downloadAudit: state, Telegram: { WebApp: {
      isVersionAtLeast: () => true,
      downloadFile: (_params: unknown, callback: (accepted: boolean) => void) => { state.downloads++; state.finish = callback; },
      openLink: () => { state.opened++; },
    } } });
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => false });
  });
  await page.getByRole("button", { name: "Открыть Instagram", exact: true }).dblclick();
  await expect.poll(() => page.evaluate(() => (window as any).downloadAudit.downloads)).toBe(1);
  await expect(page.getByRole("button", { name: "Подготавливаем…", exact: true })).toBeDisabled();
  await page.evaluate(() => (window as any).downloadAudit.finish(false));
  await expect(page.getByRole("button", { name: "Открыть Instagram", exact: true })).toBeEnabled();
  expect(await page.evaluate(() => (window as any).downloadAudit.opened)).toBe(0);
});

test("my events outage offers retry and does not claim the account is empty", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/me/events?**", route => route.fulfill(failed
    ? { status: 503, json: { error: "unavailable" } } : { json: { items: [meeting] } }));
  await page.goto("/my-events");
  await expect(page.getByText("Не удалось загрузить встречи.", { exact: true })).toBeVisible();
  await expect(page.getByText("Ты пока никуда не идёшь", { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByText(meeting.title, { exact: true })).toBeVisible();
});

test("failed notifications stay unread and recover without an unhandled error", async ({ page }) => {
  await fixture(page);
  let failed = true;
  let markedRead = 0;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/notifications", route => {
    if (route.request().method() === "PATCH") { markedRead++; return route.fulfill({ json: { ok: true } }); }
    return failed ? route.abort() : route.fulfill({ json: { items: [{ id: "note", type: "event_reminder",
      createdAt: "2026-11-10T12:00:00Z", text: "Тренировка скоро начнётся", isRead: false, event: null }] } });
  });
  await page.goto("/notifications");
  await expect(page.getByText("Не удалось загрузить уведомления.", { exact: true })).toBeVisible();
  await expect(page.getByText("Пока тихо", { exact: true })).toHaveCount(0);
  expect(markedRead).toBe(0);
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByText("Тренировка скоро начнётся", { exact: true })).toBeVisible();
  await expect.poll(() => markedRead).toBe(1);
  expect(errors).toEqual([]);
});

for (const entry of ["my-events", "pending"] as const) {
  test(`${entry} keeps a failed review and rating for retry`, async ({ page }) => {
    await fixture(page);
    let failed = true;
    const submitted: unknown[] = [];
    const reviewable = { events: [{ eventId: "audit", title: meeting.title, eventDate: meeting.eventDate,
      reviewableMembers: [{ id: "host", name: "Андрей" }] }] };
    await page.route("**/api/me/events?**", route => route.fulfill({ json: { items: [{ ...meeting, status: "completed" }] } }));
    if (entry === "pending") await page.route("**/api/reviews/reviewable", route => route.fulfill({ json: reviewable }));
    await page.route("**/api/reviews", route => {
      submitted.push(route.request().postDataJSON());
      return route.fulfill(failed ? { status: 500, json: { error: "create_failed" } } : { json: { status: "created" } });
    });
    await page.goto(entry === "pending" ? "/feed" : "/my-events");
    if (entry === "my-events") {
      await expect(page.getByText(meeting.title, { exact: true })).toBeVisible();
      // Let the global prompt finish its empty initial read, then load the archive.
      await page.route("**/api/reviews/reviewable", route => route.fulfill({ json: reviewable }));
      await page.getByRole("button", { name: "Прошли", exact: true }).click();
      await page.getByText("Оставь отзыв", { exact: true }).click();
    }
    await page.getByRole("button", { name: "4 звёзд", exact: true }).click();
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Не удалось отправить отзыв" })).toBeVisible();
    await expect(page.getByRole("button", { name: "4 звёзд", exact: true })).toHaveClass("on");
    failed = false;
    await page.getByRole("button", { name: "Отправить", exact: true }).click();
    await expect(page.getByRole("button", { name: "Отправить", exact: true })).toHaveCount(0);
    expect(submitted).toHaveLength(2);
    expect(submitted[1]).toEqual(submitted[0]);
  });
}

test("profile failures keep edits and offer recovery without reporting success", async ({ page }) => {
  await fixture(page);
  let loadFailed = true;
  let saveFailed = true;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/me/profile", route => {
    if (route.request().method() === "PATCH") return saveFailed ? route.abort() : route.fulfill({ json: { ok: true } });
    return route.fulfill(loadFailed ? { status: 503, json: { error: "unavailable" } }
      : { json: { id: "me", name: "Андрей", birthDate: "1995-01-01", bio: "Бегаю", photos: [] } });
  });
  await page.goto("/profile/edit");
  await expect(page.getByText("Не удалось загрузить профиль.", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Сохранить", exact: true }).first()).toBeDisabled();
  loadFailed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByPlaceholder("Имя", { exact: true })).toHaveValue("Андрей");
  await page.getByPlaceholder("Имя", { exact: true }).fill("Андрей HYROX");
  await page.getByRole("button", { name: "Сохранить", exact: true }).first().click();
  await expect(page.getByText("Не удалось сохранить профиль. Попробуй ещё раз.", { exact: true })).toBeVisible();
  await expect(page.getByPlaceholder("Имя", { exact: true })).toHaveValue("Андрей HYROX");
  saveFailed = false;
  await page.getByRole("button", { name: "Сохранить", exact: true }).first().click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test("review list outage does not claim an event was already reviewed", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/reviews/reviewable", route => route.fulfill(failed
    ? { status: 500, json: { error: "fetch_failed" } } : { json: { events: [] } }));
  await page.goto("/reviews?event=audit");
  await expect(page.getByText("Не удалось загрузить отзывы.", { exact: true })).toBeVisible();
  await expect(page.getByText("Эту встречу ты уже оценил — спасибо!", { exact: true })).toHaveCount(0);
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByText("Оценивать пока некого", { exact: true })).toBeVisible();
});

test("photo deletion failure keeps the photo visible and can be retried", async ({ page }) => {
  await fixture(page);
  const photos = ["/brand/covers/coffee.webp", "/brand/covers/walk.webp"];
  let failed = true;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/me/profile", route => route.fulfill({ json: { id: "me", name: "Андрей", birthDate: "1995-01-01", photos } }));
  await page.route("**/api/me/photos", route => failed ? route.abort() : route.fulfill({ json: { photos: photos.slice(0, 1) } }));
  await page.goto("/profile/edit");
  await page.getByRole("button", { name: "Удалить фото", exact: true }).click();
  await expect(page.getByText("Не удалось удалить фото. Попробуй ещё раз.", { exact: true })).toBeVisible();
  await expect(page.locator(".phgrid img")).toHaveCount(2);
  failed = false;
  await page.getByRole("button", { name: "Удалить фото", exact: true }).click();
  await expect(page.locator(".phgrid img")).toHaveCount(1);
  expect(errors).toEqual([]);
});
