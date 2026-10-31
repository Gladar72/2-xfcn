import { describe, expect, it, vi } from "vitest";
import { getActiveSubscriptionInfo } from "@/lib/subscriptions/server";

const subscription = { id: "sub", plan: "premium", current_period_start: "2026-10-01", current_period_end: "2026-12-01" };
const usage = { events_created_count: 7, boosts_used_count: 2 };
type Result = { data: unknown; error?: { code: string } | null };
function database(results: Result[]) {
  const chain = { select: vi.fn(), eq: vi.fn(), gt: vi.fn(), insert: vi.fn(), maybeSingle: vi.fn(), single: vi.fn() };
  for (const method of [chain.select, chain.eq, chain.gt, chain.insert]) method.mockReturnValue(chain);
  const next = () => Promise.resolve(results.shift());
  chain.maybeSingle.mockImplementation(next);
  chain.single.mockImplementation(next);
  return { from: vi.fn().mockReturnValue(chain) } as unknown as Parameters<typeof getActiveSubscriptionInfo>[0];
}

describe("subscription availability and usage", () => {
  it("only returns no subscription after a successful empty read", async () => {
    await expect(getActiveSubscriptionInfo(database([{ data: null }]), "user")).resolves.toBeNull();
    await expect(getActiveSubscriptionInfo(database([{ data: null, error: { code: "08006" } }]), "user")).rejects.toThrow("subscription_read_failed");
  });
  it("does not invent zero usage when a usage read or insert fails", async () => {
    await expect(getActiveSubscriptionInfo(database([{ data: subscription }, { data: null, error: { code: "08006" } }]), "user")).rejects.toThrow("subscription_usage_read_failed");
    await expect(getActiveSubscriptionInfo(database([{ data: subscription }, { data: null }, { data: null, error: { code: "08006" } }]), "user")).rejects.toThrow("subscription_usage_create_failed");
  });
  it("uses the real counters when another request creates the usage row first", async () => {
    await expect(getActiveSubscriptionInfo(database([
      { data: subscription }, { data: null }, { data: null, error: { code: "23505" } }, { data: usage },
    ]), "user")).resolves.toMatchObject({ eventsCreatedCount: 7, boostsUsedCount: 2 });
  });
});
