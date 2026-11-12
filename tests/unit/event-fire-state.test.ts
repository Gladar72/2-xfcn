import { describe, expect, it, vi } from "vitest";
import { createFireStore, type FireValue } from "@/lib/events/fire-state";

function deferred() {
  let resolve!: (value: FireValue) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<FireValue>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const initial = { count: 2, mine: false };

describe("shared event reactions", () => {
  it("updates both screens synchronously and keeps the value across navigation", async () => {
    const request = deferred();
    const store = createFireStore(() => request.promise);
    const home = vi.fn(), detail = vi.fn();
    const unsubscribe = store.subscribe("event", home);
    store.subscribe("event", detail);
    store.toggle("event", initial);
    expect(store.get("event")).toEqual({ count: 3, mine: true, pending: true });
    expect(home).toHaveBeenCalledOnce(); expect(detail).toHaveBeenCalledOnce();
    unsubscribe();
    request.resolve({ count: 4, mine: true });
    await request.promise;
    expect(store.get("event")).toEqual({ count: 4, mine: true, pending: false });
    expect(store.get("another")).toBeUndefined();
  });

  it("serializes rapid opposite taps without showing the older response", async () => {
    const post = deferred(), del = deferred();
    const save = vi.fn().mockReturnValueOnce(post.promise).mockReturnValueOnce(del.promise);
    const store = createFireStore(save);
    store.toggle("event", initial);
    store.toggle("event", initial);
    expect(save).toHaveBeenCalledTimes(1);
    expect(store.get("event")).toEqual({ count: 2, mine: false, pending: true });
    post.resolve({ count: 3, mine: true }); await post.promise;
    expect(save).toHaveBeenLastCalledWith("event", false);
    expect(store.get("event")?.mine).toBe(false);
    del.resolve(initial); await del.promise;
    expect(store.get("event")).toEqual({ ...initial, pending: false });
  });

  it("coalesces repeated taps to the final intent", async () => {
    const request = deferred();
    const save = vi.fn(() => request.promise);
    const store = createFireStore(save);
    for (let i = 0; i < 9; i++) store.toggle("event", initial);
    request.resolve({ count: 3, mine: true }); await request.promise;
    expect(save).toHaveBeenCalledOnce();
    expect(store.get("event")).toEqual({ count: 3, mine: true, pending: false });
  });

  it("rejects stale GETs but accepts a read started after the write completed", async () => {
    const request = deferred();
    const store = createFireStore(() => request.promise);
    const before = Date.now() - 1;
    store.toggle("event", initial);
    store.observe("event", initial, before);
    expect(store.get("event")?.mine).toBe(true);
    request.resolve({ count: 3, mine: true }); await request.promise;
    store.observe("event", initial, before);
    expect(store.get("event")?.count).toBe(3);
    store.observe("event", { count: 10, mine: true }, Date.now() + 1);
    expect(store.get("event")?.count).toBe(10);
  });

  it("rolls back a rejected save and allows a retry", async () => {
    const request = deferred();
    const onError = vi.fn();
    const save = vi.fn().mockReturnValueOnce(request.promise).mockResolvedValue({ count: 3, mine: true });
    const store = createFireStore(save, onError);
    store.toggle("event", initial);
    request.reject(new Error("offline")); await request.promise.catch(() => {});
    expect(store.get("event")).toEqual({ ...initial, pending: false });
    expect(onError).toHaveBeenCalledOnce();
    store.toggle("event", initial);
    await Promise.resolve();
    expect(store.get("event")).toEqual({ count: 3, mine: true, pending: false });
  });
});
