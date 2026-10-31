import { afterEach, expect, it, vi } from "vitest";
import { createAdminClient } from "@/lib/supabase/admin";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it("bypasses Next's persistent fetch cache for notification database reads", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://database.test");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-service-role");
  const fetch = vi.fn().mockResolvedValue(new Response("[]", { headers: { "Content-Type": "application/json" } }));
  vi.stubGlobal("fetch", fetch);
  await createAdminClient({ noStore: true }).from("users").select("id,last_digest_at");
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(fetch.mock.calls[0]?.[1]).toMatchObject({ method: "GET", cache: "no-store" });
  expect(new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization")).toBe("Bearer test-service-role");
});
