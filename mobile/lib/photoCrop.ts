export const PORTRAIT_ASPECT = 3 / 4;
export const MAX_PHOTO_ZOOM = 4;
export const CROP_TOUCH_MARGIN = 16;
export type CropCorner = { left: boolean; top: boolean };
export type CropRect = { x: number; y: number; width: number; height: number };
export type PhotoTransform = { x: number; y: number; s: number };

export function initialSelection(width: number, height: number): CropRect {
  const inset = 0.08;
  return { x: width * inset, y: height * inset, width: width * (1 - 2 * inset), height: height * (1 - 2 * inset) };
}

export function cropCornerAt(width: number, height: number, x: number, y: number): CropCorner | null {
  const left = x < width / 2;
  const top = y < height / 2;
  const dx = left ? x : width - x;
  const dy = top ? y : height - y;
  if (dx < -CROP_TOUCH_MARGIN || dy < -CROP_TOUCH_MARGIN || dx > 32 || dy > 32) return null;
  return { left, top };
}

/** Keep the opposite corner fixed, including when expanding a previous selection. */
export function resizeSelection(width: number, height: number, start: CropRect, corner: CropCorner, dx: number, dy: number, imageScale: number): CropRect {
  const fixedX = corner.left ? start.x + start.width : start.x;
  const fixedY = corner.top ? start.y + start.height : start.y;
  const aspect = width / height;
  const maxWidth = Math.min(corner.left ? fixedX : width - fixedX, (corner.top ? fixedY : height - fixedY) * aspect);
  const minWidth = Math.min(maxWidth, Math.max(56, width * imageScale / MAX_PHOTO_ZOOM));
  const alongDiagonal = ((corner.left ? -dx : dx) + (corner.top ? -dy : dy) / aspect) / (1 + 1 / aspect ** 2);
  const w = Math.max(minWidth, Math.min(maxWidth, start.width + alongDiagonal));
  const h = w / aspect;
  return { x: corner.left ? fixedX - w : fixedX, y: corner.top ? fixedY - h : fixedY, width: w, height: h };
}

export function fitCropSelection(width: number, height: number, selection: CropRect, image: PhotoTransform): PhotoTransform {
  const factor = width / selection.width;
  return {
    x: (image.x + width / 2 - selection.x - selection.width / 2) * factor,
    y: (image.y + height / 2 - selection.y - selection.height / 2) * factor,
    s: image.s * factor,
  };
}

export function restoreCrop(width: number, height: number, rect: CropRect, crop?: { x: number; y: number; scale: number }): PhotoTransform {
  return {
    x: rect.x + rect.width / 2 - width / 2 + (crop?.x ?? 0) * rect.width,
    y: rect.y + rect.height / 2 - height / 2 + (crop?.y ?? 0) * rect.height,
    s: (crop?.scale ?? 1) * rect.width / width,
  };
}
