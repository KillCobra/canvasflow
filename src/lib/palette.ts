import { AlphaType, ColorType, Skia } from '@shopify/react-native-skia';

// Colour helpers shared by the brand kit and recolouring: parsing, luminance,
// contrast, and pulling a palette out of a photo or logo.

export type RGB = [number, number, number];

/** #RGB, #RRGGBB or #RRGGBBAA -> [r, g, b] in 0..255 plus alpha 0..1, or null. */
export function parseHex(hex: string): { rgb: RGB; alpha: number } | null {
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex.trim());
  if (!m) return null;
  const h = m[1].length === 3 ? [...m[1]].map((c) => c + c).join('') : m[1];
  const n = (i: number) => parseInt(h.slice(i, i + 2), 16);
  return { rgb: [n(0), n(2), n(4)], alpha: h.length === 8 ? n(6) / 255 : 1 };
}

const hex2 = (v: number) =>
  Math.round(Math.max(0, Math.min(255, v)))
    .toString(16)
    .padStart(2, '0');

export const toHex = ([r, g, b]: RGB, alpha = 1) =>
  `#${hex2(r)}${hex2(g)}${hex2(b)}${alpha < 1 ? hex2(alpha * 255) : ''}`.toUpperCase();

/** WCAG relative luminance, 0 (black) .. 1 (white). */
export function luminance([r, g, b]: RGB) {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

export function contrast(a: RGB, b: RGB) {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** HSL saturation, 0..1: how far from grey a colour is. */
export function saturation([r, g, b]: RGB) {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  if (max === min) return 0;
  return l > 0.5 ? (max - min) / (2 - max - min) : (max - min) / (max + min);
}

export const distance = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The main colours of an image, most common first. The image is shrunk to a
 * thumbnail, transparent pixels are skipped (so a logo gives its ink, not its
 * background), and similar colours are merged.
 */
export async function paletteFromImage(uri: string, count = 6): Promise<string[]> {
  const data = await Skia.Data.fromURI(uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) return [];
  const S = 48;
  const surface = Skia.Surface.Make(S, S);
  if (!surface) {
    image.dispose();
    return [];
  }
  const paint = Skia.Paint();
  surface
    .getCanvas()
    .drawImageRect(image, Skia.XYWHRect(0, 0, image.width(), image.height()), Skia.XYWHRect(0, 0, S, S), paint);
  surface.flush();
  const snapshot = surface.makeImageSnapshot();
  const pixels = snapshot.readPixels(0, 0, {
    width: S,
    height: S,
    colorType: ColorType.RGBA_8888,
    alphaType: AlphaType.Unpremul,
  });
  snapshot.dispose();
  image.dispose();
  if (!pixels) return [];

  const points: RGB[] = [];
  const scale = pixels instanceof Float32Array ? 255 : 1;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] * scale < 128) continue;
    points.push([pixels[i] * scale, pixels[i + 1] * scale, pixels[i + 2] * scale]);
  }
  return kMeans(points, Math.max(count + 2, 8))
    .filter((c) => c.size > points.length * 0.01)
    .reduce<{ rgb: RGB; size: number }[]>((kept, c) => {
      const near = kept.find((k) => distance(k.rgb, c.rgb) < 34);
      if (near) near.size += c.size;
      else kept.push({ ...c });
      return kept;
    }, [])
    .sort((a, b) => b.size - a.size)
    .slice(0, count)
    .map((c) => toHex(c.rgb));
}

/** Plain k-means, seeded across the luminance range so dark and light both get a centre. */
function kMeans(points: RGB[], k: number) {
  if (!points.length) return [];
  const sorted = [...points].sort((a, b) => luminance(a) - luminance(b));
  let centres: RGB[] = Array.from({ length: k }, (_, i) => sorted[Math.floor(((i + 0.5) / k) * sorted.length)]);
  let sizes = new Array<number>(k).fill(0);
  for (let iter = 0; iter < 10; iter++) {
    const sums = centres.map(() => [0, 0, 0]);
    sizes = new Array<number>(k).fill(0);
    for (const p of points) {
      let best = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = distance(p, centres[c]);
        if (d < bestD) {
          bestD = d;
          best = c;
        }
      }
      sizes[best]++;
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
    }
    centres = centres.map((c, i) => (sizes[i] ? [sums[i][0] / sizes[i], sums[i][1] / sizes[i], sums[i][2] / sizes[i]] : c));
  }
  return centres.map((rgb, i) => ({ rgb, size: sizes[i] }));
}
