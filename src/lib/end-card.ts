import type { BrandProfile } from './brand';
import { type RGB, contrast, luminance, parseHex, saturation } from './palette';
import { measureText } from './text';
import { type FontId, type Layer, type PhotoLayer, SLIDE_WIDTH, type TextLayer, uid } from './types';

// The brand end card: a last slide with the logo, name, handle, a "follow"
// pill and the website, in the brand's fonts and colours. Laid out on slide
// `slide` of a carousel whose slides are `H` tall over a `background` colour.

type Kit = { colors: string[]; fonts: FontId[]; profile: BrandProfile };

const DARK: RGB = [22, 18, 11];
const LIGHT: RGB = [247, 245, 240];

const hex = ([r, g, b]: RGB) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/** The kit colour (or near-black/white) that reads best on `bg`, preferring the kit's own. */
function inkOn(bg: RGB, kit: RGB[]) {
  const own = kit.filter((c) => contrast(c, bg) >= 4.5).sort((a, b) => contrast(b, bg) - contrast(a, bg))[0];
  return own ?? (contrast(DARK, bg) > contrast(LIGHT, bg) ? DARK : LIGHT);
}

export function endCardLayers({
  slide,
  H,
  background,
  kit,
  logo,
}: {
  slide: number;
  H: number;
  background: string;
  kit: Kit;
  /** An imported copy of the brand logo in the project, if there is one. */
  logo?: { src: string; aspect: number };
}): Layer[] {
  const bg = parseHex(background)?.rgb ?? LIGHT;
  const colors = kit.colors.map((c) => parseHex(c)?.rgb).filter((c): c is RGB => !!c);
  const ink = inkOn(bg, colors);
  // The pill: the strongest brand accent that stands out from the page.
  const accent =
    colors
      .filter((c) => saturation(c) > 0.2 && contrast(c, bg) > 1.6)
      .sort((a, b) => saturation(b) - saturation(a))[0] ?? ink;
  const pillInk = luminance(accent) > 0.45 ? DARK : LIGHT;

  const heading: FontId = kit.fonts[0] ?? 'editorial';
  const body: FontId = kit.fonts[1] ?? kit.fonts[0] ?? 'sans';
  const { name, handle, website, tagline } = kit.profile;
  const cx = slide * SLIDE_WIDTH + SLIDE_WIDTH / 2;
  const layers: Layer[] = [];

  const text = (value: string, font: FontId, size: number, color: RGB, y: number, extra: Partial<TextLayer> = {}): TextLayer => {
    const values = {
      text: value,
      font,
      size,
      color: hex(color),
      align: 'center' as const,
      fill: null as string | null,
      ...extra,
    };
    return { id: uid(), type: 'text', ...values, ...measureText(values), x: cx, y, scale: 1, rotation: 0, opacity: 1 };
  };

  let y = H * (logo ? 0.3 : 0.36);
  if (logo) {
    const maxW = SLIDE_WIDTH * 0.42;
    const maxH = H * 0.2;
    const box = logo.aspect > maxW / maxH ? { w: maxW, h: maxW / logo.aspect } : { w: maxH * logo.aspect, h: maxH };
    const layer: PhotoLayer = {
      id: uid(),
      type: 'photo',
      src: logo.src,
      aspect: logo.aspect,
      x: cx,
      y,
      ...box,
      scale: 1,
      rotation: 0,
      opacity: 1,
      radius: 0,
      border: 0,
      borderColor: '#FFFFFF',
      cutout: true,
    };
    layers.push(layer);
    y += box.h / 2 + H * 0.1;
  }

  layers.push(text(name || 'Thanks for reading', heading, name.length > 14 ? 92 : 116, ink, y));
  y += H * 0.1;
  if (handle) {
    layers.push(text(`@${handle}`, body, 48, ink, y));
    y += H * 0.08;
  } else if (tagline) {
    layers.push(text(tagline, body, 42, ink, y));
    y += H * 0.08;
  }
  layers.push(
    text('Follow for more', body, 46, pillInk, Math.max(y + H * 0.06, H * 0.7), {
      fill: hex(accent),
      fillStyle: 'pill',
    }),
  );
  if (website) layers.push({ ...text(website, 'mono', 32, ink, H * 0.88), opacity: 0.75 });
  return layers;
}
