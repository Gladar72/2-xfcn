import { expect, it } from "vitest";
import { ADDRESS_ZOOM, clusterize, groupLocations, markerMode, photoOffset } from "../../mobile/lib/cluster";

import { addressSchedule } from "../../mobile/lib/addressSchedule";
import type { MapEvent } from "../../mobile/lib/types";

const first = { id: "a", address: "Тюмень, Ямская улица, 22", lat: 57.151, lng: 65.50 };
const same = { id: "b", address: "ул. Ямская, д. 22", lat: 57.15105, lng: 65.5001 };
const other = { id: "c", address: "Ямская, 24", lat: 57.151, lng: 65.502 };

it("keeps both events at one address through zoom in, zoom out, and reordered results", () => {
  const locations = groupLocations([same, other, first], "Тюмень");
  expect(locations).toEqual(groupLocations([first, same, other], "Тюмень"));
  for (const zoom of [8, 14, 18, 20, 14, 8]) {
    const groups = clusterize(locations, zoom);
    const pair = groups.find(g => g.items.some(e => e.id === "a"))!;
    expect(pair.items.map(e => e.id)).toContain("b");
    expect([pair.lng, pair.lat]).toEqual([first.lng, first.lat]);
    expect(groups.flatMap(g => g.items)).toHaveLength(3);
  }
  expect(clusterize(locations, 8)).toHaveLength(1);
  expect(clusterize(locations, 20).map(g => g.items.length)).toEqual([2, 1]);
});

it("groups identical coordinates without an address and keeps other private points approximate", () => {
  const group = groupLocations([first, { ...first, address: null, id: "d" }, { ...same, organizerHidden: true }]);
  expect(clusterize(group, 20).map(g => g.items.length)).toEqual([2, 1]);
});

it("reveals neighbouring addresses at street zoom and keeps one exact anchor for photos at the same venue", () => {
  const neighbour = { ...other, lng: first.lng + 0.00001 };
  const addresses = groupLocations([first, same, neighbour], "Тюмень");
  expect(clusterize(addresses, ADDRESS_ZOOM - 0.25)).toHaveLength(1);
  expect(clusterize(addresses, ADDRESS_ZOOM).map(g => [g.lng, g.lat, g.items.map(e => e.id)])).toEqual([
    [first.lng, first.lat, ["a", "b"]],
    [neighbour.lng, neighbour.lat, ["c"]],
  ]);
  expect(clusterize(addresses, ADDRESS_ZOOM - 1)).toHaveLength(1);
});

it("shows all five pins, a schedule for six or forty, and zooms a multi-building group", () => {
  for (const count of [1, 2, 3, 4, 5, 6, 40]) {
    const items = Array.from({ length: count }, (_, i) => ({ ...first, id: `event-${i}` }));
    const locations = groupLocations([...items, { ...other, lng: first.lng + 0.00005 }]);
    for (const zoom of [16, 18, 20]) {
      const address = clusterize(locations, zoom).find(g => g.items.some(e => e.id === "event-0"))!;
      expect(address.items).toHaveLength(count);
      expect(markerMode(address, zoom)).toBe(count > 5 ? "schedule" : "photos");
      expect(address.items.every(e => e.address === first.address)).toBe(true);
      if (count <= 5) {
        const offsets = address.items.map((_, i) => photoOffset(count, i, zoom).join(","));
        expect(new Set(offsets).size).toBe(count);
      }
    }
    expect(markerMode(clusterize(locations, 10)[0], 10)).toBe("zoom");
    if (count > 5) expect(markerMode(locations.find(g => g.items.length === count)!, 10)).toBe("schedule");
  }
});

it("keeps distinct named addresses separate even if their saved coordinates coincide", () => {
  const groups = groupLocations([first, { ...first, address: other.address, id: "other" }]);
  expect(groups.map(g => g.items.length)).toEqual([1, 1]);
});

it("lists all forty events once, ordered by venue-local date and time across midnight", () => {
  const now = Date.parse("2026-11-18T17:15:00Z");
  const events: MapEvent[] = Array.from({ length: 40 }, (_, i) => ({
    id: String(i), title: "Встреча", startsAt: new Date(now + i * 3600000).toISOString(), endsAt: "",
    latitude: 57, longitude: 65, utcOffset: 5, seatsLeft: 1, isBusiness: true, placeName: "FORMA", organizer: null,
  }));
  const sections = addressSchedule([...events].reverse(), now);
  expect(sections.map(s => s.title)).toEqual(["Сегодня", "Завтра", "20 ноября"]);
  expect(sections.flatMap(s => s.data.map(row => row.event.id))).toEqual(events.map(e => e.id));
  expect(sections[1].data[0].time).toBe("00:15");
});
