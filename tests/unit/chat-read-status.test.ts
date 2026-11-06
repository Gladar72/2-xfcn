import { expect, it } from "vitest";
import { hasReadMessage } from "@/lib/chat/read-status";

it("compares UTC instants rather than timezone text or fractional precision", () => {
  expect(hasReadMessage("2026-11-06T10:00:00Z", "2026-11-06T10:00:00.500+00:00")).toBe(true);
  expect(hasReadMessage("2026-11-06T15:00:00+05:00", "2026-11-06T10:00:01Z")).toBe(true);
  expect(hasReadMessage("2026-11-06T10:00:00Z", "2026-11-06T14:59:59+05:00")).toBe(false);
  expect(hasReadMessage("2026-11-06T10:00:00.500Z", "2026-11-06T10:00:00Z")).toBe(false);
});

it("keeps missing or invalid read timestamps unread", () => {
  for (const read of [null, undefined, "", "invalid"]) expect(hasReadMessage("2026-11-06T10:00:00Z", read)).toBe(false);
  expect(hasReadMessage("invalid", "2026-11-06T10:00:00Z")).toBe(false);
});
