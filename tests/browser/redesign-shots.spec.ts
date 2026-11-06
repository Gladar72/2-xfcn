import { test, type Page } from "@playwright/test";

/**
 * Скриншоты экранов-вкладок для согласования редизайна (не проверка, а
 * снимки). Запускается workflow «Redesign shots» с SHOTS_DIR; в обычный
 * прогон тестов не входит.
 */
const DIR = process.env.SHOTS_DIR;
test.skip(!DIR, "только для workflow Redesign shots");
// Как экран прототипа (iPhone 390×844), чтобы снимки можно было сравнивать один к одному.
test.use({ viewport: { width: 390, height: 844 } });

const photo = "/brand/covers/coffee.webp";
const person = {
  id: "other", name: "Алексей", age: 30, city: "Тюмень", avatarUrl: photo,
  photos: [photo, "/brand/covers/walk.webp"], bio: "Люблю прогулки и встречи с друзьями.",
  interests: [], commonInterests: [], ratingAvg: 5, ratingCount: 1,
  completedMeetingsCount: 4, eventsOrganizedCount: 2, eventsAttendedCount: 4,
};
const titles = ["Пробежка по набережной", "Кофе и разговоры", "Кино вечером", "Hyrox тренировка", "Прогулка по центру", "Настолки в баре"];
const meeting = (i: number) => ({
  id: `test-${i}`, title: titles[i % titles.length], city: "Тюмень",
  description: "Поговорим о планах, прогуляемся и выберем место для кофе.",
  eventDate: "2026-11-08", eventTime: "18:00:00", eventEndTime: "20:00:00",
  status: "published", costType: "free", isBusiness: i % 4 === 3, photoUrl: i % 2 ? "/brand/covers/walk.webp" : photo,
  category: { slug: "coffee", name: "Кофе", emoji: null }, trainingType: null,
  placeName: "Цветной бульвар", address: "ул. Республики, 1", latitude: 57.153 + i * 0.002, longitude: 65.534 + i * 0.002,
  seatsTotal: 6, seatsTaken: 2, organizer: person, participants: [], viewerStatus: "none", goingPreview: [],
});
const events = Array.from({ length: 8 }, (_, i) => meeting(i));

async function fixture(page: Page) {
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    const json = path === "/api/me" ? { userId: "me" }
      : path === "/api/me/profile" ? { ...person, id: "me", name: "Андрей" }
      : path.startsWith("/api/users/") ? person
      : path === "/api/me/pending-applications" ? { count: 2 }
      : path === "/api/events" || path === "/api/city-events" || path === "/api/me/events" ? { items: events, events }
      : /^\/api\/events\/test-\d+$/.test(path) ? events[0]
      : path === "/api/people" ? { items: [person, { ...person, id: "p2", name: "Марина", age: 27 }].map((p) => ({ ...p, interests: ["Кофе", "Бег"], sharedInterests: ["Кофе"], sharedCount: 1 })) }
      : path === "/api/conversations" ? { items: [{ conversationId: "c1", eventTitle: null, eventStatus: null, unreadCount: 1, otherUser: { id: "other", name: "Алексей", avatarUrl: photo }, lastMessage: { content: "Давай встретимся вечером", createdAt: "2026-11-06T12:00:00Z" } }] }
      : path === "/api/categories" ? {
          categories: [["coffee", "Попить кофе"], ["breakfast", "Совместный завтрак"], ["dinner", "Поужинать"], ["cinema", "Кино"], ["walk", "Прогулка"], ["party", "Вечеринка"], ["training", "Совместная тренировка"], ["active", "Активный отдых"], ["custom", "Своё предложение"]].map(([slug, name], i) => ({ id: `c${i}`, slug, name, emoji: null })),
          trainingTypes: [["running", "Бег"], ["padel", "Падел"], ["gym", "Зал"], ["hyrox", "HYROX"], ["football", "Футбол"], ["cycling", "Велосипед"], ["yoga", "Йога"]].map(([slug, name], i) => ({ id: `t${i}`, slug, name, emoji: null })),
        }
      : path === "/api/places" ? { items: [["Кофемания", "ул. Республики, 14", 4.9], ["Surf Coffee", "ул. Ленина, 2а", 4.8], ["Coffee Like", "ул. Мельникайте, 72", 4.7]].map(([name, address, rating]) => ({ name, address, rating, reviews: 120, latitude: 57.15, longitude: 65.53 })) }
      : path === "/api/subscriptions" ? { active: true, plan: "start", events: { used: 1, limit: 3 }, boosts: { used: 0, limit: 1 } }
      : { items: [], events: [], people: [], count: 0 };
    await route.fulfill({ json });
  });
}

const ROUTES = [
  ["feed", "/feed"], ["map", "/map"], ["meet", "/my-events"], ["me", "/profile"],
  ["people", "/people"], ["chats", "/chats"], ["notif", "/notifications"], ["search", "/search"],
  ["event", "/events/test-0"], ["create", "/create"], ["settings", "/settings"], ["plans", "/subscriptions"],
  ["biz", "/business"], ["ticket", "/events/test-0/ticket"], ["tickets", "/events/test-0/tickets"],
  ["requests", "/events/test-0/applications"], ["edit", "/profile/edit"], ["login", "/login"],
  ["onboarding", "/onboarding"], ["offer", "/legal/offer"],
] as const;
for (const [name, url] of ROUTES) {
  test(`shot ${name}`, async ({ page }, info) => {
    await fixture(page);
    await page.goto(url);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${DIR}/${info.project.name}-${name}.png` });
  });
}

// Мастер создания (встреча и бизнес-событие): снимок каждого шага.
for (const [name, url] of [["mk", "/create"], ["mkbiz", "/create?business=true"]] as const) {
  test(`shot ${name} steps`, async ({ page }, info) => {
    await fixture(page);
    await page.goto(url);
    await page.waitForTimeout(3000);
    for (let i = 0; i < 7; i++) {
      await page.screenshot({ path: `${DIR}/${info.project.name}-${name}${i}.png` });
      const kind = page.locator("section.scr:not(.ghost) button.k-opt3").filter({ hasText: name === "mk" ? "Открытая встреча" : "Событие для бизнеса" }).first();
      if (await kind.count()) {
        await kind.click({ timeout: 2000 }).catch(() => {});
        await page.waitForTimeout(1200);
        continue;
      }
      const opt = page.locator("section.scr:not(.ghost) .k-cats button.k-cat").first();
      if (await opt.count()) await opt.click({ timeout: 2000 }).catch(() => {});
      const title = page.locator("section.scr:not(.ghost) input[maxlength='100']").first();
      if (await title.count()) await title.fill("Тестовая встреча").catch(() => {});
      const place = page.locator("section.scr:not(.ghost) button.k-rp").first();
      if (await place.count()) await place.click({ timeout: 2000 }).catch(() => {});
      const about = page.locator("section.scr:not(.ghost) textarea").first();
      if (await about.count()) await about.fill("Пьём кофе и знакомимся, всех ждём").catch(() => {});
      const next = page.getByRole("button", { name: /Далее|Дальше|Продолжить/ }).last();
      if (!(await next.count())) break;
      await next.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(1200);
    }
  });
}
