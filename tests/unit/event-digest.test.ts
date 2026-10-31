import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { sendDueDigests } from "@/lib/telegram/event-digest";
import { getBot } from "@/lib/telegram/bot";
import { sendPushToUsers } from "@/lib/push/expo";

vi.mock("@/lib/telegram/bot", () => ({ getBot: vi.fn() }));
vi.mock("@/lib/telegram/event-announce", () => ({ ANNOUNCE_OFF: "ann_off" }));
vi.mock("@/lib/push/expo", () => ({ sendPushToUsers: vi.fn().mockResolvedValue(undefined) }));

const NOW = Date.parse("2026-10-31T13:00:00Z"); // 18:00 in Tyumen
const sendMessage = vi.fn().mockResolvedValue({ message_id: 1 });

function database(options: { last?: string | null; every?: number; writeError?: boolean; readError?: boolean; empty?: boolean } = {}) {
  const snapshot = { id: "user-1", telegram_id: 123, city: "Тюмень", announce_every_days: options.every ?? 1, last_digest_at: options.last ?? null };
  const stored = { ...snapshot, event_announcements: true };
  const patches: URL[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    if (table === "users" && init?.method === "PATCH") {
      patches.push(url);
      if (options.writeError) return reply({ code: "08006", message: "database unavailable" }, 503);
      // A real PostgREST conditional UPDATE is atomic. Keep the GET snapshot
      // intentionally stale across sequential and concurrent invocations.
      const expected = url.searchParams.get("last_digest_at");
      const matchesLast = expected === "is.null" ? stored.last_digest_at === null : expected === `eq.${stored.last_digest_at}`;
      if (!matchesLast || url.searchParams.get("id") !== `eq.${stored.id}` ||
          (url.searchParams.get("event_announcements") === "eq.true" && !stored.event_announcements) ||
          url.searchParams.get("announce_every_days") !== `eq.${stored.announce_every_days}` ||
          url.searchParams.get("city") !== `eq.${stored.city}`) return reply([]);
      Object.assign(stored, JSON.parse(String(init.body)));
      return reply([{ id: stored.id }]);
    }
    if (table === "users") return options.readError ? reply({ code: "08006" }, 503) : reply([{ ...snapshot }]);
    if (table === "events") return reply(options.empty ? [] : [{
      id: "event-1", title: "Я И БАЛ В КАРАОКЕ FORMA", city: "Тюмень", organizer_id: "organizer-1",
      event_date: "2026-10-31", event_time: "21:00:00", place_name: "FORMA", seats_taken: 5, seats_total: 70,
      is_business: true, biz_category: "bars", business_pricing_type: "free", business_pricing_details: null,
      created_at: "2026-10-31T12:00:00Z", category: { slug: "party", emoji: "🎉" }, training_type: null,
    }]);
    return reply([]);
  });
  const admin = createClient("https://database.test", "test-service-role", { global: { fetch }, auth: { persistSession: false } });
  return { admin, stored, snapshot, patches };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  sendMessage.mockResolvedValue({ message_id: 1 });
  vi.mocked(getBot).mockReturnValue({ api: { sendMessage } } as unknown as ReturnType<typeof getBot>);
});

describe("event digest delivery guard", () => {
  it("does not resend every five minutes when the recipient GET stays cached", async () => {
    const { admin } = database();
    expect(await sendDueDigests(admin)).toMatchObject({ sent: 1, claimed: 1 });
    for (let minute = 5; minute < 60; minute += 5) {
      vi.mocked(Date.now).mockReturnValue(NOW + minute * 60_000);
      expect(await sendDueDigests(admin)).toMatchObject({ sent: 0, claimed: 0, skipped: 1 });
    }
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
  });
  it("only one concurrent worker owns a delivery", async () => {
    const { admin } = database({ last: "2026-10-30T13:00:00Z" });
    const results = await Promise.all([sendDueDigests(admin), sendDueDigests(admin), sendDueDigests(admin)]);
    expect(results.reduce((n, r) => n + r.claimed, 0)).toBe(1);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
  });
  it("sends nothing when saving the delivery claim fails", async () => {
    expect(await sendDueDigests(database({ writeError: true }).admin)).toMatchObject({ sent: 0, failed: 1 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
  it("stops if recipients could not be read", async () => {
    await expect(sendDueDigests(database({ readError: true }).admin)).rejects.toThrow("users unavailable");
    expect(sendMessage).not.toHaveBeenCalled();
  });
  it.each(["opt-out", "less-often", "city"])("honours a preference change after the snapshot: %s", async (change) => {
    const { admin, stored } = database();
    if (change === "opt-out") stored.event_announcements = false;
    if (change === "less-often") stored.announce_every_days = 3;
    if (change === "city") stored.city = "Москва";
    expect(await sendDueDigests(admin)).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
  it("does not release the claim after an ambiguous Telegram timeout", async () => {
    const { admin } = database();
    sendMessage.mockRejectedValueOnce(new Error("timeout after Telegram may have accepted the message"));
    expect(await sendDueDigests(admin)).toMatchObject({ sent: 0, claimed: 1, failed: 1 });
    expect(await sendDueDigests(admin)).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendMessage).toHaveBeenCalledTimes(1);
  });
  it("respects the three-day setting", async () => {
    const { admin, patches } = database({ last: "2026-10-30T13:00:00Z", every: 3 });
    expect(await sendDueDigests(admin)).toMatchObject({ users: 0, sent: 0 });
    expect(patches).toHaveLength(0);
  });
  it("does not consume a delivery if there are no matching events", async () => {
    const { admin, stored } = database({ empty: true });
    expect(await sendDueDigests(admin)).toMatchObject({ sent: 0, claimed: 0 });
    expect(stored.last_digest_at).toBeNull();
  });
});
