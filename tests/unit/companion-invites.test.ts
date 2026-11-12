import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ notify: vi.fn(), chat: vi.fn() }));
vi.mock("@/lib/notify/user", () => ({ notifyUser: mocks.notify, shortTitle: (s: string) => s }));
vi.mock("@/lib/chat/can-direct", () => ({ findDirectConversation: mocks.chat }));
import { respondToInvite } from "@/lib/invites/respond";
import { invitationEvents, inviteEventLabel, type InviteEvent } from "@/lib/invites/events";

type Admin = Parameters<typeof respondToInvite>[0];
function database(options: { host?: boolean; status?: string; eventStatus?: string; updated?: boolean; updateError?: boolean; blocked?: boolean } = {}) {
  const writes: { table: string; op: string; value: unknown }[] = [];
  const from = vi.fn((table: string) => {
    let op = "select";
    const query = {
      select: () => query, eq: () => query, or: () => query,
      update: (value: unknown) => { op = "update"; writes.push({ table, op, value }); return query; },
      insert: (value: unknown) => { op = "insert"; writes.push({ table, op, value }); return query; },
      maybeSingle: async () => result(),
      limit: async () => ({ data: options.blocked ? [{ blocker_id: "sender" }] : [] }),
      then: (resolve: (data: unknown) => unknown) => Promise.resolve(result()).then(resolve),
    };
    function result() {
      if (op === "update") return { data: options.updated === false ? null : { id: "invite" }, error: options.updateError ? { message: "failed" } : null };
      if (table === "event_invites") return { data: { id: "invite", status: options.status ?? "pending", event_id: "event", inviter_id: options.host ? "host" : "sender", invitee_id: "recipient", invitee: { name: "Анна", telegram_id: 42 } } };
      if (table === "events") return { data: { id: "event", title: "Концерт", organizer_id: "host", status: options.eventStatus ?? "published", event_date: "2099-01-01", event_time: "18:00", event_end_time: "20:00", city: "Тюмень", has_chat: false } };
      if (table === "users") return { data: { telegram_id: 55 } };
      return { data: null };
    }
    return query;
  });
  const rpc = vi.fn(async () => ({ data: true }));
  return { admin: { from, rpc } as unknown as Admin, writes, from, rpc };
}
beforeEach(() => { vi.clearAllMocks(); mocks.chat.mockResolvedValue("direct-chat"); mocks.notify.mockResolvedValue(undefined); });

describe("companion invitations", () => {
  it("accepts a proposal and notifies its sender without granting a seat, ticket or event chat", async () => {
    const db = database();
    const result = await respondToInvite(db.admin, { inviteId: "invite", answer: "accept", userId: "recipient" });
    expect(result).toMatchObject({ ok: true, status: "accepted", conversationId: "direct-chat" });
    expect(db.rpc).not.toHaveBeenCalled();
    expect(db.writes).toEqual([{ table: "event_invites", op: "update", value: expect.objectContaining({ status: "accepted" }) }]);
    expect(mocks.notify.mock.calls[0]?.[1]).toBe("sender");
    expect(db.from.mock.calls.map(([table]) => table)).not.toContain("applications");
  });
  it("declines via Telegram and informs the inviter rather than the event host", async () => {
    const db = database();
    expect(await respondToInvite(db.admin, { inviteId: "invite", answer: "decline", telegramId: 42 })).toMatchObject({ ok: true, status: "declined" });
    expect(mocks.notify.mock.calls[0]?.[1]).toBe("sender");
    expect(db.rpc).not.toHaveBeenCalled();
  });
  it("rejects another recipient and already answered or cancelled invitations", async () => {
    for (const [options, user, error] of [[{}, "stranger", "forbidden"], [{ status: "accepted" }, "recipient", "already_answered"], [{ eventStatus: "cancelled" }, "recipient", "event_unavailable"], [{ blocked: true }, "recipient", "blocked"]] as const) {
      const db = database(options);
      expect(await respondToInvite(db.admin, { inviteId: "invite", answer: "accept", userId: user })).toMatchObject({ ok: false, error });
      expect(db.writes).toHaveLength(0);
    }
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("does not report success or notify if the write fails or a parallel answer won", async () => {
    for (const options of [{ updated: false }, { updateError: true }]) {
      expect(await respondToInvite(database(options).admin, { inviteId: "invite", answer: "accept", userId: "recipient" })).toMatchObject({ ok: false });
    }
    expect(mocks.notify).not.toHaveBeenCalled();
  });
  it("keeps host invitations capable of granting a seat and membership", async () => {
    const db = database({ host: true });
    expect(await respondToInvite(db.admin, { inviteId: "invite", answer: "accept", userId: "recipient" })).toMatchObject({ ok: true, status: "accepted" });
    expect(db.rpc).toHaveBeenCalledWith("accept_event_seat", { p_event_id: "event" });
    expect(db.writes.some(w => w.table === "event_members")).toBe(true);
    expect(mocks.notify.mock.calls[0]?.[1]).toBe("host");
  });
});

it("orders one deduplicated list with owned and attending events first, including business events", () => {
  const base = { title: "Встреча", eventDate: "2099-01-01", eventTime: "18:00", photoUrl: null };
  const mine: InviteEvent[] = [{ ...base, id: "pending", myStatus: "pending" }, { ...base, id: "own", role: "organizer" }, { ...base, id: "going", myStatus: "member" }];
  const city: InviteEvent[] = [{ ...base, id: "own" }, { ...base, id: "business", isBusiness: true }, { ...base, id: "ended", status: "completed" }];
  const list = invitationEvents(mine, city);
  expect(list.map(e => e.id)).toEqual(["own", "going", "pending", "business"]);
  expect(list.map(inviteEventLabel)).toEqual(["Твоя встреча", "Ты идёшь", "Заявка отправлена", "Бизнес-событие"]);
});
