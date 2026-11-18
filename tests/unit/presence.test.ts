import { expect, test } from "vitest";
import { presenceLabel } from "@/lib/people/presence";

const now = Date.parse("2026-11-06T12:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

test("unknown, invalid and future activity never invent an online status", () => {
  for (const value of [null, undefined, "bad", ago(-10)]) expect(presenceLabel(value, "female", now)).toBeNull();
});
test("online expires at two minutes, then shows a gendered local date and time", () => {
  const now = new Date(2026, 10, 18, 11, 0).getTime();
  const at = (day: number) => new Date(2026, 10, day, 9, 5).toISOString();
  expect(presenceLabel(new Date(now - 119999).toISOString(), "female", now)).toBe("Онлайн");
  expect(presenceLabel(new Date(now - 120000).toISOString(), "female", now)).toBe("Была в сети сегодня в 10:58");
  expect(presenceLabel(at(17), "male", now)).toBe("Был в сети вчера в 09:05");
  expect(presenceLabel(at(18), null, now)).toBe("Последний визит сегодня в 09:05");
  expect(presenceLabel(at(8), "female", now)).toMatch(/^Была в сети 8 нояб?.? в 09:05$/);
  expect(presenceLabel(new Date(2025, 10, 2, 19, 5).toISOString(), "male", now)).toContain("2025");
});
