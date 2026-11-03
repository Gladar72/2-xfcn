import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/events/[id]/applications/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/telegram/current-user";
import { canSeeAnonymousDetails } from "@/lib/events/anonymity";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: vi.fn() }));

const applicant = {
  id: "applicant", name: "Анна", avatar_url: "https://example.test/avatar.jpg",
  birth_date: "1998-06-15", bio: "Люблю прогулки", gender: "female", rating_avg: 4.9, completed_meetings_count: 7,
};
const event = { id: "event", organizer_id: "organizer", title: "Кофе", seats_total: 3, seats_taken: 0, is_anonymous: true };
const request = () => GET(new NextRequest("https://example.test/api/events/event/applications"), { params: Promise.resolve({ id: "event" }) });

function database(options: { event?: typeof event | null; applications?: unknown[]; error?: unknown } = {}) {
  const eventQuery = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
  eventQuery.select.mockReturnValue(eventQuery); eventQuery.eq.mockReturnValue(eventQuery);
  eventQuery.maybeSingle.mockResolvedValue({ data: options.event === undefined ? event : options.event });
  const appQuery = { select: vi.fn(), eq: vi.fn(), order: vi.fn() };
  appQuery.select.mockReturnValue(appQuery); appQuery.eq.mockReturnValue(appQuery);
  appQuery.order.mockResolvedValue({ data: options.applications ?? [], error: options.error ?? null });
  const from = vi.fn((table: string) => table === "events" ? eventQuery : appQuery);
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  return { from, eventQuery, appQuery };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getCurrentUser).mockResolvedValue({ userId: "organizer", telegramId: 1, sessionJwt: "test-session" });
});

describe("organizer's anonymous-event applicants", () => {
  it.each(["pending", "accepted"])("shows the real applicant photo/profile before and after acceptance (%s)", async (status) => {
    const db = database({ applications: [{ id: "application", status, created_at: "2026-11-03T10:00:00Z", applicant }] });
    const response = await request();
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.applications[0]).toMatchObject({ id: "application", status, applicant: { id: "applicant", name: "Анна", avatarUrl: applicant.avatar_url, bio: applicant.bio, ratingAvg: 4.9, completedMeetingsCount: 7 } });
    expect(data.applications[0].applicant.anonymous).not.toBe(true);
    expect(data.applications[0].applicant.age).toEqual(expect.any(Number));
    expect(db.eventQuery.eq).toHaveBeenCalledWith("id", "event");
    expect(db.appQuery.eq).toHaveBeenCalledWith("event_id", "event");
    expect(createAdminClient).toHaveBeenCalledWith({ noStore: true });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });

  it.each(["rejected", "cancelled", "removed"])("preserves masking for an inactive anonymous application (%s)", async (status) => {
    database({ applications: [{ id: "application", status, applicant }] });
    expect((await (await request()).json()).applications[0].applicant).toMatchObject({ id: "anonymous", avatarUrl: null, bio: null, age: null, anonymous: true });
  });

  it("does not change open-event applicants", async () => {
    database({ event: { ...event, is_anonymous: false }, applications: [{ id: "application", status: "pending", applicant }] });
    expect((await (await request()).json()).applications[0].applicant).toMatchObject({ id: "applicant", avatarUrl: applicant.avatar_url });
  });

  it("does not reveal applicants to an unauthenticated visitor", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    expect((await request()).status).toBe(401);
    expect(createAdminClient).not.toHaveBeenCalled();
  });

  it.each(["applicant", "other-participant", "other-organizer"])("rejects another user's request before reading applications (%s)", async (userId) => {
    vi.mocked(getCurrentUser).mockResolvedValue({ userId, telegramId: 2, sessionJwt: "test-session" });
    const db = database({ applications: [{ id: "application", status: "pending", applicant }] });
    const response = await request();
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "forbidden" });
    expect(db.from).not.toHaveBeenCalledWith("applications");
  });

  it("returns not found before reading applicants for a missing event", async () => {
    const db = database({ event: null });
    expect((await request()).status).toBe(404);
    expect(db.from).not.toHaveBeenCalledWith("applications");
  });

  it("handles deleted applicants and missing photos without inventing profile data", async () => {
    database({ applications: [{ id: "deleted", status: "pending", applicant: null }, { id: "no-photo", status: "pending", applicant: { ...applicant, avatar_url: null } }] });
    expect((await (await request()).json()).applications).toMatchObject([{ applicant: null }, { applicant: { id: "applicant", avatarUrl: null } }]);
  });

  it("returns an error if application loading fails", async () => {
    database({ error: { message: "unavailable" } });
    const response = await request();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "fetch_failed" });
  });

  it.each([null, "pending", "rejected", "cancelled", "removed"])("still hides the organizer from an unapproved viewer (%s)", (applicationStatus) => {
    expect(canSeeAnonymousDetails({ isAnonymous: true, isOrganizer: false, applicationStatus })).toBe(false);
  });
  it("still reveals the anonymous organizer only to themselves and accepted applicants", () => {
    expect(canSeeAnonymousDetails({ isAnonymous: true, isOrganizer: true, applicationStatus: null })).toBe(true);
    expect(canSeeAnonymousDetails({ isAnonymous: true, isOrganizer: false, applicationStatus: "accepted" })).toBe(true);
  });
});
