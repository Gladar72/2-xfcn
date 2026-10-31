import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";

const START = Date.parse("2026-10-30T10:00:00Z");
const message = (n: number) => ({
  id: `message-${n}`, senderId: n % 3 === 0 ? "me" : "other",
  content: `Сообщение ${n}. Встречаемся вечером, обсудим планы и выберем место.`,
  createdAt: new Date(START + n * 60_000).toISOString(), reactions: [],
});

async function openChat(page: Page, options: { older?: boolean; failOlder?: boolean; empty?: boolean } = {}) {
  const sockets = new Map<WebSocketRoute, string>();
  let historyRequests = 0;
  let failOlder = !!options.failOlder;
  let releaseHistory = () => {};
  const historyGate = new Promise<void>((resolve) => { releaseHistory = resolve; });
  const initial = options.empty ? [] : Array.from({ length: 50 }, (_, i) => message(i + 50));
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (socket) => {
    socket.onMessage((raw) => {
      const m = JSON.parse(String(raw));
      if (m.event === "phx_join") {
        sockets.set(socket, m.topic);
        socket.send(JSON.stringify({ topic: m.topic, ref: m.ref, event: "phx_reply", payload: { status: "ok", response: {} } }));
      } else if (m.event === "heartbeat") {
        socket.send(JSON.stringify({ topic: m.topic, ref: m.ref, event: "phx_reply", payload: { status: "ok", response: {} } }));
      }
    });
    socket.onClose(() => sockets.delete(socket));
  });
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    let data: unknown = {};
    if (url.pathname === "/api/me") data = { userId: "me" };
    else if (url.pathname === "/api/auth/realtime-token") {
      const payload = Buffer.from(JSON.stringify({ sub: "me", role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
      data = { token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test` };
    } else if (url.pathname.endsWith("/messages")) {
      if (request.method() === "POST") data = { messageId: "sent-message", createdAt: new Date().toISOString() };
      else if (url.searchParams.has("before")) {
        historyRequests++;
        await historyGate;
        if (failOlder) {
          failOlder = false;
          return route.fulfill({ status: 500, json: { error: "offline" } });
        }
        data = { messages: Array.from({ length: 50 }, (_, i) => message(i)), hasMore: false };
      } else data = {
        messages: initial, hasMore: !!options.older,
        members: [{ id: "other", name: "Алексей", avatarUrl: null, lastReadAt: null }],
      };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/chats/test-chat");
  if (!options.empty) await expect(page.locator("#m-message-99")).toBeVisible();
  else await expect(page.getByText("Начни с приветствия или сразу позови на встречу")).toBeVisible();
  await expect.poll(() => sockets.size).toBeGreaterThan(0);
  return {
    releaseHistory,
    historyRequests: () => historyRequests,
    broadcast: async (event: string, payload: unknown) => {
      for (const [socket, topic] of sockets) socket.send(JSON.stringify({ topic, event: "broadcast", payload: { type: "broadcast", event, payload } }));
    },
  };
}

const distanceFromBottom = (page: Page) => page.locator(".msgs").evaluate((el) => el.scrollHeight - el.clientHeight - el.scrollTop);
const scrollTo = async (page: Page, top: number) => {
  // Wait for the native scroll event, not just the synchronous scrollTop write.
  await page.locator(".msgs").evaluate((el, y) => new Promise<void>((resolve) => {
    if (el.scrollTop === y) return resolve();
    el.addEventListener("scroll", () => resolve(), { once: true });
    el.scrollTop = y;
  }), top);
  await expect.poll(() => page.locator(".msgs").evaluate((el) => el.scrollTop)).toBeCloseTo(top, 0);
};
const anchor = (page: Page) => page.locator(".msgs").evaluate((list) => {
  const top = list.getBoundingClientRect().top;
  const row = [...list.querySelectorAll<HTMLElement>(".mwrap")].find((r) => r.getBoundingClientRect().bottom > top)!;
  return { id: row.id, offset: row.getBoundingClientRect().top - top };
});
const offset = (page: Page, id: string) => page.locator(`#${id}`).evaluate((row) => row.getBoundingClientRect().top - row.closest(".msgs")!.getBoundingClientRect().top);

test("initial history is reachable in both directions without touching the input", async ({ page }, testInfo) => {
  await openChat(page);
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  const geometry = await page.locator(".msgs").evaluate((list) => ({
    top: list.getBoundingClientRect().top,
    bottom: list.getBoundingClientRect().bottom,
    headerBottom: document.querySelector(".hd")!.getBoundingClientRect().bottom,
    composerTop: document.querySelector(".compose")!.getBoundingClientRect().top,
    range: list.scrollHeight - list.clientHeight,
  }));
  expect(geometry.range).toBeGreaterThan(2000);
  expect(geometry.top).toBeGreaterThanOrEqual(geometry.headerBottom);
  expect(geometry.bottom).toBeLessThanOrEqual(geometry.composerTop);
  await scrollTo(page, 0);
  expect(await offset(page, "m-message-50")).toBeGreaterThanOrEqual(0);
  await expect(page.getByRole("button", { name: "К последним сообщениям" })).toBeVisible();
  await page.getByRole("button", { name: "К последним сообщениям" }).click();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  await page.screenshot({ path: testInfo.outputPath("chat.png") });
});

test("native touch gestures scroll both ways immediately after opening", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "CDP touch injection is only available in Chromium");
  await openChat(page);
  const client = await page.context().newCDPSession(page);
  const box = (await page.locator(".msgs").boundingBox())!;
  const swipe = async (start: number, end: number) => {
    const point = (y: number) => [{ x: box.x + box.width / 2, y, id: 0 }];
    await client.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: point(start) });
    for (let step = 1; step <= 12; step++) {
      await client.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: point(start + (end - start) * step / 12) });
      await page.waitForTimeout(20);
    }
    await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await swipe(box.y + 100, box.y + 400);
  await expect.poll(() => distanceFromBottom(page)).toBeGreaterThan(200);
  await page.waitForTimeout(550); // Include momentum and the cancelled long-press timer.
  await expect(page.locator(".mpop")).toHaveCount(0);
  const before = await page.locator(".msgs").evaluate((el) => el.scrollTop);
  await swipe(box.y + 400, box.y + 100);
  await expect.poll(() => page.locator(".msgs").evaluate((el) => el.scrollTop)).toBeGreaterThan(before + 100);
  await expect(page.locator(".mpop")).toHaveCount(0);
});

