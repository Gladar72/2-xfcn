import { expect, it } from "vitest";
import { stableRefresh } from "@/lib/events/stable-refresh";

it("refreshes content in place, removes missing events and appends new events once", () => {
  const before = [{ id: "a", count: 0 }, { id: "b", count: 0 }, { id: "gone", count: 0 }];
  const after = [{ id: "new", count: 1 }, { id: "b", count: 7 }, { id: "a", count: 3 }, { id: "new", count: 1 }];
  expect(stableRefresh(before, after)).toEqual([{ id: "a", count: 3 }, { id: "b", count: 7 }, { id: "new", count: 1 }]);
  expect(before[0]!.count).toBe(0);
});
