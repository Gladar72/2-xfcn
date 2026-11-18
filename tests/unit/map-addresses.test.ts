import { expect, it } from "vitest";
import { ADDRESS_ZOOM, clusterize, groupLocations } from "../../mobile/lib/cluster";

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
