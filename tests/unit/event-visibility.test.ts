import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mock = vi.hoisted(() => ({ admin: vi.fn(), user: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mock.admin }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: mock.user }));
vi.mock("@/lib/promotions/server", () => ({ activePromotions: async () => [], promotedOrder: () => [] }));
vi.mock("@/lib/telegram/bot", () => ({ getBot: () => ({ api: {} }) }));
import { GET as feed } from "@/app/api/events/route";
import { GET as mine } from "@/app/api/me/events/route";
import { clearFeedCache } from "@/lib/data/feed-cache";

const personal = { id: "personal", title: "Пробежка", is_business: false, city: "Тюмень", event_date: "2099-01-01", event_time: "18:00:00", event_end_time: "20:00:00", seats_total: 4, seats_taken: 0, created_at: "2026-11-01T00:00:00Z", organizer: { id: "host", name: "Андрей", birth_date: "1995-01-01" }, category: { slug: "training", name: "Тренировка" } };
function db(rows: Record<string, unknown>[], options: { memberError?: boolean; appError?: boolean; ownedError?: boolean; owner?: boolean; accepted?: boolean } = {}) {
  const calls: { table: string; op: string; args: unknown[] }[] = [];
  const from = (table: string) => {
    let fields = ""; const filters: [string, unknown][] = []; let limit = Infinity;
    const chain: any = {};
    for (const op of ["select", "eq", "or", "in", "gte", "gt", "order", "limit"]) chain[op] = (...args: unknown[]) => {
      calls.push({ table, op, args });
      if (op === "select") fields = String(args[0]);
      if (op === "or" && args[0] === "is_business.eq.false,is_business.is.null") filters.push(["is_business", false]);
      if (op === "eq") filters.push([String(args[0]), args[1]]);
      if (op === "limit") limit = Number(args[0]);
      return chain;
    };
    chain.then = (resolve: (value: unknown) => unknown) => {
      let data: unknown = []; let error: unknown = null;
      if (table === "events") {
        if (fields === "id") { data = options.owner ? [{ id: "personal" }] : []; error = options.ownedError ? {} : null; }
        else data = rows.filter(row => filters.every(([key, value]) => key !== "is_business" || Boolean(row[key]) === value)).slice(0, limit);
      }
      if (table === "event_members") error = options.memberError ? {} : null;
      if (table === "applications") { data = options.accepted ? [{ event_id: "personal", status: "accepted" }] : []; error = options.appError ? {} : null; }
      return Promise.resolve({ data, error }).then(resolve);
    };
    return chain;
  };
  mock.admin.mockReturnValue({ from });
  return calls;
}
beforeEach(() => { vi.clearAllMocks(); clearFeedCache(); mock.user.mockResolvedValue(null); });
afterEach(() => { vi.useRealTimers(); });

it("personal meetings cannot be crowded out by businesses before pagination", async () => {
  const calls = db([...Array.from({ length: 30 }, (_, i) => ({ ...personal, id: `biz-${i}`, is_business: true })), personal]);
  const data = await (await feed(new NextRequest("https://mesto.test/api/events?city=Тюмень&business=false"))).json();
  expect(data.items.map((e: { id: string }) => e.id)).toEqual(["personal"]);
  expect(calls).toContainEqual({ table: "events", op: "or", args: ["is_business.eq.false,is_business.is.null"] });
  expect(mock.admin).toHaveBeenCalledWith({ noStore: true });
});
it("the unified feed and the business feed retain their distinct filters and cache entries", async () => {
  db([personal, { ...personal, id: "business", is_business: true }]);
  for (const [filter, expected] of [["&business=false", ["personal"]], ["&business=true", ["business"]], ["", ["personal", "business"]]] as const) {
    const data = await (await feed(new NextRequest(`https://mesto.test/api/events?city=Тюмень${filter}`))).json();
    expect(data.items.map((e: { id: string }) => e.id).sort()).toEqual([...expected].sort());
  }
});
it("overnight events remain candidates after UTC midnight and expired ones disappear", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T00:05:00Z"));
  const calls = db([{ ...personal, id: "overnight", event_date: "2026-11-11", event_time: "23:00:00", event_end_time: "07:00:00" }, { ...personal, id: "ended", event_date: "2026-11-11", event_time: "18:00:00", event_end_time: "20:00:00" }]);
  const data = await (await feed(new NextRequest("https://mesto.test/api/events?city=Тюмень"))).json();
  expect(data.items.map((e: { id: string }) => e.id)).toEqual(["overnight"]);
  expect(calls).toContainEqual({ table: "events", op: "gte", args: ["event_date", "2026-11-11"] });
});
it("my events does not report an empty account when any membership lookup fails", async () => {
  mock.user.mockResolvedValue({ userId: "me" });
  for (const options of [{ memberError: true }, { appError: true }, { ownedError: true }]) {
    db([], options);
    expect((await mine(new NextRequest("https://mesto.test/api/me/events"))).status).toBe(503);
  }
});
it("owned events stay discoverable even when their separate organizer membership is missing", async () => {
  mock.user.mockResolvedValue({ userId: "me" }); db([personal], { owner: true });
  const result = await (await mine(new NextRequest("https://mesto.test/api/me/events"))).json();
  expect(result.items).toEqual([expect.objectContaining({ id: "personal", role: "organizer", myStatus: "member" })]);
});
it("accepted applications keep participant meetings discoverable when membership is missing", async () => {
  mock.user.mockResolvedValue({ userId: "me" }); db([personal], { accepted: true });
  const result = await (await mine(new NextRequest("https://mesto.test/api/me/events"))).json();
  expect(result.items).toEqual([expect.objectContaining({ id: "personal", role: "participant", myStatus: "member" })]);
});

it("legacy personal events with a null business flag are still visible", async () => {
  db([{ ...personal, is_business: null }]);
  const data = await (await feed(new NextRequest("https://mesto.test/api/events?city=Тюмень&business=false"))).json();
  expect(data.items.map((e: { id: string }) => e.id)).toEqual(["personal"]);
});
