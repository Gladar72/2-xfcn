import { expect, it } from "vitest";
import { cropCornerAt, resizeSelection, restoreCrop, initialSelection, fitCropSelection, PORTRAIT_ASPECT } from "../../mobile/lib/photoCrop";

const full = { x: 0, y: 0, width: 300, height: 400 };

for (const left of [true, false]) {
  for (const top of [true, false]) {
    it(`keeps the opposite corner fixed when cropping from ${top ? "top" : "bottom"} ${left ? "left" : "right"}`, () => {
      const rect = resizeSelection(300, 400, full, { left, top }, left ? 75 : -75, top ? 100 : -100, 1);
      expect(rect).toEqual({ x: left ? 75 : 0, y: top ? 100 : 0, width: 225, height: 300 });
      expect(rect.width / rect.height).toBe(PORTRAIT_ASPECT);
      const before = { x: 30, y: -10, s: 1.5 };
      const after = fitCropSelection(300, 400, rect, before);
      for (const [x, y] of [[0, 0], [1, 1]]) {
        expect((300 * x - 150 - after.x) / after.s).toBeCloseTo((rect.x + rect.width * x - 150 - before.x) / before.s);
        expect((400 * y - 200 - after.y) / after.s).toBeCloseTo((rect.y + rect.height * y - 200 - before.y) / before.s);
      }
    });
  }
}
it("clamps extreme drags to the remaining zoom range and keeps outward drags inside the image", () => {
  const corner = { left: true, top: true };
  expect(resizeSelection(300, 400, full, corner, 2000, 900, 2)).toEqual({ x: 150, y: 200, width: 150, height: 200 });
  expect(resizeSelection(300, 400, full, corner, -200, -90, 1)).toEqual({ x: 0, y: 0, width: 300, height: 400 });
});

it("accepts the first touch on either side of every visible crop handle", () => {
  for (const x of [-16, 0, 24, 276, 300, 316]) {
    for (const y of [-16, 0, 24, 376, 400, 416]) {
      expect(cropCornerAt(300, 400, x, y)).toEqual({ left: x < 150, top: y < 200 });
    }
  }
  expect(cropCornerAt(300, 400, -17, 0)).toBeNull();
  expect(cropCornerAt(300, 400, 150, 0)).toBeNull();
  expect(cropCornerAt(300, 400, 0, 200)).toBeNull();
  expect(cropCornerAt(300, 400, 150, 200)).toBeNull();
});

it("can pull each visible corner out on first contact and back in on the next gesture", () => {
  const initial = initialSelection(300, 400);
  for (const left of [false, true]) for (const top of [false, true]) {
    const corner = { left, top };
    const outward = resizeSelection(300, 400, initial, corner, left ? -12 : 12, top ? -16 : 16, .84);
    expect(outward.width).toBeGreaterThan(initial.width);
    const inside = resizeSelection(300, 400, outward, corner, left ? 45 : -45, top ? 60 : -60, .9);
    expect(inside.width).toBeLessThan(initial.width);
    expect(inside.height / inside.width).toBeCloseTo(4 / 3);
    const back = resizeSelection(300, 400, inside, corner, left ? -45 : 45, top ? -60 : 60, .9);
    expect(back).toEqual(outward);
  }
});

it("does not crop away the margins when saving without edits or reopening a saved composition", () => {
  const rect = initialSelection(300, 400);
  for (const crop of [{ x: 0, y: 0, scale: 1 }, { x: 0.25, y: -0.125, scale: 2 }]) {
    const image = restoreCrop(300, 400, rect, crop);
    const exported = fitCropSelection(300, 400, rect, image);
    expect(exported.x / 300).toBeCloseTo(crop.x);
    expect(exported.y / 400).toBeCloseTo(crop.y);
    expect(exported.s).toBeCloseTo(crop.scale);
  }
});
