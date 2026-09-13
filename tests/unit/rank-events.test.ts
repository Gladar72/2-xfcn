import { describe, it, expect } from "vitest";
import { scoreEvent, rankEvents, type EventForScoring } from "@/lib/scoring/rank-events";

const NOW = new Date("2026-09-13T12:00:00Z");

function baseEvent(overrides: Partial<EventForScoring> = {}): EventForScoring {
  return {
    id: "1",
    createdAt: NOW.toISOString(),
    eventDate: "2026-09-14",
    eventTime: "18:00:00",
    seatsTotal: 4,
    seatsTaken: 2,
    boostedAt: null,
    organizerPlan: null,
    categorySlug: "coffee",
    trainingTypeSlug: null,
    latitude: null,
    longitude: null,
    ...overrides,
  };
}

describe("scoreEvent", () => {
  it("даёт более высокий скор недавно поднятой встрече", () => {
    const boosted = baseEvent({ boostedAt: NOW.toISOString() });
    const notBoosted = baseEvent();

    expect(scoreEvent(boosted, { now: NOW })).toBeGreaterThan(scoreEvent(notBoosted, { now: NOW }));
  });

  it("не даёт бонус за поднятие, если оно было слишком давно", () => {
    const oldBoost = baseEvent({
      boostedAt: new Date(NOW.getTime() - 72 * 60 * 60 * 1000).toISOString(), // 72ч назад
    });
    const noBoost = baseEvent();

    // Разница должна быть незначительной — окно буста истекло
    const diff = scoreEvent(oldBoost, { now: NOW }) - scoreEvent(noBoost, { now: NOW });
    expect(diff).toBeCloseTo(0, 1);
  });

  it("PREMIUM даёт лишь небольшой бонус, релевантный START может быть выше", () => {
    const premiumButIrrelevant = baseEvent({
      organizerPlan: "premium",
      categorySlug: "walk", // не совпадает с интересами зрителя
    });
    const startButRelevant = baseEvent({
      organizerPlan: "start",
      categorySlug: "coffee",
      seatsTaken: 2,
      seatsTotal: 4, // хорошая заполненность
    });

    const ctx = { now: NOW, viewerInterestSlugs: ["coffee"] };

    expect(scoreEvent(startButRelevant, ctx)).toBeGreaterThan(scoreEvent(premiumButIrrelevant, ctx));
  });

  it("учитывает совпадение интересов зрителя", () => {
    const matching = baseEvent({ categorySlug: "coffee" });
    const nonMatching = baseEvent({ categorySlug: "walk" });
    const ctx = { now: NOW, viewerInterestSlugs: ["coffee"] };

    expect(scoreEvent(matching, ctx)).toBeGreaterThan(scoreEvent(nonMatching, ctx));
  });

  it("приближает более близкие по расстоянию встречи", () => {
    const near = baseEvent({ latitude: 57.15, longitude: 65.53 }); // Тюмень
    const far = baseEvent({ latitude: 55.75, longitude: 37.62 }); // Москва
    const ctx = { now: NOW, viewerLatitude: 57.15, viewerLongitude: 65.53 };

    expect(scoreEvent(near, ctx)).toBeGreaterThan(scoreEvent(far, ctx));
  });

  it("отдаёт предпочтение встречам с оптимальной заполненностью мест", () => {
    const wellFilled = baseEvent({ seatsTotal: 10, seatsTaken: 5 }); // 50%
    const almostEmpty = baseEvent({ seatsTotal: 10, seatsTaken: 0 }); // 0%

    expect(scoreEvent(wellFilled, { now: NOW })).toBeGreaterThan(scoreEvent(almostEmpty, { now: NOW }));
  });
});

describe("rankEvents", () => {
  it("сортирует по убыванию скора", () => {
    const events = [
      baseEvent({ id: "low", categorySlug: "walk" }),
      baseEvent({ id: "high", boostedAt: NOW.toISOString() }),
    ];

    const ranked = rankEvents(events, { now: NOW });
    expect(ranked[0]?.id).toBe("high");
  });
});
