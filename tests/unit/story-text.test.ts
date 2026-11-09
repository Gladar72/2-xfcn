import { describe, expect, it } from "vitest";
import { storyMeta } from "@/lib/events/story-text";

describe("public story details", () => {
  const meeting = {
    placeName: "Арена", address: "Россия, Тюмень, улица Ленина, 10", city: "Тюмень",
    seatsTaken: 0, seatsTotal: 3,
  };

  it("includes the venue, street and host when sharing a new meeting", () => {
    expect(storyMeta(meeting)).toBe("Арена, улица Ленина, 10 · 1 из 4");
  });

  it("counts the host exactly once in partial and full personal meetings", () => {
    expect(storyMeta({ ...meeting, seatsTaken: 1 })).toContain("2 из 4");
    expect(storyMeta({ ...meeting, seatsTaken: 3 })).toContain("4 из 4");
  });

  it("does not count a business as an attending person", () => {
    expect(storyMeta({ ...meeting, isBusiness: true })).toContain("0 из 3");
    expect(storyMeta({ ...meeting, isBusiness: true, seatsTaken: 3 })).toContain("3 из 3");
  });

  it("keeps the private venue and address out of anonymous exports", () => {
    expect(storyMeta({ ...meeting, isAnonymous: true })).toBe("место после одобрения · 1 из 4");
  });

  it("does not repeat a venue already in the address or a map placeholder", () => {
    expect(storyMeta({ ...meeting, address: "Тюмень, Арена, улица Ленина, 10" })).toBe("Арена, улица Ленина, 10 · 1 из 4");
    expect(storyMeta({ ...meeting, placeName: "Точка на карте" })).toBe("улица Ленина, 10 · 1 из 4");
  });

  it("keeps long addresses and attendance intact", () => {
    const address = "улица имени Николая Фёдоровича Семёнова, 123, корпус 2";
    expect(storyMeta({ ...meeting, address })).toBe(`Арена, ${address} · 1 из 4`);
  });
});
