import { afterEach, expect, it, vi } from "vitest";
import { getAllItems, getItems } from "@/lib/http/get-items";
afterEach(() => { vi.unstubAllGlobals(); });
it("rejects failed or malformed responses instead of turning them into an empty list", async () => {
  for (const [status, data] of [[503, { error: "unavailable" }], [200, {}], [200, { items: null }]] as const) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(data), { status })));
    await expect(getItems("/api/events")).rejects.toThrow();
  }
});
it("loads all pages, showing the first immediately and deduplicating overlaps", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "a" }], hasMore: true })))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "a" }, { id: "b" }] })));
  vi.stubGlobal("fetch", fetch); const pages: unknown[] = [];
  expect(await getAllItems("/api/events?business=true", undefined, items => pages.push(items))).toEqual([{ id: "a" }, { id: "b" }]);
  expect(pages[0]).toEqual([{ id: "a" }]);
  expect(fetch.mock.calls.map(call => call[0])).toEqual(["/api/events?business=true&page=0", "/api/events?business=true&page=1"]);
});
it("reports a broken second page and never treats partial data as the full catalogue", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: "a" }], hasMore: true }))).mockResolvedValueOnce(new Response('{}', { status: 503 })));
  await expect(getAllItems("/api/events")).rejects.toThrow();
});
