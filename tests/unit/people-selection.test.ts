import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/people/route";
import { createAdminClient } from "@/lib/supabase/admin";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000000" }) }));
type Row = Record<string, unknown>;
const person = (n: number): Row => ({ id: id(n), name: `Person ${n}`, city: "Тюмень", avatar_url: `/photo-${n}.jpg`, birth_date: "1995-01-01", is_profile_hidden: false, moderation_status: "active" });

// In-memory rows exercise the actual route's selection, limits and privacy filters.
class Query {
  constructor(private rows: Row[]) {}
  select() { return this; }
  eq(key: string, value: unknown) { this.rows = this.rows.filter((r) => r[key] === value); return this; }
  neq(key: string, value: unknown) { this.rows = this.rows.filter((r) => r[key] !== value); return this; }
  not(key: string, _operator: string, value: unknown) { return this.neq(key, value); }
  or() { return this; }
  order() { return this; }
  limit(n: number) { this.rows = this.rows.slice(0, n); return this; }
  maybeSingle() { return Promise.resolve({ data: this.rows[0] ?? null, error: null }); }
  then(resolve: (result: { data: Row[]; error: null }) => unknown) { return Promise.resolve({ data: this.rows, error: null }).then(resolve); }
}
function database(selected: Row = person(100), blocks: Row[] = []) {
  const users = [person(0), ...Array.from({ length: 60 }, (_, i) => person(i + 1)), selected];
  const from = vi.fn((table: string) => new Query(table === "users" ? users : table === "blocks" ? blocks : []));
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
}
async function deck(start?: string) {
  return (await GET(new Request(`https://example.test/api/people?deck=1${start ? `&start=${start}` : ""}`))).json();
}
beforeEach(() => { vi.clearAllMocks(); });

it("keeps the selected person even outside the refreshed candidate pool", async () => {
  database();
  const result = await deck(id(100));
  expect(result.items).toHaveLength(40);
  expect(result.items[0]).toMatchObject({ id: id(100), name: "Person 100", avatarUrl: "/photo-100.jpg" });
  expect(new Set(result.items.map((p: { id: string }) => p.id)).size).toBe(40);
});

it("retains a selected person beyond the deck limit without duplicating existing selections", async () => {
  database();
  expect((await deck(id(55))).items[0].id).toBe(id(55));
  const result = await deck(id(5));
  expect(result.items[4].id).toBe(id(5));
  expect(result.items.filter((p: { id: string }) => p.id === id(5))).toHaveLength(1);
  expect((await deck()).items[0].id).toBe(id(1));
});

it.each([
  { is_profile_hidden: true }, { moderation_status: "banned" }, { city: "Москва" },
  { avatar_url: null }, { avatar_url: "   " },
])("does not reveal an unavailable selected profile: %j", async (override) => {
  database({ ...person(100), ...override });
  expect((await deck(id(100))).items.some((p: { id: string }) => p.id === id(100))).toBe(false);
});

it.each([true, false])("respects blocks in either direction (blocked by me: %s)", async (byMe) => {
  database(person(100), [{ blocker_id: id(byMe ? 0 : 100), blocked_id: id(byMe ? 100 : 0) }]);
  expect((await deck(id(100))).items.some((p: { id: string }) => p.id === id(100))).toBe(false);
});

it("rejects malformed selections before issuing database queries", async () => {
  const response = await GET(new Request("https://example.test/api/people?deck=1&start=invalid"));
  expect(response.status).toBe(404);
  expect(createAdminClient).not.toHaveBeenCalled();
});
