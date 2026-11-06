import { test, type Page } from "@playwright/test";

/**
 * Скриншоты экранов-вкладок для согласования редизайна (не проверка, а
 * снимки). Запускается workflow «Redesign shots» с SHOTS_DIR; в обычный
 * прогон тестов не входит.
 */
const DIR = process.env.SHOTS_DIR;
test.skip(!DIR, "только для workflow Redesign shots");

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
      : path === "/api/categories" ? { categories: [{ slug: "coffee", name: "Кофе", emoji: null }], trainingTypes: [] }
      : path === "/api/subscriptions" ? { active: false }
      : { items: [], events: [], people: [], count: 0 };
    await route.fulfill({ json });
  });
}

for (const [name, url] of [["feed", "/feed"], ["map", "/map"], ["meet", "/my-events"], ["me", "/profile"]] as const) {
  test(`shot ${name}`, async ({ page }, info) => {
    await fixture(page);
    await page.goto(url);
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `${DIR}/${info.project.name}-${name}.png` });
  });
}