test("incoming messages preserve reading position and the down button clears the counter", async ({ page }) => {
  const chat = await openChat(page);
  await scrollTo(page, 1000);
  const before = await anchor(page);
  await chat.broadcast("message", { ...message(100), senderId: "other" });
  await expect(page.locator("#m-message-100")).toBeAttached();
  await expect.poll(() => offset(page, before.id)).toBeCloseTo(before.offset, 0);
  await expect(page.locator(".tobot .cnt")).toHaveText("1");
  await page.getByRole("button", { name: "К последним сообщениям" }).click();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  await chat.broadcast("message", { ...message(101), senderId: "other" });
  await expect(page.locator("#m-message-101")).toBeAttached();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  await expect(page.locator(".tobot")).toHaveCount(0);
});

test("prepending history preserves the row read after a delayed request", async ({ page }) => {
  const chat = await openChat(page, { older: true });
  await scrollTo(page, 100);
  await expect.poll(chat.historyRequests).toBe(1);
  await scrollTo(page, 350);
  const before = await anchor(page);
  chat.releaseHistory();
  await expect(page.locator("#m-message-0")).toBeAttached();
  await expect.poll(() => offset(page, before.id)).toBeCloseTo(before.offset, 0);
  expect(chat.historyRequests()).toBe(1);
  await expect(page.locator(".tobot .cnt")).toHaveCount(0);
});

test("failed history loading is retryable without duplicate requests", async ({ page }) => {
  const chat = await openChat(page, { older: true, failOlder: true });
  await scrollTo(page, 100);
  await expect.poll(chat.historyRequests).toBe(1);
  chat.releaseHistory();
  await expect(page.getByText("Не удалось загрузить историю. Попробуй ещё раз.")).toBeVisible();
  // The successful retry immediately prepends rows and adjusts scrollTop.
  await page.locator(".msgs").evaluate((el) => { el.scrollTop = 0; });
  await expect(page.locator("#m-message-0")).toBeAttached();
  expect(chat.historyRequests()).toBe(2);
});

test("prepending on the same day keeps the first message in place when its date label disappears", async ({ page }) => {
  const chat = await openChat(page, { older: true });
  await scrollTo(page, 0);
  await expect.poll(chat.historyRequests).toBe(1);
  const bubble = page.locator("#m-message-50 .m");
  const before = (await bubble.boundingBox())!.y;
  chat.releaseHistory();
  await expect(page.locator("#m-message-0")).toBeAttached();
  await expect.poll(async () => (await bubble.boundingBox())!.y).toBeCloseTo(before, 0);
});

test("keyboard-sized viewport and multiline composer keep bottom or reading anchor", async ({ page }) => {
  await openChat(page);
  const original = page.viewportSize()!;
  await page.setViewportSize({ width: original.width, height: 490 });
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  await page.getByPlaceholder("Сообщение", { exact: true }).fill("Один\nДва\nТри\nЧетыре\nПять");
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  await scrollTo(page, 1000);
  const before = await anchor(page);
  await page.setViewportSize(original);
  await expect.poll(() => offset(page, before.id)).toBeCloseTo(before.offset, 0);
  await expect(page.locator(".tobot")).toBeVisible();
});

test("sending from history follows the new message and leaves the composer usable", async ({ page }) => {
  await openChat(page);
  await scrollTo(page, 1000);
  const input = page.getByPlaceholder("Сообщение", { exact: true });
  await input.fill("Проверяем отправку из истории");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.locator("#m-sent-message")).toBeVisible();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  await expect(input).toBeFocused();
  await expect(input).toHaveValue("");
});

test("resizing a message above the viewport preserves the visible row", async ({ page }) => {
  const chat = await openChat(page);
  await scrollTo(page, 1200);
  const before = await anchor(page);
  await chat.broadcast("edit", { id: "message-51", content: "Дополнение к сообщению. ".repeat(60), editedAt: new Date().toISOString() });
  await expect(page.locator("#m-message-51")).toContainText("Дополнение к сообщению.");
  await expect.poll(() => offset(page, before.id)).toBeCloseTo(before.offset, 0);
});

test("cancelled touch scrolling never opens the message menu", async ({ page }) => {
  await openChat(page);
  const bubble = page.locator("#m-message-98 .bb");
  await bubble.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 150, clientY: 400 }] });
  await bubble.dispatchEvent("touchcancel");
  await page.waitForTimeout(550); // Wait past the long-press threshold to detect a leaked timer.
  await expect(page.locator(".mpop")).toHaveCount(0);
  await bubble.dispatchEvent("touchstart", { touches: [{ identifier: 0, clientX: 150, clientY: 400 }] });
  await expect(page.locator(".mpop")).toBeVisible();
  await bubble.dispatchEvent("touchend");
});

test("an empty conversation follows the first incoming message", async ({ page }) => {
  const chat = await openChat(page, { empty: true });
  await chat.broadcast("message", { ...message(100), senderId: "other" });
  await expect(page.locator("#m-message-100")).toBeVisible();
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  await expect(page.locator(".tobot")).toHaveCount(0);
});
