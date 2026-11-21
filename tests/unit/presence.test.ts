import { expect, test } from "vitest";
import { profileIsOnline } from "@/lib/people/presence";

test("activity expires at two minutes without exposing a date in the profile", () => {
  const seen = "2026-11-19T10:00:00.000123Z";
  const now = Date.parse("2026-11-19T10:00:00Z");
  expect(profileIsOnline(seen, now + 119_999)).toBe(true);
  expect(profileIsOnline(seen, now + 120_000)).toBe(false);
  expect(profileIsOnline(seen, now - 60_001)).toBe(false);
  expect(profileIsOnline(null, now)).toBe(false);
  expect(profileIsOnline("bad", now)).toBe(false);
});
