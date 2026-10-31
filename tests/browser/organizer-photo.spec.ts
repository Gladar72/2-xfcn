import { expect, test, type Page } from "@playwright/test";

async function fixture(page: Page, avatarUrl: string | null = null) {
  await page.route("**/api/**", (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/api/subscriptions" ? { active: true, plan: "premium" }
      : path === "/api/me/profile" ? { name: "Организатор", city: "Тюмень", avatarUrl }
        : path === "/api/categories" ? { categories: [{ id: "coffee", slug: "coffee", name: "Кофе" }] }
          : { items: [] };
    return route.fulfill({ json });
  });
}

test("legacy account is prompted for a profile photo when choosing an open event", async ({ page }, testInfo) => {
  await fixture(page);
  await page.goto("/create");
  await page.getByRole("button", { name: /Открытая встреча/ }).click();
  await expect(page.getByRole("heading", { name: "Добавь своё фото" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Добавить фото профиля" })).toBeVisible();
  await expect(page.locator(".m-peek").filter({ hasText: "Добавь своё фото" })).toBeVisible();
  await expect(page.locator(".m-peek .bb").filter({ hasText: "Добавь своё фото" })).toHaveCSS("opacity", "1");
  await page.screenshot({ path: testInfo.outputPath("organizer-photo.png") });
  await expect(page.getByRole("button", { name: "Дальше", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Назад", exact: true }).click();
  await page.getByRole("button", { name: /Анонимная встреча/ }).click();
  await expect(page.getByTestId("organizer-photo-gate")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Дальше", exact: true })).toBeVisible();
});

test("server photo rejection preserves the filled draft through an inline photo upload", async ({ page }) => {
  await fixture(page, "/brand/mosya/mosya_think.webp");
  await page.route("**/api/city-events/sample", (route) => route.fulfill({ json: {
    title: "Кофе в парке", eventDate: "2099-11-02", eventTime: "18:00", placeName: "Кофейня у парка", address: "Тестовый адрес", latitude: 57.15, longitude: 65.54,
  } }));
  let missingPhoto = true;
  await page.route("**/api/events", (route) => route.fulfill(missingPhoto
    ? { status: 422, json: { error: "profile_photo_required", field: "avatarUrl", message: "Добавь фото профиля." } }
    : { json: { eventId: "new-event" } }));
  await page.route("**/api/me/avatar", (route) => {
    missingPhoto = false;
    return route.fulfill({ json: { avatarUrl: "/brand/mosya/mosya_think.webp" } });
  });
  await page.goto("/create?fromCity=sample&category=coffee#tgWebAppData=browser-fixture");
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await expect(page.getByPlaceholder("Например, кофе перед работой")).toHaveValue("Пойдём вместе: Кофе в парке");
  await page.getByPlaceholder("Что будем делать, как узнать друг друга").fill("Поболтаем за кофе и прогуляемся в парке");
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await page.getByRole("button", { name: "Дальше", exact: true }).click();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Добавь своё фото" })).toBeVisible();
  await page.getByLabel("Фото профиля", { exact: true }).setInputFiles("public/brand/mosya/mosya_think.webp");
  await expect(page.getByRole("button", { name: "Опубликовать", exact: true })).toBeVisible();
  await expect(page.getByText("Пойдём вместе: Кофе в парке").first()).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать", exact: true }).click();
  await expect(page.locator('[data-id="published"]')).toBeVisible();
});

test("business creation uses the same profile photo prompt", async ({ page }) => {
  await fixture(page);
  await page.goto("/create");
  await page.getByRole("button", { name: /Событие для бизнеса/ }).click();
  await expect(page.getByRole("heading", { name: "Добавь своё фото" })).toBeVisible();
});

test("a current profile photo permits the usual creation flow", async ({ page }) => {
  await fixture(page, "/brand/mosya/mosya_think.webp");
  await page.goto("/create");
  await page.getByRole("button", { name: /Открытая встреча/ }).click();
  await expect(page.getByRole("button", { name: "Дальше", exact: true })).toBeVisible();
  await expect(page.getByTestId("organizer-photo-gate")).toHaveCount(0);
});

test("profile load failure is retryable instead of demanding a new photo", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/me/profile", (route) => route.fulfill(failed
    ? { status: 503, json: { error: "unavailable" } }
    : { json: { name: "Организатор", avatarUrl: "/brand/mosya/mosya_think.webp" } }));
  await page.goto("/create");
  await page.getByRole("button", { name: /Открытая встреча/ }).click();
  await expect(page.getByRole("heading", { name: "Не удалось загрузить профиль" })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).click();
  await expect(page.getByRole("button", { name: "Дальше", exact: true })).toBeVisible();
});

test("failed avatar upload stays blocked; successful retry continues the chosen flow", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/me/avatar", (route) => route.fulfill(failed
    ? { status: 422, json: { error: "photo_rejected" } }
    : { json: { avatarUrl: "/brand/mosya/mosya_think.webp" } }));
  await page.goto("/create");
  await page.getByRole("button", { name: /Открытая встреча/ }).click();
  await page.getByLabel("Фото профиля", { exact: true }).setInputFiles("public/brand/mosya/mosya_think.webp");
  await expect(page.getByTestId("organizer-photo-gate").getByRole("alert")).toContainText("не прошло проверку");
  await expect(page.getByRole("button", { name: "Дальше", exact: true })).toHaveCount(0);
  failed = false;
  await page.getByLabel("Фото профиля", { exact: true }).setInputFiles("public/brand/mosya/mosya_think.webp");
  await expect(page.getByRole("button", { name: "Дальше", exact: true })).toBeVisible();
});
