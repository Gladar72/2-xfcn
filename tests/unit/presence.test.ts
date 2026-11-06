import { expect, test } from "vitest";
import { presenceLabel } from "@/lib/people/presence";

const now = Date.parse("2026-11-06T12:00:00Z");
const ago = (minutes: number) => new Date(now - minutes * 60_000).toISOString();

test("unknown, invalid and future activity never invent an online status", () => {
  for (const value of [null, undefined, "bad", ago(-10)]) expect(presenceLabel(value, "female", now)).toBeNull();
});
test("presence expires and formats Russian time and gender", () => {
  expect(presenceLabel(ago(1), "female", now)).toBe("В сети");
  expect(presenceLabel(ago(2), "female", now)).toBe("Была 2 минуты назад");
  expect(presenceLabel(ago(11), "male", now)).toBe("Был 11 минут назад");
  expect(presenceLabel(ago(21), null, now)).toBe("В сети 21 минуту назад");
  expect(presenceLabel(ago(60), "female", now)).toBe("Была 1 час назад");
  expect(presenceLabel(ago(25 * 60), "male", now)).toBe("Был 1 день назад");
  expect(presenceLabel(ago(31 * 24 * 60), "female", now)).toBe("Была больше месяца назад");
});
