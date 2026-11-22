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
