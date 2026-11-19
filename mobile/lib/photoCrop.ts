export const PORTRAIT_ASPECT = 3 / 4;
export const MAX_PHOTO_ZOOM = 4;

export type CropCorner = { left: boolean; top: boolean };
export type CropRect = { x: number; y: number; width: number; height: number };

/** Project the dragged corner onto the diagonal to keep the opposite corner fixed. */
export function dragCropCorner(width: number, height: number, corner: CropCorner, dx: number, dy: number, zoom: number): CropRect {
  const inwardX = corner.left ? dx : -dx;
  const inwardY = corner.top ? dy : -dy;
  const shrink = (inwardX * width + inwardY * height) / (width * width + height * height);
  const fraction = Math.min(1, Math.max(zoom / MAX_PHOTO_ZOOM, 1 - shrink));
  return {
    x: corner.left ? width * (1 - fraction) : 0,
    y: corner.top ? height * (1 - fraction) : 0,
    width: width * fraction,
    height: height * fraction,
  };
}

export function fitCropSelection(width: number, height: number, selection: CropRect, image: { x: number; y: number; s: number }) {
  const factor = width / selection.width;
  return {
    x: (image.x + width / 2 - selection.x - selection.width / 2) * factor,
    y: (image.y + height / 2 - selection.y - selection.height / 2) * factor,
    s: image.s * factor,
  };
}
