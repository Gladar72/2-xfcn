import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { POST as like } from "@/app/api/likes/route";
import { POST as apply } from "@/app/api/applications/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyTelegram } from "@/lib/telegram/notify";
import { sendPushToUsers } from "@/lib/push/expo";

const sender = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const recipient = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: () => ({ userId: sender, telegramId: null }) }));
vi.mock("@/lib/push/expo", () => ({ sendPushToUsers: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/telegram/notify", () => ({ notifyTelegram: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/admin/is-admin", () => ({ isAdminTelegramId: () => true }));
vi.mock("@/lib/subscriptions/server", () => ({ getActiveSubscriptionInfo: vi.fn() }));

function request(path: string, body: object) {
  return new NextRequest(`https://app.test/api/${path}`, { method: "POST", body: JSON.stringify(body) });
}

function database(options: { mutual?: boolean; failWrite?: boolean; alreadyApplied?: boolean; channel?: "telegram" | "installed" | "token" | "lookupError" } = {}) {
  const hearts = new Set<string>();
  const fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    const table = url.pathname.split("/").at(-1);
    const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
    // maybeSingle() GET in PostgREST returns arrays for the client to unwrap.
    if (table === "app_install_gifts") {
      if (options.channel === "lookupError") return json({ code: "08006" }, 503);
      return json(options.channel === "installed" ? [{ user_id: recipient }] : []);
    }
    if (table === "users" && url.searchParams.get("select")?.includes("push_tokens!inner")) {
      return json(options.channel === "token" ? [{ id: recipient, push_tokens: [{ user_id: recipient }] }] : []);
    }
    if (table === "users") return json([{ id: recipient, name: "Саша", telegram_id: options.channel ? 321 : null }]);
    if (table === "events") return json([{ id: "event-1", title: "Кино", organizer_id: recipient, status: "published", seats_total: 4, seats_taken: 0 }]);
    if (table === "is_blocked_pair") return json(false);
    if (table === "applications") return options.alreadyApplied ? json({ code: "23505" }, 409) : json({ id: "application-1" }, 201);
    if (table === "notifications" && init?.method === "POST") {
      const row = JSON.parse(String(init.body));
      if (options.failWrite) return json({ code: "08006" }, 503);
      if (row.type === "heart") {
        if (hearts.has(row.id)) return json({ code: "23505" }, 409);
        hearts.add(row.id);
      }
      return json(null, 201);
    }
    if (table === "notifications" && init?.method === "HEAD") return new Response(null, { headers: { "content-range": "*/0" } });
    if (table === "notifications" && options.mutual && url.searchParams.get("user_id") === `eq.${sender}`) return json([{ id: "reverse-heart" }]);
    return json([]);
  };
  const client = createClient("https://database.test", "local-fixture", { global: { fetch }, auth: { persistSession: false } });
  vi.mocked(createAdminClient).mockReturnValue(client);
  return client;
}

beforeEach(() => { vi.clearAllMocks(); });

describe("automatic activity push", () => {
  it.each([false, true])("delivers a received heart once even for simultaneous taps (mutual=%s)", async (mutual) => {
    const client = database({ mutual });
    const responses = await Promise.all([like(request("likes", { userId: recipient })), like(request("likes", { userId: recipient }))]);
    expect(responses.map(r => r.status)).toEqual([200, 200]);
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    expect(sendPushToUsers).toHaveBeenCalledWith(client, [recipient], expect.objectContaining({
      data: { type: mutual ? "heart_mutual" : "heart", fromUserId: sender, url: `/person/${sender}?heart=1` },
    }));
  });

  it.each(["installed", "token", "lookupError"] as const)("keeps a linked profile out of Telegram (%s)", async (channel) => {
    database({ channel });
    await like(request("likes", { userId: recipient }));
    await apply(request("applications", { eventId: "event-1" }));
    expect(sendPushToUsers).toHaveBeenCalledTimes(2);
    expect(notifyTelegram).not.toHaveBeenCalled();
  });
  it("keeps Telegram for a profile that only uses the bot", async () => {
    database({ channel: "telegram" });
    await like(request("likes", { userId: recipient }));
    expect(notifyTelegram).toHaveBeenCalledWith(321, expect.stringContaining("сердечко"));
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("does not notify for an unsaved heart", async () => {
    database({ failWrite: true });
    expect((await like(request("likes", { userId: recipient }))).status).toBe(500);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });

  it("delivers a new application to its organizer without a Telegram account", async () => {
    const client = database();
    expect((await apply(request("applications", { eventId: "event-1" }))).status).toBe(200);
    expect(sendPushToUsers).toHaveBeenCalledTimes(1);
    expect(sendPushToUsers).toHaveBeenCalledWith(client, [recipient], expect.objectContaining({
      data: { type: "new_application", eventId: "event-1", url: "/event/event-1" },
    }));
  });

  it("does not send a second application alert on retry", async () => {
    database({ alreadyApplied: true });
    expect((await apply(request("applications", { eventId: "event-1" }))).status).toBe(409);
    expect(sendPushToUsers).not.toHaveBeenCalled();
  });
});
