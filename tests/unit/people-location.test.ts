import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/people/route";
import { POST } from "@/app/api/me/location/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { approxDistanceM, freshPoint, personDistanceLabel } from "@/lib/geo/approx-distance";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ userId: "00000000-0000-4000-8000-000000000000" }) }));
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const point = { approx_lat: 55.75, approx_lon: 37.615, approx_location_at: new Date().toISOString(), show_distance: true };
beforeEach(() => { vi.clearAllMocks(); });

it("uses city discovery RPC and returns approximate distances without coordinates", async () => {
  const me = { ...point, id: id(0), city: "Тюмень" };
  const near = { ...point, id: id(1), name: "Близко", avatar_url: "/1.jpg", birth_date: "1995-01-01", approx_lat: 55.755 };
  const far = { ...near, id: id(2), name: "Дальше", approx_lat: 55.8 };
  const query = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    for (const method of ["select", "eq", "neq", "not", "order", "or"]) chain[method] = () => chain;
    chain.maybeSingle = () => Promise.resolve({ data, error: null });
    chain.then = (resolve: (v: unknown) => void) => Promise.resolve({ data, error: null }).then(resolve);
    return chain;
  };
  const rpc = vi.fn(() => query([near, far]));
  vi.mocked(createAdminClient).mockReturnValue({ from: (table: string) => query(table === "users" ? me : []), rpc } as unknown as ReturnType<typeof createAdminClient>);
  const response = await GET(new Request(`https://example.test/api/people?deck=1&start=${id(1)}`));
  const data = await response.json();
  expect(rpc).toHaveBeenCalledWith("discover_people", { p_viewer_id: id(0), p_city: "Тюмень", p_gender: null, p_start_id: id(1), p_offset: 0, p_limit: 41 });
  expect(data).toMatchObject({ meHasLocation: true, city: "Тюмень", radiusKm: null });
  expect(data.items.map((p: { id: string }) => p.id)).toEqual([id(1), id(2)]);
  expect(data.items[0].distanceM).toBe(600);
  expect(data.items[0]).not.toHaveProperty("approx_lat");
  expect(data.items[0]).not.toHaveProperty("approx_lon");
  expect(response.headers.get("cache-control")).toContain("no-store");
  expect(createAdminClient).toHaveBeenCalledWith({ noStore: true });
});

it("does not invent distances for missing, hidden, invalid or stale locations", () => {
  expect(approxDistanceM(point, { ...point, show_distance: false })).toBeNull();
  expect(approxDistanceM(point, {})).toBeNull();
  expect(freshPoint({ ...point, approx_location_at: "invalid" })).toBeNull();
  expect(freshPoint({ ...point, approx_location_at: new Date(Date.now() - 25 * 3600e3).toISOString() })).toBeNull();
  expect(personDistanceLabel(null)).toBeNull();
  expect(personDistanceLabel(0)).toBe("меньше 500 м");
  expect(personDistanceLabel(700)).toBe("≈ 700\u00a0м");
  expect(personDistanceLabel(2300)).toBe("≈ 2,3\u00a0км");
});

it.each([{ lat: null, lon: null }, { lat: "", lon: "" }, {}, { lat: 91, lon: 37 }])("rejects invalid coordinates instead of saving a fake location: %j", async (body) => {
  const response = await POST(new NextRequest("https://example.test/api/me/location", { method: "POST", body: JSON.stringify(body) }));
  expect(response.status).toBe(400);
  expect(createAdminClient).not.toHaveBeenCalled();
});

it.each([true, false])("rounds coordinates and reports whether saving really succeeded (failure: %s)", async (fails) => {
  const update = vi.fn(() => ({ eq: async () => ({ error: fails ? { message: "unavailable" } : null }) }));
  vi.mocked(createAdminClient).mockReturnValue({ from: () => ({ update }) } as unknown as ReturnType<typeof createAdminClient>);
  const response = await POST(new NextRequest("https://example.test/api/me/location", { method: "POST", body: JSON.stringify({ lat: 57.15123, lon: 65.53123 }) }));
  expect(response.status).toBe(fails ? 503 : 200);
  const saved = update.mock.calls[0] as unknown as [{ approx_lat: number; approx_lon: number }];
  expect(saved[0].approx_lat).toBeCloseTo(57.15, 5);
  expect(saved[0].approx_lon).toBeCloseTo(65.53, 5);
});
