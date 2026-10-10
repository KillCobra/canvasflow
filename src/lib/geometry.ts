import type { FrameShape, Layer, PhotoLayer } from './types';

/** Axis-aligned bounds of a layer after scale and rotation, in canvas coordinates. */
export function bounds(l: Pick<Layer, 'x' | 'y' | 'w' | 'h' | 'scale' | 'rotation'>) {
  const c = Math.abs(Math.cos(l.rotation));
  const s = Math.abs(Math.sin(l.rotation));
  const hw = ((l.w * c + l.h * s) * l.scale) / 2;
  const hh = ((l.w * s + l.h * c) * l.scale) / 2;
  return { left: l.x - hw, right: l.x + hw, top: l.y - hh, bottom: l.y + hh };
}

export const DEFAULT_CROP = { x: 0, y: 0, zoom: 1 };

/**
 * Where to draw a photo inside its w x h frame (relative to the frame's
 * center): cover-fit, then zoomed and offset by the layer's crop.
 */
export function cropRect(
  aspect: number,
  w: number,
  h: number,
  crop: PhotoLayer['crop'] = DEFAULT_CROP,
) {
  const cover = aspect > w / h ? { iw: h * aspect, ih: h } : { iw: w, ih: w / aspect };
  const iw = cover.iw * crop.zoom;
  const ih = cover.ih * crop.zoom;
  const ox = (iw - w) / 2;
  const oy = (ih - h) / 2;
  return { x: -iw / 2 + crop.x * ox, y: -ih / 2 + crop.y * oy, width: iw, height: ih, ox, oy };
}

/** Layers that show on slide `index` at all (empty template slots excluded when `skipEmpty`). */
export function layersOnSlide<T extends Layer>(layers: T[], index: number, slideWidth: number, skipEmpty = false) {
  const start = index * slideWidth;
  const end = start + slideWidth;
  return layers.filter((l) => {
    if (skipEmpty && l.type === 'photo' && !l.src) return false;
    const b = bounds(l);
    return b.right > start && b.left < end;
  });
}

/** The slide a layer sits entirely on, or -1 if it spans a seam. */
export function homeSlide(l: Layer, slideWidth: number) {
  const b = bounds(l);
  const k = Math.floor(l.x / slideWidth);
  return b.left >= k * slideWidth - 2 && b.right <= (k + 1) * slideWidth + 2 ? k : -1;
}

/**
 * Frames drawn as a card or strip with the photo in an inset window
 * (polaroid, taped print, film strip, postage stamp).
 */
export const isCardFrame = (f: FrameShape | undefined) =>
  f === 'polaroid' || f === 'taped' || f === 'film' || f === 'stamp';

/** Thickness of a film strip's sprocket bands, which run along its long side. */
export const filmBand = (w: number, h: number) => Math.min(w, h) * 0.13;

/** Radius of a stamp's perforation bites. */
export const stampBite = (w: number, h: number) => Math.max(3, Math.min(w, h) * 0.022);

/** Where the image sits inside a photo frame (local coords). Card frames inset it. */
export function frameInner(l: Pick<PhotoLayer, 'w' | 'h' | 'frame'>) {
  const x = -l.w / 2;
  const y = -l.h / 2;
  const min = Math.min(l.w, l.h);
  if (l.frame === 'polaroid' || l.frame === 'taped') {
    const m = min * 0.06;
    const bottom = Math.min(l.h * 0.24, m * 3.6);
    return { x: x + m, y: y + m, width: l.w - m * 2, height: l.h - m - bottom };
  }
  if (l.frame === 'film') {
    const band = filmBand(l.w, l.h);
    const side = min * 0.03;
    return l.w >= l.h
      ? { x: x + side, y: y + band, width: l.w - side * 2, height: l.h - band * 2 }
      : { x: x + band, y: y + side, width: l.w - band * 2, height: l.h - side * 2 };
  }
  if (l.frame === 'stamp') {
    // Paper margin past the perforation.
    const m = stampBite(l.w, l.h) + min * 0.06;
    return { x: x + m, y: y + m, width: l.w - m * 2, height: l.h - m * 2 };
  }
  return { x, y, width: l.w, height: l.h };
}

/** Image rect for a photo, cover-fit into its frame's inner area and offset by the crop. */
export function photoImageRect(l: Pick<PhotoLayer, 'w' | 'h' | 'frame' | 'aspect' | 'crop'>) {
  const inner = frameInner(l);
  const r = cropRect(l.aspect, inner.width, inner.height, l.crop);
  const cx = inner.x + inner.width / 2;
  const cy = inner.y + inner.height / 2;
  return { ...r, x: r.x + cx, y: r.y + cy, inner };
}

/** Height of an arch frame's rounded cap. */
export const archCap = (w: number, h: number) => Math.min(w / 2, h);

/** Live offset applied to every layer of a multi-selection while it's being dragged. */
export type GroupDelta = {
  dx: number;
  dy: number;
  scale: number;
  rotation: number;
  cx: number;
  cy: number;
  /** Document version the delta applies to; once the doc changes the delta is stale. */
  stamp: number;
};

export const NO_DELTA: GroupDelta = { dx: 0, dy: 0, scale: 1, rotation: 0, cx: 0, cy: 0, stamp: -1 };

/** A layer's transform after a group move/scale/rotate about (cx, cy). */
export function applyGroupDelta<T extends Pick<Layer, 'x' | 'y' | 'scale' | 'rotation'>>(l: T, d: GroupDelta) {
  'worklet';
  const px = l.x - d.cx;
  const py = l.y - d.cy;
  const c = Math.cos(d.rotation) * d.scale;
  const s = Math.sin(d.rotation) * d.scale;
  return {
    x: d.cx + px * c - py * s + d.dx,
    y: d.cy + px * s + py * c + d.dy,
    scale: l.scale * d.scale,
    rotation: l.rotation + d.rotation,
  };
}

/** Faces of a photo that are actually visible, as canvas-space boxes. */
export function faceBoxes(l: PhotoLayer) {
  if (!l.faces?.length || !l.src) return [];
  const img = photoImageRect(l);
  const { inner } = img;
  const cos = Math.cos(l.rotation) * l.scale;
  const sin = Math.sin(l.rotation) * l.scale;
  const out: { left: number; right: number; top: number; bottom: number }[] = [];
  for (const f of l.faces) {
    // Face rect in local coords, clipped to the visible frame.
    const x0 = Math.max(inner.x, img.x + f.x * img.width);
    const y0 = Math.max(inner.y, img.y + f.y * img.height);
    const x1 = Math.min(inner.x + inner.width, img.x + (f.x + f.width) * img.width);
    const y1 = Math.min(inner.y + inner.height, img.y + (f.y + f.height) * img.height);
    if (x1 - x0 < 4 || y1 - y0 < 4) continue;
    const pts = [
      [x0, y0],
      [x1, y0],
      [x0, y1],
      [x1, y1],
    ].map(([px, py]) => [l.x + px * cos - py * sin, l.y + px * sin + py * cos]);
    out.push({
      left: Math.min(...pts.map((p) => p[0])),
      right: Math.max(...pts.map((p) => p[0])),
      top: Math.min(...pts.map((p) => p[1])),
      bottom: Math.max(...pts.map((p) => p[1])),
    });
  }
  return out;
}
