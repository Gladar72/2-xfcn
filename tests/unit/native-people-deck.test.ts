import { expect, it } from "vitest";
import { appendPeople } from "../../mobile/lib/peopleDeck";
const cards = (...ids: string[]) => ids.map(id => ({ id }));
it("keeps first-seen order within and across overlapping pages", () => {
  const first = appendPeople([], cards("a", "a", "b"), new Set());
  expect(appendPeople(first, cards("b", "c", "c", "d"), new Set(["a"]))).toEqual(cards("a", "b", "c", "d"));
});
it("does not reintroduce a swiped or blocked profile when filters reload", () => {
  expect(appendPeople([], cards("c", "b", "a", "b", "d"), new Set(["b", "c"]))).toEqual(cards("a", "d"));
});
