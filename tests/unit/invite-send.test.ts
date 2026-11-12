import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({ current: vi.fn(), admin: vi.fn(), shared: vi.fn(), chat: vi.fn(), telegram: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: mocks.current }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/chat/can-direct", () => ({ findDirectConversation: mocks.chat, haveSharedEvent: mocks.shared }));
vi.mock("@/lib/telegram/bot", () => ({ getBot: () => ({ api: { sendMessage: mocks.telegram } }) }));
vi.mock("@/lib/push/expo", () => ({ sendPushToUsers: mocks.push }));
import { POST } from "@/app/api/conversations/direct/route";
const sender = "00000000-0000-4000-8000-000000000001";
const recipient = "00000000-0000-4000-8000-000000000002";
const eventId = "00000000-0000-4000-8000-000000000003";

function database(options: { host?: boolean; full?: boolean; blocked?: boolean; blockError?: boolean; quota?: boolean; duplicate?: boolean; messageError?: boolean; hidden?: boolean; cancelled?: boolean } = {}) {
  const writes: { table: string; operation: string; value?: unknown }[] = [];
  const from = vi.fn((table: string) => {
    let operation = "select";
    let fields = "";
    const query = {
      eq: () => query, or: () => query,
      select: (value: string) => { fields = value; return query; },
      insert: (value: unknown) => { operation = "insert"; writes.push({ table, operation, value }); return query; },
      update: (value: unknown) => { operation = "update"; writes.push({ table, operation, value }); return query; },
      delete: () => { operation = "delete"; writes.push({ table, operation }); return query; },
      maybeSingle: async () => result(), single: async () => result(), limit: async () => result(),
      then: (resolve: (data: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    function result() {
      if (table === "blocks") return { data: options.blocked ? [{ blocker_id: sender }] : [], error: options.blockError ? {} : null };
      if (table === "conversation_members") return { data: [] };
      if (table === "messages") return { error: options.messageError ? { message: "db unavailable" } : null };
      if (table === "users") return { data: fields === "name" ? { name: "Андрей" } : fields === "telegram_id" ? { telegram_id: 42 } : { id: recipient, moderation_status: "active", is_profile_hidden: options.hidden ?? false } };
      if (table === "events") return { data: { id: eventId, title: "Концерт", organizer_id: options.host ? sender : "host", status: options.cancelled ? "cancelled" : "published", seats_total: 10, seats_taken: options.full ? 10 : 0, event_date: "2099-01-01", event_time: "18:00", event_end_time: "20:00", city: "Тюмень" } };
      return { data: null };
    }
    return query;
  });
  const rpc = vi.fn(async (name: string) => ({ data: name === "reserve_event_invite" ? options.quota ? { error: "invite_limit" } : options.duplicate ? { error: "already_invited" } : { id: "invitation" } : null }));
  const db = { from, rpc }; mocks.admin.mockReturnValue(db);
  return { ...db, writes };
}
function request(event: string | undefined = eventId) {
  return new NextRequest("https://mesto.test/api/conversations/direct", { method: "POST", body: JSON.stringify({ userId: recipient, eventId: event, message: "Пойдём вместе" }) });
}
beforeEach(() => {
  vi.clearAllMocks(); mocks.current.mockResolvedValue({ userId: sender }); mocks.shared.mockResolvedValue(false);
  mocks.chat.mockResolvedValue("direct-chat"); mocks.telegram.mockResolvedValue({ message_id: 1 }); mocks.push.mockResolvedValue(undefined);
});
describe("sending an event invitation", () => {
  it("allows a non-organizer to propose any available event and sends from the bot with accurate wording", async () => {
    const db = database();
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ conversationId: "direct-chat" });
    expect(db.rpc).toHaveBeenCalledWith("reserve_event_invite", expect.objectContaining({ p_event_id: eventId, p_inviter_id: sender, p_invitee_id: recipient }));
    expect(mocks.shared).not.toHaveBeenCalled();
    expect(mocks.telegram.mock.calls[0]?.[1]).toContain("предлагает пойти вместе");
    expect(mocks.telegram.mock.calls[0]?.[1]).toContain("билеты оформляются отдельно");
    expect(mocks.telegram.mock.calls[0]?.[1]).not.toContain("сразу попадёшь");
    expect(db.writes.some(write => write.table === "messages")).toBe(true);
  });
  it("retains host invitations and their direct admission wording", async () => {
    database({ host: true });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.telegram.mock.calls[0]?.[1]).toContain("сразу попадёшь");
  });
  it("rejects full host events, cancelled events, hidden users and blocked or unavailable block lookups", async () => {
    for (const options of [{ host: true, full: true }, { cancelled: true }, { hidden: true }, { blocked: true }, { blockError: true }]) {
      const db = database(options);
      expect((await POST(request())).status).toBeGreaterThanOrEqual(400);
      expect(db.writes).toHaveLength(0);
    }
    expect(mocks.telegram).not.toHaveBeenCalled();
  });
  it("honors the atomic daily quota and duplicate check before creating a chat message", async () => {
    for (const [options, status] of [[{ quota: true }, 429], [{ duplicate: true }, 422]] as const) {
      const db = database(options);
      expect((await POST(request())).status).toBe(status);
      expect(db.writes).toHaveLength(0);
    }
    expect(mocks.telegram).not.toHaveBeenCalled();
  });
  it("releases the invitation when its chat message cannot be saved, allowing retry", async () => {
    const db = database({ messageError: true });
    expect((await POST(request())).status).toBe(500);
    expect(db.writes).toContainEqual({ table: "event_invites", operation: "delete" });
    expect(mocks.telegram).not.toHaveBeenCalled();
  });
  it("still requires a shared event for unrelated direct messages", async () => {
    const db = database();
    const req = new NextRequest("https://mesto.test/api/conversations/direct", { method: "POST", body: JSON.stringify({ userId: recipient }) });
    expect((await POST(req)).status).toBe(403);
    expect(db.writes).toHaveLength(0);
  });
});
