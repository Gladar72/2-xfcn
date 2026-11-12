import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ validate: vi.fn(), admin: vi.fn(), avatar: vi.fn(), upload: vi.fn(), issue: vi.fn(), current: vi.fn() }));
vi.mock("@/lib/telegram/validate-init-data", () => ({ validateTelegramInitData: mocks.validate }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
vi.mock("@/lib/telegram/profile-photo", () => ({ fetchTelegramAvatarDataUrl: mocks.avatar }));
vi.mock("@/lib/photos/upload-avatar", () => ({ uploadAvatar: mocks.upload }));
vi.mock("@/lib/telegram/current-user", () => ({ getCurrentUser: mocks.current }));
vi.mock("@/lib/telegram/session", () => ({ issueSessionToken: mocks.issue, SESSION_COOKIE: { name: "session", maxAgeSeconds: 3600 } }));

import { POST } from "@/app/api/auth/route";
import { GET } from "@/app/api/me/profile/route";

beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv("TELEGRAM_BOT_TOKEN", "test-only");
  mocks.validate.mockReturnValue({ ok: true, data: { user: { id: 12 } } });
  mocks.issue.mockReturnValue("test-session");
  mocks.current.mockResolvedValue({ userId: "me" });
});
afterEach(() => { vi.unstubAllEnvs(); });
function db(data: Record<string, unknown>) {
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn().mockResolvedValue({ data, error: null }) };
  query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
  const from = vi.fn(() => query);
  mocks.admin.mockReturnValue({ from });
  return { from, query };
}
const login = () => new NextRequest("https://mesto.test/api/auth", { method: "POST", body: JSON.stringify({ initData: "signed-launch" }) });

it("authenticates without waiting for a slow Telegram avatar", async () => {
  db({ id: "me", avatar_url: null, moderation_status: "active" });
  let release!: (value: null) => void;
  mocks.avatar.mockReturnValue(new Promise<null>(resolve => { release = resolve; }));
  try {
    const response = await POST(login());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "authenticated" });
    expect(response.cookies.get("session")?.value).toBe("test-session");
    expect(mocks.avatar).toHaveBeenCalledOnce();
    expect(mocks.upload).not.toHaveBeenCalled();
  } finally { release?.(null); }
}, 1000);

it("still rejects a banned user before background work or issuing a session", async () => {
  db({ id: "me", avatar_url: null, moderation_status: "banned" });
  expect((await POST(login())).status).toBe(403);
  expect(mocks.issue).not.toHaveBeenCalled(); expect(mocks.avatar).not.toHaveBeenCalled();
});

it("loads only the authenticated user's city for home startup", async () => {
  const { from, query } = db({ id: "me", city: "Тюмень" });
  const response = await GET(new Request("https://mesto.test/api/me/profile?summary=1"));
  expect(await response.json()).toEqual({ id: "me", city: "Тюмень" });
  expect(from).toHaveBeenCalledOnce();
  expect(query.select).toHaveBeenCalledWith("id, city");
  expect(query.eq).toHaveBeenCalledWith("id", "me");
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});

it("does not expose a home summary without a session", async () => {
  mocks.current.mockResolvedValue(null);
  expect((await GET(new Request("https://mesto.test/api/me/profile?summary=1"))).status).toBe(401);
  expect(mocks.admin).not.toHaveBeenCalled();
});
