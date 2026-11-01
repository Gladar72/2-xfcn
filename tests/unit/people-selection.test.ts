import { beforeEach, expect, it, vi } from "vitest";
import { GET } from "@/app/api/people/route";
import { createAdminClient } from "@/lib/supabase/admin";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000000" }) }));
const person = (n: number) => ({ id: id(n), name: `Person ${n}`, city: "Тюмень", gender: "female", avatar_url: `/photo-${n}.jpg`, birth_date: "1995-01-01" });
function database(count = 41, fails = false) {
  const rpc = vi.fn(() => ({ select: async () => ({ data: Array.from({ length: count }, (_, i) => person(i + 1)), error: fails ? {} : null }) }));
  const from = vi.fn((table: string) => ({ select: () => ({ eq: () => table === "users"
    ? { maybeSingle: async () => ({ data: person(0), error: null }) }
    : Promise.resolve({ data: [], error: null }) }) }));
  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as unknown as ReturnType<typeof createAdminClient>);
  return { rpc, from };
}
async function deck(params = "") { return GET(new Request(`https://example.test/api/people?deck=1${params}`)); }
beforeEach(() => { vi.clearAllMocks(); });

it("uses the selected city and gender for every page, independently of location or registration count", async () => {
  const { rpc, from } = database();
  const response = await deck(`&city=Москва&gender=female&offset=40&start=${id(55)}`);
  const data = await response.json();
  expect(rpc).toHaveBeenCalledWith("filter_people", { p_viewer_id: id(0), p_city: "Москва", p_gender: "female", p_start_id: id(55), p_offset: 40, p_limit: 41, p_age_min: 18, p_age_max: null, p_interest_ids: [], p_shuffle_seed: null });
  expect(data).toMatchObject({ city: "Москва", scope: "city", radiusKm: null, nextOffset: 80, meHasLocation: false });
  expect(data.items).toHaveLength(40);
  expect(data.items[0]).toMatchObject({ distanceM: null, distanceKm: null });
  expect(from.mock.calls.filter(([table]) => table === "users")).toHaveLength(1);
});

it("defaults to the profile city and includes profiles without coordinates", async () => {
  const { rpc } = database(3);
  const data = await (await deck()).json();
  expect(rpc).toHaveBeenCalledWith("filter_people", expect.objectContaining({ p_city: "Тюмень", p_gender: null }));
  expect(data.nextOffset).toBeNull();
  expect(data.items).toHaveLength(3);
});

it("limits the home preview to 12 while retaining the selected city", async () => {
  const { rpc } = database(13);
  const data = await (await GET(new Request("https://example.test/api/people?city=Тюмень"))).json();
  expect(data.items).toHaveLength(12);
  expect(rpc).toHaveBeenCalledWith("filter_people", expect.objectContaining({ p_city: "Тюмень", p_limit: 13 }));
  expect(data.nextOffset).toBeNull();
});

it("passes age and OR-interest filters to the database before pagination", async () => {
  const { rpc } = database();
  await deck(`&ageMin=25&ageMax=35&interests=${id(88)},${id(89)}&offset=40`);
  expect(rpc).toHaveBeenCalledWith("filter_people", expect.objectContaining({ p_age_min: 25, p_age_max: 35, p_interest_ids: [id(88),id(89)], p_offset: 40, p_shuffle_seed: null }));
});

it("uses a stable home seed within a visit, a new sample on reload, and never shuffles the deck", async () => {
  const { rpc } = database(3);
  await GET(new Request(`https://example.test/api/people?seed=${id(99)}`));
  expect(rpc).toHaveBeenLastCalledWith("filter_people", expect.objectContaining({ p_shuffle_seed: id(99) }));
  await GET(new Request("https://example.test/api/people"));
  const first = (rpc.mock.calls.at(-1) as unknown as [string, { p_shuffle_seed: string }])[1].p_shuffle_seed;
  await GET(new Request("https://example.test/api/people"));
  const second = (rpc.mock.calls.at(-1) as unknown as [string, { p_shuffle_seed: string }])[1].p_shuffle_seed;
  expect(first).not.toBe(second);
  await deck(`&seed=${id(99)}&ageMin=65`);
  expect(rpc).toHaveBeenLastCalledWith("filter_people", expect.objectContaining({ p_age_min: 65, p_age_max: null, p_shuffle_seed: null }));
});

it.each(["&gender=invalid", "&offset=-1", "&offset=1.5", "&city=", `&city=${"a".repeat(121)}`, "&ageMin=17", "&ageMin=66", "&ageMax=66", "&ageMin=40&ageMax=30", "&ageMax=", "&ageMin=2.5", "&interests=invalid", "&interests=", "&seed=invalid"]) ("rejects invalid filters: %s", async (params) => {
  expect((await deck(params)).status).toBe(400);
  expect(createAdminClient).not.toHaveBeenCalled();
});

it("rejects malformed selections before issuing database queries", async () => {
  expect((await deck("&start=invalid")).status).toBe(404);
  expect(createAdminClient).not.toHaveBeenCalled();
});

it("reports database failure instead of an empty city", async () => {
  database(0, true);
  expect((await deck()).status).toBe(503);
});
