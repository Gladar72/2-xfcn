import { expect, test, type Page } from "@playwright/test";

const launch = "#tgWebAppVersion=8.0&tgWebAppPlatform=ios&tgWebAppData=" +
  encodeURIComponent("query_id=entry-fixture&hash=browser-test-only");

async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["feed"] }));
    const bridge = window as unknown as {
      telegramCalls: { event: string; data: string }[];
      TelegramWebviewProxy: { postEvent: (event: string, data: string) => void };
    };
    bridge.telegramCalls = [];
    bridge.TelegramWebviewProxy = {
      postEvent(event, data) { bridge.telegramCalls.push({ event, data }); },
    };
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", r => {
    const path = new URL(r.request().url()).pathname;
    return r.fulfill({ json: path === "/api/me/profile" ? { id: "me", name: "Андрей", city: "Тюмень" }
      : path === "/api/categories" ? { categories: [], trainingTypes: [] }
        : { items: [], events: [], count: 0 } });
  });
}

for (const result of ["authenticated", "needs_registration"]) {
  test(`first launch enters ${result} without a second document or a splash timer`, async ({ page }) => {
    await fixture(page);
    await page.clock.install();
    let release = () => {};
    const gate = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/auth", async r => {
      await gate;
      await r.fulfill({ json: { status: result } }).catch(() => {});
    });
    try {
      await page.goto(`/app${launch}`);
      await expect(page.getByRole("status", { name: "Загрузка", exact: true })).toBeVisible();
      await page.evaluate(() => { (window as unknown as { entryDocument: boolean }).entryDocument = true; });
      // Successful auth must navigate even when animation timers are paused.
      await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
      const destination = result === "authenticated" ? "/feed" : "/onboarding";
      const navigation = page.waitForRequest(r => new URL(r.url()).pathname === destination);
      release();
      await navigation;
      await page.clock.resume();
      await expect(page).toHaveURL(result === "authenticated" ? /\/feed$/ : /\/onboarding$/, { timeout: 20_000 });
      expect(await page.evaluate(() => (window as unknown as { entryDocument?: boolean }).entryDocument)).toBe(true);
    } finally { release(); }
  });
}

test("one retry recovers a failed launch and retains the requested destination", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/auth", r => r.fulfill(failed
    ? { status: 503, json: { error: "unavailable" } }
    : { json: { status: "authenticated" } }));
  await page.goto(`/app?goto=create${launch}`);
  await expect(page.getByRole("button", { name: "Попробовать снова", exact: true })).toBeVisible();
  failed = false;
  await page.getByRole("button", { name: "Попробовать снова", exact: true }).tap();
  await expect(page).toHaveURL(/\/create$/, { timeout: 20_000 });
});

test("closing is configured without confirmation and the app close button sends one request", async ({ page }) => {
  await fixture(page);
  await page.goto(`/settings${launch}`);
  await expect.poll(() => page.evaluate(() => {
    const calls = (window as unknown as { telegramCalls: { event: string; data: string }[] }).telegramCalls;
    return calls.some(c => c.event === "web_app_setup_closing_behavior" && JSON.parse(c.data).need_confirmation === false);
  })).toBe(true);
  await page.getByRole("button", { name: "Закрыть приложение", exact: true }).tap();
  const requests = await page.evaluate(() =>
    (window as unknown as { telegramCalls: { event: string }[] }).telegramCalls.filter(c => c.event === "web_app_close").length);
  expect(requests).toBe(1);
});

test("reopening with fresh launch data authenticates on the first attempt", async ({ page }) => {
  await fixture(page);
  const received: string[] = [];
  await page.route("**/api/auth", r => {
    received.push(r.request().postDataJSON().initData);
    return r.fulfill({ json: { status: "authenticated" } });
  });
  for (const query of ["first", "second"]) {
    await page.goto(`/app${launch.replace("entry-fixture", query)}`);
    await expect(page).toHaveURL(/\/feed$/, { timeout: 20_000 });
  }
  expect(received).toEqual([
    "query_id=first&hash=browser-test-only",
    "query_id=second&hash=browser-test-only",
  ]);
});
