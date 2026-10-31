import { afterEach, describe, expect, it, vi } from "vitest";
import { runInBackground } from "@/lib/server/background";

const contextKey = Symbol.for("@vercel/request-context");
const globals = globalThis as unknown as Record<symbol, unknown>;
afterEach(() => { delete globals[contextKey]; vi.restoreAllMocks(); });

describe("chat notification background work", () => {
  it("acknowledges a saved message without waiting for a slow notification", async () => {
    let finish = () => {};
    let delivered = false;
    const pending = new Promise<void>((resolve) => { finish = resolve; });
    await runInBackground(async () => { await pending; delivered = true; });
    expect(delivered).toBe(false);
    finish();
    await pending;
    expect(delivered).toBe(true);
  });

  it("registers work with Vercel when its request lifecycle is present", async () => {
    const waitUntil = vi.fn();
    globals[contextKey] = { get: () => ({ waitUntil }) };
    const task = vi.fn().mockResolvedValue(undefined);
    await runInBackground(task);
    expect(waitUntil).toHaveBeenCalledOnce();
    await waitUntil.mock.calls[0]![0];
    expect(task).toHaveBeenCalledOnce();
  });

  it("contains sync and async notification failures after the message is saved", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const waitUntil = vi.fn();
    globals[contextKey] = { get: () => ({ waitUntil }) };
    await runInBackground(() => { throw new Error("notification unavailable"); });
    await waitUntil.mock.calls[0]![0];
    await runInBackground(() => Promise.reject(new Error("notification timed out")));
    await waitUntil.mock.calls[1]![0];
    expect(log).toHaveBeenCalledTimes(2);
  });
});
