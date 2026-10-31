import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/events/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { incrementEventsCreated } from "@/lib/subscriptions/server";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ userId: "legacy-user", telegramId: 1 }) }));
vi.mock("@/lib/admin/is-admin", () => ({ isAdminTelegramId: () => true }));
vi.mock("@/lib/subscriptions/server", () => ({ getActiveSubscriptionInfo: vi.fn().mockResolvedValue(null), incrementEventsCreated: vi.fn() }));
vi.mock("@/lib/telegram/notify", () => ({ notifyTelegram: vi.fn() }));

function database(avatar: string | null, error: unknown = null) {
  const from = vi.fn((table: string) => {
    const chain = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    chain.select.mockReturnValue(chain);
    chain.eq.mockReturnValue(chain);
    chain.maybeSingle.mockResolvedValue(table === "users" ? { data: { city: "Тюмень", avatar_url: avatar }, error } : { data: null });
    return chain;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  return from;
}

async function create(overrides: Record<string, unknown> = {}) {
  return POST(new NextRequest("https://example.test/api/events", {
    method: "POST",
    body: JSON.stringify({ categorySlug: "coffee", title: "Кофе и прогулка", description: "Знакомимся и гуляем после кофе", placeName: "Кофейня", latitude: 57.15, longitude: 65.54, eventDate: "2099-11-02", eventTime: "18:00", seatsTotal: 3, photoBase64: "/brand/covers/coffee.webp", ...overrides }),
  }));
}

beforeEach(() => { vi.clearAllMocks(); });

describe("legacy organizer photo at event creation", () => {
  it.each([null, "", "   "])("blocks an open event without a stored avatar (%s), even for an admin", async (avatar) => {
    const from = database(avatar);
    const res = await create({ avatarUrl: "https://example.test/forged.jpg" });
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ error: "profile_photo_required", field: "avatarUrl" });
    expect(from.mock.calls.every(([table]) => table === "users")).toBe(true);
    expect(incrementEventsCreated).not.toHaveBeenCalled();
  });
  it("also requires the profile photo for business events with their own cover", async () => {
    database(null);
    expect(await (await create({ isBusiness: true, businessPricingType: "free" })).json()).toMatchObject({ error: "profile_photo_required" });
  });
  it("allows an existing avatar through to ordinary event validation", async () => {
    const from = database("https://example.test/avatar.jpg");
    expect(await (await create()).json()).toMatchObject({ error: "invalid_category" });
    expect(from).toHaveBeenCalledWith("categories");
  });
  it("keeps the existing anonymous-photo rule and error unchanged", async () => {
    database(null);
    expect(await (await create({ isAnonymous: true })).json()).toMatchObject({ error: "anonymous_requires_photo", field: "isAnonymous" });
    database("https://example.test/avatar.jpg");
    expect(await (await create({ isAnonymous: true })).json()).toMatchObject({ error: "invalid_category" });
  });
  it("does not misreport a database outage as a missing photo", async () => {
    database(null, { code: "08006" });
    const res = await create();
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: "profile_unavailable" });
  });
});
