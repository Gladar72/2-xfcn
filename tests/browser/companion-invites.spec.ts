import { expect, test, type Page } from "@playwright/test";

const person = { id: "00000000-0000-4000-8000-000000000001", name: "Анна", age: 28, avatarUrl: "/brand/covers/coffee.webp", photos: ["/brand/covers/coffee.webp"], bio: "Люблю кофе", interests: [], ratingAvg: 5, completedMeetingsCount: 2 };
const base = { eventDate: "2099-01-20", eventTime: "18:00:00", photoUrl: "/brand/covers/coffee.webp", category: { slug: "custom", name: "Событие" }, status: "published" };
const own = { ...base, id: "own", title: "Моя тренировка", role: "organizer", myStatus: "member" };
const going = { ...base, id: "going", title: "Уже иду в кино", role: "participant", myStatus: "member" };
const business = { ...base, id: "business", title: "Вечеринка FORMA", isBusiness: true };
const more = { ...base, id: "more", title: "Выставка", isBusiness: true };
const detail = { ...business, description: "Музыка и танцы", seatsTaken: 1, seatsTotal: 20, viewerStatus: "none", participants: [], organizer: { id: "host", name: "FORMA" }, costType: "free", businessPricingType: "free", companionInvites: [{ id: "companion", message: "Давай сходим", inviter: { id: "sender", name: "Андрей" } }] };

async function fixture(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem("mesto_home_ask", "added");
    localStorage.setItem("mesto_guide_v1", JSON.stringify({ active: false, seen: ["feed", "person", "event"] }));
    Object.defineProperty(navigator, "permissions", { configurable: true, value: { query: async () => ({ state: "denied" }) } });
  });
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, () => {});
  await page.route("**/api/**", r => {
    const url = new URL(r.request().url());
    const json = url.pathname === "/api/me/profile" ? { id: "me", city: "Тюмень", avatarUrl: person.avatarUrl }
      : url.pathname === `/api/users/${person.id}` ? person
      : url.pathname === "/api/me/events" ? { items: [own, going] }
      : url.pathname === "/api/events/business" ? detail
      : url.pathname === "/api/events" ? { items: url.searchParams.get("page") === "1" ? [business, more] : [own, business], hasMore: url.searchParams.get("page") !== "1" }
      : { items: [], categories: [], trainingTypes: [], count: 0 };
    return r.fulfill({ json });
  });
}
async function openPicker(page: Page) {
  await page.goto(`/people/${person.id}?invite=1`);
  return page.getByRole("dialog", { name: "Приглашение на встречу", exact: true });
}

test("one list prioritizes own and attending events, includes business and paginates without duplicates", async ({ page }) => {
  await fixture(page);
  const sheet = await openPicker(page);
  const list = sheet.getByRole("group", { name: "Выбери событие" });
  await expect(list.locator(".opt b")).toHaveText([own.title, going.title, business.title]);
  await expect(list.getByRole("button", { name: /Моя тренировка/ })).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByRole("tab")).toHaveCount(0);
  await list.getByRole("button", { name: "Показать ещё" }).click();
  await expect(list.locator(".opt b")).toHaveText([own.title, going.title, business.title, more.title]);
  await list.getByRole("button", { name: /Вечеринка FORMA/ }).click();
  await expect(sheet.getByText("Предложишь пойти вместе.", { exact: false })).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Отправить приглашение" })).toBeInViewport();
  await page.screenshot({ path: test.info().outputPath("unified-invitations.png") });
});

test("sends the selected business event and message once during a slow request", async ({ page }) => {
  await fixture(page);
  const requests: unknown[] = [];
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  await page.route("**/api/conversations/direct", async r => { requests.push(r.request().postDataJSON()); await gate; await r.fulfill({ json: { conversationId: "direct-chat" } }).catch(() => {}); });
  try {
    const sheet = await openPicker(page);
    await sheet.getByRole("button", { name: /Вечеринка FORMA/ }).click();
    await sheet.getByPlaceholder("Пару слов от тебя (необязательно)").fill("Давай вместе!");
    await sheet.getByRole("button", { name: "Отправить приглашение" }).click();
    await expect(sheet.getByRole("button", { name: "Отправляем…" })).toBeDisabled();
    expect(requests).toEqual([{ userId: person.id, eventId: business.id, message: "Давай вместе!" }]);
    release();
    await expect(sheet).not.toBeVisible();
  } finally { release(); }
});

test("create meeting preserves the selected person", async ({ page }) => {
  await fixture(page);
  const sheet = await openPicker(page);
  await sheet.getByRole("button", { name: /Создать свою встречу/ }).click();
  await expect(page).toHaveURL(new RegExp(`/create\\?invite=${person.id}&inviteName=`));
  expect(new URL(page.url()).searchParams.get("inviteName")).toBe(person.name);
});

test("failed loading has a retry and never pretends there are no events", async ({ page }) => {
  await fixture(page);
  let failed = true;
  await page.route("**/api/me/events?**", r => r.fulfill(failed ? { status: 503, json: { error: "unavailable" } } : { json: { items: [own] } }));
  const sheet = await openPicker(page);
  await expect(sheet.getByRole("alert")).toContainText("Не удалось загрузить события");
  await expect(sheet.getByRole("button", { name: "Отправить приглашение" })).toBeDisabled();
  failed = false;
  await sheet.getByRole("button", { name: "Попробовать ещё раз" }).click();
  await expect(sheet.getByRole("button", { name: /Моя тренировка/ })).toHaveAttribute("aria-pressed", "true");
});

test("a failed send keeps the selected event and note for retry", async ({ page }) => {
  await fixture(page);
  await page.route("**/api/conversations/direct", r => r.fulfill({ status: 503, json: { error: "unavailable" } }));
  const sheet = await openPicker(page);
  const choice = sheet.getByRole("button", { name: /Вечеринка FORMA/ });
  await choice.click();
  await sheet.getByPlaceholder("Пару слов от тебя (необязательно)").fill("Пойдём?");
  await sheet.getByRole("button", { name: "Отправить приглашение" }).click();
  await expect(sheet.getByRole("button", { name: "Отправить приглашение" })).toBeEnabled();
  await expect(choice).toHaveAttribute("aria-pressed", "true");
  await expect(sheet.getByPlaceholder("Пару слов от тебя (необязательно)")).toHaveValue("Пойдём?");
});

test("accepting a companion offer opens chat access without automatically applying to the event", async ({ page }) => {
  await fixture(page);
  const writes: string[] = [];
  let accepted = false;
  page.on("request", r => { if (r.method() === "POST") writes.push(new URL(r.url()).pathname); });
  await page.route("**/api/invites/companion", r => { accepted = true; return r.fulfill({ json: { status: "accepted", message: "Договорились пойти вместе", conversationId: "direct-chat" } }); });
  await page.route("**/api/events/business", r => r.fulfill({ json: { ...detail, companionInvites: accepted ? [] : detail.companionInvites } }));
  await page.goto("/events/business");
  await expect(page.getByText("Андрей предлагает пойти вместе", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Пойдём вместе", exact: true }).click();
  await expect(page.getByRole("link", { name: "Обсудить в чате" })).toHaveAttribute("href", "/chats/direct-chat");
  expect(writes.filter(path => path.startsWith("/api/invites/") || path.includes("applications"))).toEqual(["/api/invites/companion"]);
  await expect(page.getByText("Вы договорились пойти вместе", { exact: true })).toBeVisible();
});
