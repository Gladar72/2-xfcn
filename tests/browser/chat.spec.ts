import { test, expect, type Page, type WebSocketRoute } from "@playwright/test";
import { readdirSync } from "node:fs";
import type { MessageData } from "../../components/chat/MessageBubble";

const mosya = readdirSync("public/brand/stickers").filter((file) => file.endsWith(".webp")).map((file) => file.replace(".webp", ""));

const START = Date.parse("2026-10-30T10:00:00Z");
const message = (n: number) => ({
  id: `message-${n}`, senderId: n % 3 === 0 ? "me" : "other",
  content: `Сообщение ${n}. Встречаемся вечером, обсудим планы и выберем место.`,
  createdAt: new Date(START + n * 60_000).toISOString(), reactions: [],
});

async function openChat(page: Page, options: { older?: boolean; failOlder?: boolean; empty?: boolean; messages?: MessageData[] } = {}) {
  const sockets = new Map<WebSocketRoute, string>();
  let historyRequests = 0;
  let failOlder = !!options.failOlder;
  let releaseHistory = () => {};
  const historyGate = new Promise<void>((resolve) => { releaseHistory = resolve; });
  const initial = options.messages ?? (options.empty ? [] : Array.from({ length: 50 }, (_, i) => message(i + 50)));
  const sent: { content: string; replyToId?: string }[] = [];
  const reactions: string[] = [];
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
      if (request.method() === "POST") {
        sent.push(request.postDataJSON());
        data = { messageId: sent.length === 1 ? "sent-message" : `sent-message-${sent.length}`, createdAt: new Date().toISOString() };
      }
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
    } else if (url.pathname.endsWith("/reactions") && request.method() === "POST") {
      const { emoji } = request.postDataJSON();
      reactions.push(emoji);
      data = { reactions: [{ emoji, userIds: ["me"] }] };
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/chats/test-chat");
  if (initial.length) await expect(page.locator(`#m-${initial[initial.length - 1]!.id}`)).toBeVisible();
  else await expect(page.getByText("Начни с приветствия или сразу позови на встречу")).toBeVisible();
  await expect.poll(() => sockets.size).toBeGreaterThan(0);
  return {
    releaseHistory,
    historyRequests: () => historyRequests,
    sent,
    reactions,
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

const editableMessage = () => ({
  ...message(100), senderId: "me", createdAt: new Date().toISOString(),
  content: "Встречаемся завтра вечером у входа в парк, потом вместе выбираем место для ужина и обсуждаем планы на выходные.",
});

async function beginEdit(page: Page) {
  await page.locator("#m-message-100 .bb").tap();
  await page.getByRole("dialog", { name: "Меню сообщения", exact: true }).getByRole("button", { name: "Изменить", exact: true }).tap();
}

test("editing a long message keeps save and cancel inside the phone viewport", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const chat = await openChat(page, { messages: [editableMessage()] });
  const edits: unknown[] = [];
  await page.route("**/messages/message-100", async (route) => {
    edits.push(route.request().postDataJSON());
    await route.fulfill({ json: { status: "ok", editedAt: new Date().toISOString() } });
  });
  await beginEdit(page);
  const save = page.getByRole("button", { name: "Сохранить", exact: true });
  const input = page.getByRole("textbox", { name: "Сообщение", exact: true });
  for (const size of [{ width: 320, height: 640 }, { width: 390, height: 400 }]) {
    await page.setViewportSize(size);
    await expect(save).toBeInViewport({ ratio: 1 });
    await expect(page.getByRole("button", { name: "Отменить", exact: true })).toBeInViewport({ ratio: 1 });
    await expect.poll(() => page.locator(".compose").evaluate((el) => el.scrollWidth - el.clientWidth)).toBeLessThanOrEqual(1);
  }
  await input.fill("Встречаемся завтра в 19:00.\nМесто уточним в чате.");
  await page.screenshot({ path: testInfo.outputPath("chat-edit.png"), animations: "disabled" });
  await save.tap();
  await expect(page.locator(".rbar")).toHaveCount(0);
  await expect(page.locator("#m-message-100")).toContainText("Встречаемся завтра в 19:00.");
  expect(edits).toEqual([{ content: "Встречаемся завтра в 19:00.\nМесто уточним в чате." }]);
  expect(chat.sent).toHaveLength(0);
});

test("a failed edit preserves the correction for one-tap retry without sending a new message", async ({ page }) => {
  const original = { ...editableMessage(), content: "До встречи" };
  const chat = await openChat(page, { messages: [original] });
  let attempts = 0;
  await page.route("**/messages/message-100", async (route) => {
    attempts++;
    await route.fulfill(attempts === 1
      ? { status: 500, json: { error: "update_failed" } }
      : { json: { status: "ok", editedAt: new Date().toISOString() } });
  });
  await beginEdit(page);
  const input = page.getByRole("textbox", { name: "Сообщение", exact: true });
  const save = page.getByRole("button", { name: "Сохранить", exact: true });
  await input.fill("До встречи завтра");
  await save.tap();
  await expect(page.getByText("Не удалось изменить", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("До встречи завтра");
  await expect(save).toBeEnabled();
  await expect(page.locator("#m-message-100 .bb")).toContainText(original.content);
  await save.tap();
  await expect(page.locator(".rbar")).toHaveCount(0);
  await expect(page.locator("#m-message-100 .bb")).toContainText("До встречи завтра");
  expect(attempts).toBe(2);
  expect(chat.sent).toHaveLength(0);
});

test("network failure keeps the edit and repeated taps cannot submit during a delayed retry", async ({ page }) => {
  const chat = await openChat(page, { messages: [editableMessage()] });
  let attempts = 0;
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  await page.route("**/messages/message-100", async (route) => {
    attempts++;
    if (attempts === 1) return route.abort("failed");
    await gate;
    await route.fulfill({ json: { status: "ok", editedAt: new Date().toISOString() } });
  });
  await beginEdit(page);
  const input = page.getByRole("textbox", { name: "Сообщение", exact: true });
  const save = page.getByRole("button", { name: "Сохранить", exact: true });
  await input.fill("Изменённый план встречи");
  await save.tap();
  await expect(page.getByText("Сохранение не подтверждено. Попробуй ещё раз.", { exact: true })).toBeVisible();
  await expect(input).toHaveValue("Изменённый план встречи");
  await save.tap();
  await expect.poll(() => attempts).toBe(2);
  await expect(save).toBeDisabled();
  await expect(save).toHaveAttribute("aria-busy", "true");
  await expect(input).toHaveAttribute("readonly", "");
  const box = (await save.boundingBox())!;
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await page.touchscreen.tap(box.x + box.width / 2, box.y + box.height / 2);
  await expect(input).toHaveValue("Изменённый план встречи");
  release();
  await expect(page.locator(".rbar")).toHaveCount(0);
  expect(attempts).toBe(2);
  expect(chat.sent).toHaveLength(0);
});

test("cancel edit and reply to a long message keep the send action reachable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const chat = await openChat(page, { messages: [editableMessage()] });
  await beginEdit(page);
  await page.getByRole("button", { name: "Отменить", exact: true }).tap();
  await expect(page.locator(".rbar")).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Сообщение", exact: true })).toHaveValue("");
  await page.locator("#m-message-100 .bb").tap();
  await page.getByRole("dialog", { name: "Меню сообщения", exact: true }).getByRole("button", { name: "Ответить", exact: true }).tap();
  await expect(page.getByRole("button", { name: "Отправить", exact: true })).toBeInViewport({ ratio: 1 });
  await page.getByRole("textbox", { name: "Сообщение", exact: true }).fill("Подтверждаю");
  await page.getByRole("button", { name: "Отправить", exact: true }).tap();
  await expect.poll(() => chat.sent).toEqual([{ content: "Подтверждаю", replyToId: "message-100" }]);
});

test("an image caption can be cleared without sending a separate message", async ({ page }) => {
  const chat = await openChat(page, { messages: [{ ...editableMessage(), imageUrl: "/brand/stickers/mosya_wave.webp" }] });
  let edited: unknown;
  await page.route("**/messages/message-100", async (route) => {
    edited = route.request().postDataJSON();
    await route.fulfill({ json: { status: "ok", editedAt: new Date().toISOString() } });
  });
  await beginEdit(page);
  await page.getByRole("textbox", { name: "Сообщение", exact: true }).fill("");
  const save = page.getByRole("button", { name: "Сохранить", exact: true });
  await expect(save).toBeEnabled();
  await save.tap();
  await expect(page.locator(".rbar")).toHaveCount(0);
  expect(edited).toEqual({ content: "" });
  expect(chat.sent).toHaveLength(0);
  await expect(page.locator("#m-message-100 .bb img")).toBeVisible();
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

test("a single tap on the empty area beside a sticker closes its menu", async ({ page }) => {
  const chat = await openChat(page, { empty: true });
  await chat.broadcast("message", { ...message(100), content: "[[sticker:mosya_sport]]", senderId: "other" });
  await page.locator("#m-message-100 .bb").tap();
  await expect(page.locator(".mpop")).toBeVisible();
  // This is inside the menu's layout column, but outside the actual message.
  const column = await page.locator(".mpopin").boundingBox();
  const sticker = await page.locator(".mpopmsg .bb").boundingBox();
  await page.touchscreen.tap(column!.x + column!.width - 8, sticker!.y + sticker!.height / 2);
  await expect(page.locator(".mpop")).toHaveCount(0);
});

test("sticker artwork is not clipped by the avatar's circular border", async ({ page }) => {
  const chat = await openChat(page, { empty: true });
  await chat.broadcast("message", { ...message(100), content: "[[sticker:mosya_sport]]" });
  const image = page.locator("#m-message-100 .bb img[alt='Стикер']");
  await expect(image).toBeVisible();
  await expect(image).toHaveCSS("border-radius", "0px");
});

test("all Mosya stickers have equal frames within incoming and outgoing bubbles", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 680 });
  await openChat(page, { messages: mosya.flatMap((slug, i) => [
    { ...message(i * 2), content: `[[sticker:${slug}]]`, senderId: "me" },
    { ...message(i * 2 + 1), content: `[[sticker:${slug}]]`, senderId: "other" },
  ]) });
  const frames = await page.locator(".msgs .sticker-art").evaluateAll((elements) => elements.map((el) => {
    const frame = el.getBoundingClientRect();
    const bubble = el.closest(".bb")!.getBoundingClientRect();
    const row = el.closest(".m")!.getBoundingClientRect();
    return { width: frame.width, height: frame.height, inside: frame.left >= bubble.left - 1 && frame.right <= bubble.right + 1 && frame.left >= row.left - 1 && frame.right <= row.right + 1, right: row.right };
  }));
  expect(frames).toHaveLength(mosya.length * 2);
  for (const frame of frames) {
    expect(frame.width).toBeCloseTo(184, 0);
    expect(frame.height).toBeCloseTo(144, 0);
    expect(frame.inside).toBe(true);
    expect(frame.right).toBeLessThanOrEqual(320);
  }
  await page.screenshot({ path: testInfo.outputPath("mosya-messages.png"), animations: "disabled" });
});

test("the picker fits narrow screens, scrolls through every sticker and sends once", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 640 });
  const chat = await openChat(page);
  await scrollTo(page, 1000);
  const before = await anchor(page);
  const input = page.getByRole("textbox", { name: "Сообщение", exact: true });
  await input.fill("Мой черновик");
  await page.getByRole("button", { name: "Стикеры", exact: true }).tap();
  const picker = page.getByRole("dialog", { name: "Стикеры", exact: true });
  await expect(picker).toBeVisible();
  await expect(input).not.toBeFocused();
  await expect(page.locator(".stkgrid button")).toHaveCount(mosya.length);
  for (const slug of mosya) {
    const frame = picker.locator(`[data-sticker="${slug}"]`);
    await frame.scrollIntoViewIfNeeded();
    await expect.poll(() => frame.locator("img").evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    const geometry = await frame.evaluate((el) => {
      const box = el.getBoundingClientRect();
      const button = el.closest("button")!.getBoundingClientRect();
      return { left: box.left, right: box.right, width: box.width, inside: box.left >= button.left && box.right <= button.right && box.top >= button.top && box.bottom <= button.bottom };
    });
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(320);
    expect(geometry.width).toBeLessThanOrEqual(68);
    expect(geometry.inside).toBe(true);
  }
  await picker.getByRole("button", { name: "Наше место", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("mosya-picker.png"), animations: "disabled" });
  await picker.getByRole("button", { name: "Наше место", exact: true }).tap();
  await expect(picker).toHaveCount(0);
  await expect.poll(() => chat.sent.length).toBe(1);
  expect(chat.sent[0]!.content).toBe("[[sticker:mosya_pin]]");
  await expect(input).toHaveValue("Мой черновик");
  await expect.poll(() => distanceFromBottom(page)).toBeLessThan(2);
  // Cancelling the next picker keeps a historical reading position intact.
  await scrollTo(page, 1000);
  await expect.poll(() => offset(page, before.id)).toBeCloseTo(before.offset, 0);
  await page.getByRole("button", { name: "Стикеры", exact: true }).tap();
  await page.getByRole("button", { name: "Закрыть: Стикеры", exact: true }).tap({ position: { x: 12, y: 80 } });
  await expect(picker).toHaveCount(0);
  await expect.poll(() => offset(page, before.id)).toBeCloseTo(before.offset, 0);
});

