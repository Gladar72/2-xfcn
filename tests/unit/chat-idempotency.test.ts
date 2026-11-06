import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/conversations/[id]/messages/route";
import { createAdminClient } from "@/lib/supabase/admin";
import { broadcastToConversation } from "@/lib/supabase/broadcast";
import { uploadChatPhoto } from "@/lib/photos/upload-chat-photo";

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: vi.fn().mockResolvedValue({ userId: "me" }) }));
vi.mock("@/lib/supabase/broadcast", () => ({ broadcastToConversation: vi.fn().mockResolvedValue(undefined) }));
vi.mock("@/lib/photos/upload-chat-photo", () => ({ uploadChatPhoto: vi.fn().mockResolvedValue({ ok: true, publicUrl: "https://example.test/photo.webp" }) }));
vi.mock("@/lib/server/background", () => ({ runInBackground: vi.fn().mockResolvedValue(undefined) }));

const firstId = "11111111-1111-4111-8111-111111111111";
const secondId = "22222222-2222-4222-8222-222222222222";
type Row = { id: string; conversation_id: string; sender_id: string; created_at: string; content?: string; image_url?: string | null; deleted_at?: string | null };

function database({ member = true, blocked = false, status = "published", race = false } = {}) {
  const rows = new Map<string, Row>();
  const inserts: Row[] = [];
  const rpc = vi.fn().mockResolvedValue({ data: null });
  const from = vi.fn((table: string) => {
    const filters: Record<string, unknown> = {};
    let insert: Row | null = null;
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((key: string, value: unknown) => { filters[key] = value; return query; }),
      insert: vi.fn((value: Row) => { insert = value; return query; }),
      maybeSingle: vi.fn(async () => {
        if (table === "conversation_members") return { data: member ? { id: "membership", is_blocked: blocked } : null };
        if (table === "conversations") return { data: { events: { status } } };
        const row = rows.get(filters.id as string);
        return { data: row && Object.entries(filters).every(([key, value]) => row[key as keyof Row] === value) ? row : null };
      }),
      single: vi.fn(async () => {
        if (!insert) throw new Error("missing insert");
        const id = insert.id ?? crypto.randomUUID();
        if (rows.has(id)) return { data: null, error: { code: "23505" } };
        const row = { ...insert, id, created_at: "2026-11-06T12:00:00Z", deleted_at: null };
        rows.set(id, row);
        inserts.push(row);
        // Simulate a second request winning the unique-key race after the initial lookup.
        return race ? { data: null, error: { code: "23505" } } : { data: row };
      }),
    };
    return query;
  });
  vi.mocked(createAdminClient).mockReturnValue({ from, rpc } as unknown as ReturnType<typeof createAdminClient>);
  return { rows, inserts, from, rpc };
}

function send(body: Record<string, unknown> = { content: "Да", clientMessageId: firstId }, id = "chat") {
  return POST(new NextRequest(`https://example.test/api/conversations/${id}/messages`, { method: "POST", body: JSON.stringify(body) }), { params: Promise.resolve({ id }) });
}

beforeEach(() => { vi.clearAllMocks(); });

it("retries a lost response without inserting, uploading or notifying twice", async () => {
  const db = database();
  const body = { content: "Да", clientMessageId: firstId, image: "data:image/webp;base64,test" };
  const first = await (await send(body)).json();
  const retried = await (await send(body)).json();
  expect(retried).toEqual(first);
  expect(db.inserts).toHaveLength(1);
  expect(uploadChatPhoto).toHaveBeenCalledTimes(1);
  expect(broadcastToConversation).toHaveBeenCalledTimes(1);
  expect(db.rpc).toHaveBeenCalledTimes(1);
});

it("keeps two intentionally identical messages when their identifiers differ", async () => {
  const db = database();
  expect((await send()).status).toBe(200);
  expect((await send({ content: "Да", clientMessageId: secondId })).status).toBe(200);
  expect(db.inserts).toHaveLength(2);
  expect(broadcastToConversation).toHaveBeenCalledTimes(2);
});

it("resolves a concurrent unique-key conflict without repeating delivery side effects", async () => {
  const db = database({ race: true });
  expect(await (await send()).json()).toMatchObject({ messageId: firstId });
  expect(db.rows.size).toBe(1);
  expect(broadcastToConversation).not.toHaveBeenCalled();
  expect(db.rpc).not.toHaveBeenCalled();
});

it.each([{ member: false }, { blocked: true }])("checks membership and blocking before looking up a retry: %j", async options => {
  const db = database(options);
  expect((await send()).status).toBe(403);
  expect(db.from.mock.calls.map(([table]) => table)).toEqual(["conversation_members"]);
});

it.each([{ conversation_id: "different-chat", sender_id: "me" }, { conversation_id: "chat", sender_id: "other" }])("does not reveal or overwrite another message through its UUID: %j", async scope => {
  const db = database();
  db.rows.set(firstId, { id: firstId, ...scope, created_at: "2026-11-06T12:00:00Z" });
  expect((await send()).status).toBe(409);
  expect(db.inserts).toHaveLength(0);
  expect(broadcastToConversation).not.toHaveBeenCalled();
});

it("rejects a malformed identifier before any database write", async () => {
  const db = database();
  expect((await send({ content: "Да", clientMessageId: "invalid" })).status).toBe(400);
  expect(db.from).not.toHaveBeenCalled();
});

it("retains compatibility with clients without identifiers, and blocks new messages in closed events", async () => {
  const db = database();
  expect((await send({ content: "Да" })).status).toBe(200);
  expect(db.inserts).toHaveLength(1);
  database({ status: "cancelled" });
  expect((await send()).status).toBe(422);
});
