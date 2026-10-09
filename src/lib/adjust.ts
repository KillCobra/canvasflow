import type { Adjust, FilterId } from './types';

// Colour adjustments as a single 4x5 colour matrix (row-major, normalized
// 0..1 bias in the last column). The same numbers drive Skia's ColorMatrix
// on the canvas and CIColorMatrix in the native video exporter.

export type Matrix20 = number[];

export const DEFAULT_ADJUST: Adjust = { filter: 'none', exposure: 0, contrast: 0, saturation: 0, warmth: 0 };

export const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'none', label: 'Original' },
  { id: 'warm', label: 'Golden' },
  { id: 'cool', label: 'Nordic' },
  { id: 'vivid', label: 'Vivid' },
  { id: 'film', label: 'Film' },
  { id: 'fade', label: 'Matte' },
  { id: 'mono', label: 'Mono' },
  { id: 'noir', label: 'Noir' },
];

const IDENTITY: Matrix20 = [1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0];

/** a ∘ b: apply b first, then a. */
function concat(a: Matrix20, b: Matrix20): Matrix20 {
  const out = new Array<number>(20);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 5; c++) {
      let v = c === 4 ? a[r * 5 + 4] : 0;
      for (let k = 0; k < 4; k++) v += a[r * 5 + k] * b[k * 5 + c];
      out[r * 5 + c] = v;
    }
  }
  return out;
}

const scale = (r: number, g: number, b: number): Matrix20 => [r, 0, 0, 0, 0, 0, g, 0, 0, 0, 0, 0, b, 0, 0, 0, 0, 0, 1, 0];

const brightness = (k: number) => scale(k, k, k);

/** Pivot around mid-grey. */
function contrast(c: number): Matrix20 {
  const t = 0.5 * (1 - c);
  return [c, 0, 0, 0, t, 0, c, 0, 0, t, 0, 0, c, 0, t, 0, 0, 0, 1, 0];
}

function saturation(s: number): Matrix20 {
  const lr = 0.2126;
  const lg = 0.7152;
  const lb = 0.0722;
  const sr = (1 - s) * lr;
  const sg = (1 - s) * lg;
  const sb = (1 - s) * lb;
  return [sr + s, sg, sb, 0, 0, sr, sg + s, sb, 0, 0, sr, sg, sb + s, 0, 0, 0, 0, 0, 1, 0];
}

function warmth(w: number): Matrix20 {
  return scale(1 + w * 0.12, 1 + w * 0.02, 1 - w * 0.14);
}

/** Lifts blacks and lowers whites, for a matte look. */
function fade(amount: number): Matrix20 {
  const k = 1 - amount;
  return [k, 0, 0, 0, amount * 0.75, 0, k, 0, 0, amount * 0.75, 0, 0, k, 0, amount * 0.75, 0, 0, 0, 1, 0];
}

function tint(r: number, g: number, b: number): Matrix20 {
  return [1, 0, 0, 0, r, 0, 1, 0, 0, g, 0, 0, 1, 0, b, 0, 0, 0, 1, 0];
}

const PRESETS: Record<FilterId, Matrix20> = {
  none: IDENTITY,
  warm: concat(warmth(0.55), concat(saturation(1.08), contrast(1.04))),
  cool: concat(warmth(-0.5), concat(saturation(0.88), fade(0.05))),
  vivid: concat(saturation(1.35), contrast(1.12)),
  film: concat(tint(0.02, 0.0, -0.025), concat(fade(0.09), concat(saturation(0.85), contrast(1.06)))),
  fade: concat(fade(0.16), saturation(0.8)),
  mono: saturation(0),
  noir: concat(contrast(1.35), saturation(0)),
};

/** Combined matrix for an adjustment, or null when it changes nothing. */
export function adjustMatrix(a?: Adjust | null): Matrix20 | null {
  if (!a) return null;
  if (a.filter === 'none' && !a.exposure && !a.contrast && !a.saturation && !a.warmth) return null;
  let m = PRESETS[a.filter] ?? IDENTITY;
  if (a.exposure) m = concat(brightness(Math.pow(2, a.exposure)), m);
  if (a.contrast) m = concat(contrast(1 + a.contrast * 0.6), m);
  if (a.saturation) m = concat(saturation(1 + a.saturation), m);
  if (a.warmth) m = concat(warmth(a.warmth), m);
  return m;
}