test("picker closes on the first background tap repeatedly and Escape dismisses it", async ({ page }) => {
  await openChat(page);
  const picker = page.getByRole("dialog", { name: "Стикеры", exact: true });
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "Стикеры", exact: true }).tap();
    await expect(picker).toBeVisible();
    await page.getByRole("button", { name: "Закрыть: Стикеры", exact: true }).tap({ position: { x: 10, y: 70 } });
    await expect(picker).toHaveCount(0);
    await expect(page.locator(".mpop")).toHaveCount(0);
  }
  await page.getByRole("button", { name: "Стикеры", exact: true }).tap();
  await expect(picker).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(picker).toHaveCount(0);
});

test("sticker reactions and replies work without reopening the dismissed menu", async ({ page }, testInfo) => {
  const chat = await openChat(page, { messages: [{ ...message(100), content: "[[sticker:mosya_sport]]", senderId: "other" }] });
  const bubble = page.locator("#m-message-100 .bb");
  await bubble.tap();
  const menu = page.getByRole("dialog", { name: "Меню сообщения", exact: true });
  await expect(menu).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("mosya-menu.png"), animations: "disabled" });
  await menu.getByRole("button", { name: "Реакция: Люблю", exact: true }).tap();
  await expect(menu).toHaveCount(0);
  await expect.poll(() => chat.reactions).toEqual(["mosya_love"]);
  await expect(bubble.locator(".mrc.on")).toHaveCount(1);
  await bubble.tap();
  await menu.getByRole("button", { name: "Ответить", exact: true }).tap();
  await expect(menu).toHaveCount(0);
  await expect(page.locator(".rbar")).toContainText("Стикер");
  await page.getByRole("button", { name: "Стикеры", exact: true }).tap();
  await page.getByRole("dialog", { name: "Стикеры", exact: true }).getByRole("button", { name: "Привет!", exact: true }).tap();
  await expect.poll(() => chat.sent.length).toBe(1);
  expect(chat.sent[0]).toMatchObject({ content: "[[sticker:mosya_wave]]", replyToId: "message-100" });
  await expect(page.locator("#m-sent-message .mq")).toContainText("Стикер");
  await expect(page.locator(".mpop")).toHaveCount(0);
});

test("message actions stay within a small viewport even for a long message", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 360 });
  await openChat(page, { messages: [{ ...message(100), content: "Длинное сообщение. ".repeat(100), senderId: "me", createdAt: new Date().toISOString() }] });
  const row = (await page.locator("#m-message-100 .bb").boundingBox())!;
  const list = (await page.locator(".msgs").boundingBox())!;
  await page.touchscreen.tap(row.x + 20, list.y + list.height / 2);
  const menu = page.getByRole("dialog", { name: "Меню сообщения", exact: true });
  await expect(menu).toBeVisible();
  const controls = await menu.locator(".rxrow, .mmenu").evaluateAll((elements) => elements.map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, top: r.top, bottom: r.bottom };
  }));
  for (const rect of controls) {
    expect(rect.left).toBeGreaterThanOrEqual(0);
    expect(rect.right).toBeLessThanOrEqual(320);
    expect(rect.top).toBeGreaterThanOrEqual(0);
    expect(rect.bottom).toBeLessThanOrEqual(360);
  }
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
});
