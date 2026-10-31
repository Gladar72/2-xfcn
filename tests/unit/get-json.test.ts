import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiReadError, getJson } from "@/lib/http/get-json";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("reading API data", () => {
  it("preserves the HTTP failure and error code", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "city_required" }), { status: 400 })));
    await expect(getJson("/api/events/map")).rejects.toMatchObject({ status: 400, code: "city_required" });
  });
  it("does not accept HTML errors or successful envelopes containing an error", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response("Bad Gateway", { status: 502 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ error: "fetch_failed" })));
    vi.stubGlobal("fetch", fetcher);
    await expect(getJson("/api/conversations")).rejects.toBeInstanceOf(ApiReadError);
    await expect(getJson("/api/conversations")).rejects.toMatchObject({ code: "fetch_failed" });
  });
  it("times out a stalled request and cleans up its timer", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    })));
    const result = expect(getJson("/api/subscriptions")).rejects.toThrow("aborted");
    await vi.advanceTimersByTimeAsync(15_000);
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels a superseded request without waiting for the timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => reject(new Error("cancelled")), { once: true });
    })));
    const controller = new AbortController();
    const result = expect(getJson("/api/events", controller.signal)).rejects.toThrow("cancelled");
    controller.abort();
    await result;
    expect(vi.getTimerCount()).toBe(0);
  });
});
