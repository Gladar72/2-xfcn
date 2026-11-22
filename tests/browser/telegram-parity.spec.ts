import { expect, test } from "@playwright/test";

test("Telegram groups heart notifications, pages through senders and marks only the opened profile", async ({ page }) => {
  const ids = ["a", "b", "c"];
  const people = ids.map((id, i) => ({
    id, name: ["Анна", "Лена", "Илья"][i], age: 26, avatarUrl: null, unread: i !== 1,
    createdAt: new Date().toISOString(), photos: [], interests: [], sharedInterests: [], ratingAvg: 0, completedMeetingsCount: 0,
  }));
  const opened: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["profile", "notifications", "people"] }));
    localStorage.setItem("mesto_home_ask", "added");
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", route => {
    const req = route.request();
    const url = new URL(req.url());
    if (url.pathname === "/api/notifications" && req.method() === "GET") {
      return route.fulfill({ json: { items: people.map(p => ({
        id: p.id, type: "heart", linkUserId: p.id, text: p.name + " поставил сердечко", createdAt: p.createdAt,
      })) } });
    }
    if (url.pathname === "/api/me/hearts/inbox") {
      if (req.method() === "PATCH") {
        opened.push(req.postDataJSON().senderId);
        return route.fulfill({ json: { ok: true } });
      }
      const later = url.searchParams.has("cursor");
      return route.fulfill({ json: { items: later ? people.slice(1) : people.slice(0, 2), nextCursor: later ? null : "page2" } });
    }
    if (url.pathname.startsWith("/api/users/")) return route.fulfill({ json: people.find(p => url.pathname.endsWith("/" + p.id)) });
    return route.fulfill({ json: { items: [], events: [], count: 0 } });
  });
  await page.goto("/notifications");
  await page.getByRole("button", { name: /Ещё 2 человека/ }).click();
  await page.getByRole("button", { name: /Новые · 2/ }).click();
  await expect(page.getByRole("link", { name: /Лена/ })).toHaveCount(0);
  expect(opened).toEqual([]);
  await page.getByRole("link", { name: /Анна/ }).click();
  await expect(page).toHaveURL(/\/people\/a\?heart=1$/);
  await expect.poll(() => opened).toContain("a");
  expect(opened.every(id => id === "a")).toBe(true);
});

test("account linking confirms the code for the selected contact", async ({ page }) => {
  const requests: { path: string; data: unknown }[] = [];
  await page.route("**/api/**", route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/auth/mobile/email/send" || path === "/api/me/email") requests.push({ path, data: req.postDataJSON() });
    return route.fulfill({ json: { ok: true, items: [] } });
  });
  await page.goto("/settings/contact/email");
  await page.getByLabel("Почта", { exact: true }).fill("test@example.com");
  await page.getByRole("button", { name: "Получить код" }).click();
  await page.getByLabel("Код из письма").fill("1234");
  await page.getByRole("button", { name: "Подтвердить" }).click();
  await expect(page).toHaveURL(/\/settings$/);
  expect(requests).toEqual([
    { path: "/api/auth/mobile/email/send", data: { email: "test@example.com" } },
    { path: "/api/me/email", data: { email: "test@example.com", code: "1234" } },
  ]);
});

test("a different main photo persists through the existing gallery API", async ({ page }) => {
  const original = ["/brand/covers/coffee.webp", "/brand/covers/walk.webp"];
  let photos = [...original];
  let before: string[] = [];
  await page.addInitScript(() => localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["profile"] })));
  await page.route("**/api/**", async route => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (path === "/api/me/profile") return route.fulfill({ json: { name: "Андрей", avatarUrl: photos[0], photos } });
    if (path === "/api/me/photos" && req.method() === "PATCH") {
      const change = req.postDataJSON();
      before = change.before;
      photos = change.photos;
      return route.fulfill({ json: { avatarUrl: photos[0], photos } });
    }
    return route.fulfill({ json: { items: [] } });
  });
  await page.goto("/profile/edit");
  await page.getByRole("button", { name: "Фото 2", exact: true }).click();
  await page.getByRole("button", { name: "Сделать главным" }).click();
  await expect.poll(() => photos[0]).toBe(original[1]);
  expect(before).toEqual(original);
  await page.reload();
  await expect(page.getByRole("button", { name: "Главное фото", exact: true }).locator("img")).toHaveAttribute("src", original[1]!);
});

test("an incoming like appears on return to the open hearts screen", async ({ page }) => {
  let hasLike = false;
  const person = { id: "new-like", name: "Марина", age: 27, avatarUrl: null, unread: true, createdAt: new Date().toISOString() };
  await page.route("**/api/**", route => route.fulfill({
    json: new URL(route.request().url()).pathname === "/api/me/hearts/inbox"
      ? { items: hasLike ? [person] : [], nextCursor: null }
      : { items: [], count: 0 },
  }));
  await page.goto("/hearts");
  await expect(page.getByText("Пока нет сердечек")).toBeVisible();
  hasLike = true;
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("button", { name: "Новые · 1" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Марина/ })).toHaveAttribute("href", "/people/new-like?heart=1");
});
