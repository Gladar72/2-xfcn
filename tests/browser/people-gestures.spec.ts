import { expect, test, type Page } from "@playwright/test";

const photos = ["/brand/covers/coffee.webp", "/brand/covers/walk.webp", "/brand/covers/dinner.webp"];
const people = Array.from({ length: 5 }, (_, i) => ({
  id: `gesture-${i}`, name: `Анкета ${i}`, age: 30, city: "Тюмень", avatarUrl: photos[0], photos,
  bio: "Прогулки, путешествия и встречи с друзьями. ".repeat(60), interests: [], sharedInterests: [],
  commonInterests: [], ratingAvg: 5, completedMeetingsCount: 1,
}));
const active = (page: Page) => page.locator('section[data-id="person"]:not(.ghost)');
const body = (page: Page) => active(page).locator('.body');

async function setup(page: Page) {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.addInitScript(() => {
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["deck", "person", "feed"] }));
    localStorage.setItem("mesto_heart_tip", "1");
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.route('**/api/**', r => {
    const path = new URL(r.request().url()).pathname;
    const json = path === '/api/people' ? { items: people, city: 'Тюмень', nextOffset: null }
      : path.startsWith('/api/users/') ? people.find(p => path.endsWith(p.id))
      : path === '/api/me/profile' ? { city: 'Тюмень' }
      : path === '/api/categories' ? { categories: [], trainingTypes: [] }
      : { items: [], events: [], people: [] };
    return r.fulfill({ json });
  });
}
async function start(page: Page, x = 80, y = 250) {
  await body(page).dispatchEvent('touchstart', { touches: [{ identifier: 0, clientX: x, clientY: y }] });
}
async function move(page: Page, x: number, y = 250) {
  await body(page).dispatchEvent('touchmove', { touches: [{ identifier: 0, clientX: x, clientY: y }], cancelable: true });
}
async function end(page: Page, x: number, y = 250) {
  await body(page).dispatchEvent('touchend', { touches: [], changedTouches: [{ identifier: 0, clientX: x, clientY: y }] });
}
const translateX = (page: Page) => active(page).evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m41);

test('cancelled horizontal drag returns to rest and the next gesture changes only one person', async ({ page }) => {
  await setup(page); await page.goto('/people?city=Тюмень');
  await expect(active(page).locator('h1')).toHaveText('Анкета 0, 30');
  await page.waitForTimeout(450);
  await start(page); await move(page, 150);
  await expect.poll(() => translateX(page)).toBeGreaterThan(40);
  await body(page).dispatchEvent('touchcancel', { touches: [], changedTouches: [] });
  await expect.poll(() => translateX(page)).toBeCloseTo(0, 0);
  await start(page); await move(page, 290); await end(page, 290);
  await expect(active(page).locator('h1')).toHaveText('Анкета 1, 30');
  await page.waitForTimeout(500);
  await expect(active(page).locator('h1')).toHaveText('Анкета 1, 30');
  await expect(page.locator('section.scr.ghost')).toHaveCount(0);
});

test('reversing direction immediately after a swipe follows the finger instead of the entry animation', async ({ page }) => {
  await setup(page); await page.goto('/people?city=Тюмень');
  await expect(active(page).locator('h1')).toHaveText('Анкета 0, 30');
  await start(page); await move(page, 290); await end(page, 290);
  await expect(active(page).locator('h1')).toHaveText('Анкета 1, 30');
  await start(page, 280); await move(page, 220);
  await expect.poll(() => translateX(page), { timeout: 250 }).toBeCloseTo(-60, 0);
  await move(page, 70); await end(page, 70);
  await expect(active(page).locator('h1')).toHaveText('Анкета 2, 30');
  await expect(active(page)).toHaveCount(1);
  await expect(page.locator('section.scr.ghost')).toHaveCount(0);
});

test('a photo swipe followed by its compatibility click advances one photo, and the next tap still works', async ({ page }) => {
  await setup(page); await page.goto('/people/gesture-0');
  await expect(active(page).locator('h1')).toHaveText('Анкета 0, 30');
  await start(page, 280); await move(page, 180); await end(page, 180);
  // Some WebViews emit this click after touchend; it must not repeat the action.
  await body(page).dispatchEvent('click', { clientX: 300, clientY: 250, detail: 1 });
  await expect(active(page).locator('.gal > img.on')).toHaveAttribute('src', photos[1]!);
  await body(page).tap({ position: { x: 300, y: 200 } });
  await expect(active(page).locator('.gal > img.on')).toHaveAttribute('src', photos[2]!);
});

test('vertical native scrolling and a reverse drag leave the deck and outer page stationary', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'Native touch input uses Chromium CDP');
  await setup(page); await page.goto('/people?city=Тюмень');
  await expect(active(page).locator('h1')).toHaveText('Анкета 0, 30');
  const client = await page.context().newCDPSession(page);
  const drag = async (from: number, to: number) => {
    await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 180, y: from, id: 0 }] });
    for (let i = 1; i <= 12; i++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 180, y: from + (to - from) * i / 12, id: 0 }] });
      await page.waitForTimeout(20);
    }
    await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(350);
  };
  await drag(600, 180);
  await expect.poll(() => body(page).evaluate(el => el.scrollTop)).toBeGreaterThan(150);
  const before = await body(page).evaluate(el => el.scrollTop);
  await drag(180, 500);
  await expect.poll(() => body(page).evaluate(el => el.scrollTop)).toBeLessThan(before);
  await expect(active(page).locator('h1')).toHaveText('Анкета 0, 30');
  expect(await page.evaluate(() => [window.scrollX, window.scrollY])).toEqual([0, 0]);
  expect(await page.locator('.P').evaluate(el => [el.scrollLeft, el.scrollTop])).toEqual([0, 0]);
});

test('back navigation retains the outgoing profile scroll and another navigation clears its old layer', async ({ page }) => {
  await setup(page); await page.goto('/people/gesture-0');
  await expect(active(page).locator('h1')).toHaveText('Анкета 0, 30');
  await body(page).evaluate(el => { el.scrollTop = 350; });
  await page.waitForTimeout(50);
  await page.evaluate(() => {
    const observed = window as unknown as { outgoingScroll: number[] };
    observed.outgoingScroll = [];
    new MutationObserver(() => {
      const old = document.querySelector<HTMLElement>('section.scr.ghost .body');
      if (old) observed.outgoingScroll.push(old.scrollTop);
    }).observe(document.body, { childList: true, subtree: true });
  });
  await active(page).getByRole('button', { name: 'Назад', exact: true }).tap();
  await expect(page.locator('.pcard').first()).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { outgoingScroll: number[] }).outgoingScroll)).toContain(350);
  await page.locator('.pcard').first().tap();
  await expect(active(page).locator('h1')).toHaveText('Анкета 0, 30');
  await expect(page.locator('section.scr.ghost')).toHaveCount(0);
});
