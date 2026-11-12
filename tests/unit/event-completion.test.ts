import { afterEach, expect, it, vi } from "vitest";
vi.mock("@/lib/push/expo", () => ({ sendPushPersonal: vi.fn() }));
import { completeDueEvents } from "@/lib/reviews/complete-due-events";

afterEach(() => { vi.useRealTimers(); });
it("a meeting rescheduled after the cron read cannot be completed using its old revision", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-12T10:00:00Z"));
  const expected = "2026-11-11T00:00:00Z";
  const filters: [string, unknown][] = [];
  const tables: string[] = [];
  const from = (table: string) => {
    tables.push(table); let updating = false;
    const query: any = {
      select: () => query, in: () => query, lte: () => query,
      eq: (key: string, value: unknown) => { filters.push([key, value]); return query; },
      update: () => { updating = true; return query; },
      then: (resolve: (value: unknown) => unknown) => Promise.resolve({ data: updating
        ? filters.some(([key, value]) => key === "updated_at" && value === expected) ? [] : [{ id: "rescheduled" }]
        : [{ id: "rescheduled", title: "Тренировка", event_date: "2026-11-11", event_time: "18:00:00", event_end_time: "20:00:00", city: "Тюмень", updated_at: expected }], error: null }).then(resolve),
    };
    return query;
  };
  expect(await completeDueEvents({ from } as unknown as Parameters<typeof completeDueEvents>[0])).toEqual([]);
  expect(filters).toContainEqual(["updated_at", expected]);
  expect(tables).not.toContain("notifications");
});
it("an unavailable database is reported instead of a successful empty cron run", async () => {
  const q: any = { select: () => q, in: () => q, lte: async () => ({ data: null, error: new Error("unavailable") }) };
  await expect(completeDueEvents({ from: () => q } as unknown as Parameters<typeof completeDueEvents>[0])).rejects.toThrow("unavailable");
});
