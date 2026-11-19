import { expect, it } from "vitest";
import { dragCropCorner, fitCropSelection, PORTRAIT_ASPECT } from "../../mobile/lib/photoCrop";

for (const left of [true, false]) {
  for (const top of [true, false]) {
    it(`keeps the opposite corner fixed when cropping from ${top ? "top" : "bottom"} ${left ? "left" : "right"}`, () => {
      const rect = dragCropCorner(300, 400, { left, top }, left ? 75 : -75, top ? 100 : -100, 1);
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
  expect(dragCropCorner(300, 400, corner, 2000, 900, 2)).toEqual({ x: 150, y: 200, width: 150, height: 200 });
  expect(dragCropCorner(300, 400, corner, -200, -90, 1)).toEqual({ x: 0, y: 0, width: 300, height: 400 });
});
