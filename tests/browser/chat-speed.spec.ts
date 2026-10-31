import { expect, test, type Page } from "@playwright/test";

const message = { id: "one", senderId: "other", content: "Давай встретимся вечером", createdAt: "2026-10-31T12:00:00Z", reactions: [] };
const personal = { conversationId: "speed", eventTitle: null, eventStatus: null, unreadCount: 2, otherUser: { id: "other", name: "Алексей", avatarUrl: null }, lastMessage: null };
const history = { userId: "me", messages: [message], hasMore: false, members: [{ id: "other", name: "Алексей", avatarUrl: null }] };
const token = () => ({ token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: "me", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test` });
function gate() {
  let release = () => {};
  const promise = new Promise<void>((r) => { release = r; });
  return { promise, release };
}
async function fixture(page: Page) {
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
    socket.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (["phx_join", "phx_leave", "heartbeat"].includes(m.event)) socket.send(JSON.stringify({ topic: m.topic, ref: m.ref, event: "phx_reply", payload: { status: "ok", response: {} } }));
    });
  });
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/api/me" ? { userId: "me" }
      : path === "/api/auth/realtime-token" ? token()
      : path === "/api/conversations" ? { items: [personal] }
      : path.endsWith("/messages") ? history
      : path === "/api/me/profile" ? { city: "Тюмень" }
      : path === "/api/categories" ? { categories: [], trainingTypes: [] }
      : { items: [] };
    await route.fulfill({ json });
  });
}

test("history and composer are usable while the realtime token is still pending", async ({ page }) => {
  await fixture(page);
  const pending = gate();
  let meReads = 0;
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/me") meReads++; });
  await page.route("**/api/auth/realtime-token", async (r) => { await pending.promise; await r.fulfill({ json: token() }).catch(() => {}); });
  try {
    await page.goto("/chats/speed");
    await expect(page.getByText(message.content, { exact: true })).toBeVisible();
    await expect(page.getByPlaceholder("Сообщение")).toBeEnabled();
    expect(meReads).toBe(0);
  } finally { pending.release(); }
});

test("a realtime outage does not turn available history into a chat error", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/auth/realtime-token", (r) => r.fulfill({ status: 503, json: { error: "unavailable" } }));
  await page.goto("/chats/speed");
  await expect(page.getByText(message.content, { exact: true })).toBeVisible();
  await page.getByPlaceholder("Сообщение").fill("Текст доступен");
  await expect(page.getByRole("button", { name: "Отправить", exact: true })).toBeEnabled();
  await expect(page.locator(".P [role=alert]")).toHaveCount(0);
});

test("returning from a personal chat keeps the tab and rows while refreshing", async ({ page }) => {
  await fixture(page);
  await page.goto("/chats");
  await page.getByRole("button", { name: "Личные", exact: true }).click();
  await page.getByRole("link", { name: /Алексей/ }).click();
  await expect(page.getByText(message.content, { exact: true })).toBeVisible();
  const pending = gate();
  await page.route("**/api/conversations", async (r) => { await pending.promise; await r.fulfill({ json: { items: [personal] } }).catch(() => {}); });
  try {
    await page.locator('section:not(.ghost)').getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/chats$/);
    await expect(page.getByRole("button", { name: "Личные", exact: true })).toHaveClass("on");
    await expect(page.getByRole("link", { name: /Алексей/ })).toBeVisible();
    await expect(page.locator('.ci .n')).toHaveCount(0);
  } finally { pending.release(); }
});

test("leaving a chat aborts unfinished history instead of occupying the connection", async ({ page }) => {
  await fixture(page);
  await page.goto("/chats");
  await page.getByRole("button", { name: "Личные", exact: true }).click();
  const pending = gate();
  let started = false;
  let aborted = false;
  page.on("requestfailed", (r) => { if (new URL(r.url()).pathname.endsWith("/messages")) aborted = true; });
  await page.route("**/api/conversations/speed/messages", async (r) => { started = true; await pending.promise; await r.fulfill({ json: history }).catch(() => {}); });
  try {
    await page.getByRole("link", { name: /Алексей/ }).click();
    await expect.poll(() => started).toBe(true);
    await page.locator('section:not(.ghost)').getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/chats$/);
    await expect.poll(() => aborted).toBe(true);
    await expect(page.getByRole("link", { name: /Алексей/ })).toBeVisible();
  } finally { pending.release(); }
});

test("a touch opens the message menu even when Safari consumes the later click", async ({ page }) => {
  await fixture(page);
  await page.goto("/chats/speed");
  const bubble = page.locator("#m-one .bb");
  await expect(bubble).toBeVisible();
  await page.getByPlaceholder("Сообщение").focus();
  await bubble.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 140, clientY: 350 }] });
  await bubble.dispatchEvent("touchend", { touches: [] });
  await expect(page.getByRole("dialog", { name: "Меню сообщения", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Закрыть меню сообщения", exact: true }).tap({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("dialog", { name: "Меню сообщения", exact: true })).toHaveCount(0);
  await bubble.tap();
  await expect(page.getByRole("dialog", { name: "Меню сообщения", exact: true })).toBeVisible();
});

test("a scroll does not open the menu and the following tap works", async ({ page }) => {
  await fixture(page);
  await page.goto("/chats/speed");
  const bubble = page.locator("#m-one .bb");
  await expect(bubble).toBeVisible();
  await bubble.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 140, clientY: 350 }] });
  await bubble.dispatchEvent("touchmove", { touches: [{ identifier: 0, clientX: 140, clientY: 400 }] });
  await bubble.dispatchEvent("touchend", { touches: [] });
  await expect(page.getByRole("dialog", { name: "Меню сообщения", exact: true })).toHaveCount(0);
  await bubble.tap();
  await expect(page.getByRole("dialog", { name: "Меню сообщения", exact: true })).toBeVisible();
});

test("messages received during slow connection setup appear when connected", async ({ page }) => {
  await fixture(page);
  const pending = gate();
  let requests = 0;
  await page.route("**/api/auth/realtime-token", async (r) => { await pending.promise; await r.fulfill({ json: token() }).catch(() => {}); });
  await page.route("**/api/conversations/speed/messages", (r) => {
    requests++;
    return r.fulfill({ json: { ...history, messages: requests === 1 ? [message] : [message, { ...message, id: "two", content: "Новое сообщение за время подключения", createdAt: "2026-10-31T12:01:00Z" }] } });
  });
  try {
    await page.goto("/chats/speed");
    await expect(page.getByText(message.content, { exact: true })).toBeVisible();
    pending.release();
    await expect(page.getByText("Новое сообщение за время подключения", { exact: true })).toBeVisible();
  } finally { pending.release(); }
});

test("returning home keeps its cards while slow requests refresh in the background", async ({ page }) => {
  await fixture(page);
  const event = { id: "coffee", title: "Кофе после работы", city: "Тюмень", eventDate: "2026-11-02", eventTime: "18:00", seatsTotal: 5, seatsTaken: 0, category: { slug: "coffee", name: "Кофе" }, organizer: { id: "other", name: "Алексей", age: 30, ratingAvg: 5 } };
  await page.route("**/api/events?**", (r) => r.fulfill({ json: { items: new URL(r.request().url()).searchParams.has("business") ? [] : [event] } }));
  await page.goto("/feed");
  await expect(page.getByText(event.title, { exact: true }).first()).toBeVisible();
  await page.getByRole("link", { name: "Чаты", exact: true }).click();
  await page.getByRole("button", { name: "Личные", exact: true }).click();
  await page.getByRole("link", { name: /Алексей/ }).click();
  await expect(page.getByText(message.content, { exact: true })).toBeVisible();
  const pending = gate();
  await page.route("**/api/events?**", async (r) => { await pending.promise; await r.fulfill({ json: { items: [] } }).catch(() => {}); });
  try {
    await page.locator('section:not(.ghost)').getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/chats$/);
    await page.locator('section:not(.ghost)').getByRole("button", { name: "Назад", exact: true }).click();
    await expect(page).toHaveURL(/\/feed$/);
    await expect(page.getByText(event.title, { exact: true }).first()).toBeVisible();
    pending.release();
    await expect(page.getByText(event.title, { exact: true })).toHaveCount(0);
  } finally { pending.release(); }
});
