import { afterEach, describe, expect, it, vi } from "vitest";
import { readLaunchData, waitForLaunchData } from "@/lib/telegram/launch-data";
import { isTelegramWidgetReady } from "@/lib/telegram/widget-ready";

afterEach(() => { vi.useRealTimers(); });

describe("Telegram launch recovery", () => {
  const raw = "user=%7B%22first_name%22%3A%22A%2BB%20%26%20C%22%7D&hash=abc";
  it("preserves the signed payload exactly through the landing redirect", () => {
    const hash = `#tgWebAppVersion=8.0&tgWebAppData=${encodeURIComponent(raw)}`;
    expect(readLaunchData(hash, "?goto=subscriptions")).toBe(raw);
    expect(readLaunchData(`#app?tgWebAppData=${encodeURIComponent(raw)}`, "")).toBe(raw);
  });
  it("accepts query launch data and prioritizes a fresh fragment", () => {
    expect(readLaunchData("", `?tgWebAppData=${encodeURIComponent(raw)}`)).toBe(raw);
    expect(readLaunchData(`#tgWebAppData=${encodeURIComponent(raw)}`, "?tgWebAppData=old")).toBe(raw);
    expect(readLaunchData("#faq", "?goto=create")).toBeNull();
  });
  it("resumes when the SDK arrives after the old 500ms check", async () => {
    vi.useFakeTimers();
    let data: string | null = null;
    const result = waitForLaunchData(() => data, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(700);
    data = raw;
    await vi.advanceTimersByTimeAsync(50);
    expect(await result).toBe(raw);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("leaves the splash when no Telegram launch data arrives", async () => {
    vi.useFakeTimers();
    const result = waitForLaunchData(() => null, new AbortController().signal);
    await vi.advanceTimersByTimeAsync(1500);
    expect(await result).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("cancels polling on unmount or retry", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const result = waitForLaunchData(() => null, controller.signal);
    controller.abort();
    expect(await result).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Telegram widget readiness", () => {
  const frame = {} as Window;
  const ready = { origin: "https://oauth.telegram.org", source: frame, data: '{"event":"ready"}' };
  it("shows a widget only after its trusted iframe responds", () => {
    expect(isTelegramWidgetReady(ready, frame)).toBe(true);
    expect(isTelegramWidgetReady({ ...ready, data: '{"event":"resize","width":240,"height":44}' }, frame)).toBe(true);
  });
  it("rejects wrong origins, other frames, and error documents", () => {
    expect(isTelegramWidgetReady({ ...ready, origin: "https://example.com" }, frame)).toBe(false);
    expect(isTelegramWidgetReady({ ...ready, source: {} as Window }, frame)).toBe(false);
    expect(isTelegramWidgetReady(ready, null)).toBe(false);
    expect(isTelegramWidgetReady({ ...ready, data: "Bot domain invalid" }, frame)).toBe(false);
    expect(isTelegramWidgetReady({ ...ready, data: '{"event":"auth_user"}' }, frame)).toBe(false);
  });
});
