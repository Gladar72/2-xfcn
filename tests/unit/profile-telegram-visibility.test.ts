import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/users/[id]/route";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: async () => ({ userId: "viewer" }) }));
vi.mock("@/lib/photos/user-photos", () => ({ getUserPhotos: async () => ["photo"] }));
vi.mock("@/lib/chat/can-direct", () => ({ canDirectMessage: async () => false }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
const id = "00000000-0000-4000-8000-000000000123";
const when = "2026-11-17T15:00:00Z";
beforeEach(() => { vi.clearAllMocks(); });
it.each([
  { linked: true, visible: true, expected: "example" },
  { linked: true, visible: false, expected: null },
  { linked: false, visible: true, expected: null },
])("returns last activity and only an opted-in, linked Telegram handle: %j", async ({ linked, visible, expected }) => {
  const from = (table: string) => {
    let row: unknown = table === "user_interests" ? [] : null;
    const chain = {
      select: () => chain,
      eq: (_: string, value: string) => {
        if (table === "users" && value === id) row = { id, last_active_at: when, birth_date: "2000-01-01",
          telegram_id: linked ? 42 : null, telegram_username: "example", show_telegram_username: visible };
        return chain;
      },
      or: () => chain, limit: () => chain,
      maybeSingle: async () => ({ data: row }),
      then: (resolve: (value: unknown) => void) => Promise.resolve({ data: row }).then(resolve),
    };
    return chain;
  };
  vi.mocked(createAdminClient).mockReturnValue({ from } as unknown as ReturnType<typeof createAdminClient>);
  const res = await GET(new NextRequest("https://mesto.test/api/users/"+id), { params: Promise.resolve({ id }) });
  expect(res.status).toBe(200);
  expect(res.headers.get("cache-control")).toContain("no-store");
  const body = await res.json();
  expect(body).toMatchObject({ telegramUsername: expected, lastActiveAt: when, distanceM: null, photos: ["photo"] });
  expect(body).not.toHaveProperty("telegram_id");
});
