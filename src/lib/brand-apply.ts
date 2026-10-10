import type { BrandProfile } from './brand';
import { type RGB, contrast, distance, luminance, parseHex, saturation, toHex } from './palette';
import { tex } from './template-kit';
import { measureText } from './text';
import { ASPECTS, type Background, type Doc, type FontId, type Layer, SLIDE_WIDTH, canvasSize } from './types';

// "Apply brand kit": recolours a carousel with the brand's colours, swaps its
// type for the brand fonts and fills in the brand's handle, as one edit.
//
// Colours are matched by role rather than one by one. The carousel's colours
// are grouped and weighed by how much of the canvas they cover, then split
// into neutrals (paper, ink) and accents. Neutrals go to the brand neutral of
// the closest tone, so a light page stays light; accents go to the brand's
// accent colours, biggest first. Variations rotate the accents and, when the
// brand has a strong colour, try it as the background. A last pass keeps every
// piece of text readable against what it sits on.

export type BrandKit = { colors: string[]; fonts: FontId[]; profile: BrandProfile };
export type ApplyOptions = { colors: boolean; fonts: boolean; details: boolean; variant: number };

export type ApplyResult = {
  doc: Doc;
  /** The carousel's main colours and what they became, for the preview swatches. */
  swaps: { from: string; to: string }[];
  changed: number;
};

type Tone = { rgb: RGB; weight: number; lum: number; sat: number; ground: boolean };

const DISPLAY_FONTS = new Set<FontId>(['serif', 'italic', 'editorial', 'script', 'condensed']);
const INK_DARK: RGB = [22, 18, 11];
const INK_LIGHT: RGB = [247, 245, 240];

const isNeutral = (t: { sat: number; lum: number }) => t.sat < 0.18 || t.lum > 0.86 || t.lum < 0.035;

/** Every colour in the doc with a rough weight for how much it shows. */
function collect(doc: Doc): Tone[] {
  const H = ASPECTS[doc.aspect].height * (doc.grid ?? 1);
  const area = SLIDE_WIDTH * doc.slideCount * H;
  const found: Tone[] = [];
  const add = (hex: string | null | undefined, weight: number, ground = false) => {
    const p = hex ? parseHex(hex) : null;
    if (!p || p.alpha < 0.15) return;
    const near = found.find((t) => distance(t.rgb, p.rgb) < 18);
    if (near) {
      near.weight += weight;
      near.ground ||= ground;
    } else found.push({ rgb: p.rgb, weight, lum: luminance(p.rgb), sat: saturation(p.rgb), ground });
  };
  const bg = doc.background;
  if (bg.kind === 'solid') add(bg.color, 10, true);
  else add(bg.colors[0], bg.kind === 'texture' ? 10 : 6, true);
  if (bg.kind === 'gradient') add(bg.colors[1], 6, true);
  for (const l of doc.layers) {
    if (l.hidden) continue;
    const share = (l.w * l.h * l.scale * l.scale) / area;
    if (l.type === 'shape') add(l.color, 1 + share * 12);
    else if (l.type === 'text' && !l.sticker) {
      add(l.color, 1.5);
      if (l.fill) add(l.fill, 2 + share * 6);
      if (l.outline) add(l.outline.color, 1);
    } else if (l.type === 'photo' && l.border > 0 && !isCard(l)) add(l.borderColor, 1);
    else if (l.type === 'drawing') for (const s of l.strokes) add(s.color, 0.6);
  }
  return found.sort((a, b) => b.weight - a.weight);
}

const isCard = (l: Extract<Layer, { type: 'photo' }>) =>
  l.frame === 'polaroid' || l.frame === 'taped' || l.frame === 'film' || l.frame === 'stamp' || l.frame === 'torn';

type Swatch = { rgb: RGB; lum: number; sat: number };

/** The swatch whose tone is closest to `lum`, or undefined. */
const closest = (list: Swatch[], lum: number) => [...list].sort((a, b) => Math.abs(a.lum - lum) - Math.abs(b.lum - lum))[0];

/** Same side of the light/dark divide (so a dark page stays dark, a light one light). */
const sameSide = (a: number, b: number) => (a < 0.18 && b < 0.18) || (a > 0.55 && b > 0.55) || Math.abs(a - b) < 0.3;

const swatches = (hex: string[]): Swatch[] =>
  hex
    .map((h) => parseHex(h)?.rgb)
    .filter((c): c is RGB => !!c)
    .map((rgb) => ({ rgb, lum: luminance(rgb), sat: saturation(rgb) }));

/** Deep or pale enough to stand in for paper or ink. */
const tonalCapable = (b: Swatch) => isNeutral(b) || b.lum < 0.09 || b.lum > 0.72;

/** One look: keep the page's tone (rotating accents by `shift`), or put bold colour `shift` on the page. */
type Look = { flip: boolean; shift: number };

/** The distinct looks a kit can give. */
function looksFor(colors: string[]): Look[] {
  const accents = swatches(colors).filter((b) => !isNeutral(b));
  const bold = accents.filter((b) => !tonalCapable(b));
  const looks: Look[] = [{ flip: false, shift: 0 }];
  if (accents.length > 1) looks.push({ flip: false, shift: 1 });
  bold.slice(0, 2).forEach((_, i) => looks.push({ flip: true, shift: i }));
  return looks.slice(0, 4);
}

/** Builds the colour mapping for one look. */
function palette(tones: Tone[], brandHex: string[], look: Look) {
  const brand = swatches(brandHex);
  const map = new Map<Tone, RGB>();
  if (!brand.length) return map;
  const accents = brand.filter((b) => !isNeutral(b));
  // Paper and ink: true neutrals, plus any brand colour dark or light enough to stand in
  // for one (a deep navy makes a fine dark page).
  const tonal = brand.filter(tonalCapable);

  const ground = tones.find((t) => t.ground);
  // The page in its own tone: the closest brand neutral (or deep/pale colour) on the same side.
  const tonalBest = ground ? closest(tonal, ground.lum) : undefined;
  const tonalPage = tonalBest && ground && sameSide(tonalBest.lum, ground.lum) ? tonalBest : undefined;
  // Colours that can take over the page for the bolder looks.
  const bold = accents.filter((a) => !tonalCapable(a));
  const flipGround = !!ground && look.flip && bold.length > 0;
  const shift = look.shift;

  let page: Swatch | undefined;
  if (ground) {
    page = flipGround ? bold[shift % bold.length] : tonalPage;
    if (page) map.set(ground, page.rgb);
  }
  const pageLum = page?.lum ?? ground?.lum ?? 1;
  // Accents in turn, skipping the page colour and anything too close to it in tone to show.
  const others = accents.filter((a) => a !== page);
  const usable = others.filter((a) => Math.abs(a.lum - pageLum) > 0.06);
  const base = usable.length ? usable : others;
  const pool = base.length > 1 ? [...base.slice(shift % base.length), ...base.slice(0, shift % base.length)] : base;

  let nextAccent = 0;
  for (const t of tones) {
    if (t === ground) continue;
    if (isNeutral(t)) {
      const best = closest(
        tonal.filter((b) => b !== page || Math.abs(t.lum - pageLum) < 0.05),
        t.lum,
      );
      if (best && sameSide(best.lum, t.lum)) map.set(t, best.rgb);
      continue;
    }
    if (pool.length) {
      map.set(t, pool[nextAccent % pool.length].rgb);
      nextAccent++;
    } else {
      const best = closest(tonal, t.lum);
      if (best) map.set(t, best.rgb);
    }
  }
  return map;
}

/** The brand colour (or near-black/near-white) that reads best on `backdrop`. */
function readableOn(backdrop: RGB, current: RGB, brand: RGB[], min = 3) {
  if (contrast(current, backdrop) >= min) return current;
  const options = [...brand, INK_DARK, INK_LIGHT];
  return options.sort((a, b) => contrast(b, backdrop) - contrast(a, backdrop))[0];
}

const HANDLE_TOKENS = /@(yourname|yourhandle|handle|username)\b/gi;

export function applyBrand(doc: Doc, kit: BrandKit, opts: ApplyOptions): ApplyResult {
  let changed = 0;
  const tones = collect(doc);
  const looks = looksFor(kit.colors);
  const mapping = opts.colors ? palette(tones, kit.colors, looks[opts.variant % looks.length]) : new Map<Tone, RGB>();
  const brandRGB = kit.colors.map((h) => parseHex(h)?.rgb).filter((c): c is RGB => !!c);

  const recolor = (hex: string): string => {
    if (!opts.colors) return hex;
    const p = parseHex(hex);
    if (!p) return hex;
    const tone = tones.find((t) => distance(t.rgb, p.rgb) < 18);
    const to = tone ? mapping.get(tone) : undefined;
    if (!to) return hex;
    const out = toHex(to, p.alpha);
    if (out !== hex.toUpperCase()) changed++;
    return out;
  };

  // Background.
  const bg = doc.background;
  let background: Background = bg;
  if (opts.colors) {
    if (bg.kind === 'solid') background = { kind: 'solid', color: recolor(bg.color) };
    else if (bg.kind === 'gradient') background = { ...bg, colors: [recolor(bg.colors[0]), recolor(bg.colors[1])] };
    else background = tex(bg.texture, recolor(bg.colors[0]).slice(0, 7));
  }
  const groundHex = background.kind === 'solid' ? background.color : background.colors[0];
  const groundRGB = parseHex(groundHex)?.rgb ?? INK_LIGHT;

  const heading = kit.fonts[0];
  const body = kit.fonts[1] ?? kit.fonts[0];
  const handle = kit.profile.handle;

  const canvasArea = canvasSize(doc).width * canvasSize(doc).height;
  /** Small marks (rules, dots, doodles) must still show up on the page. */
  const visible = (hex: string) => {
    const p = parseHex(hex);
    if (!p) return hex;
    const fixed = readableOn(groundRGB, p.rgb, brandRGB, 1.8);
    if (fixed === p.rgb) return hex;
    changed++;
    return toHex(fixed, p.alpha);
  };

  const layers = doc.layers.map((l): Layer => {
    if (l.type === 'shape') {
      if (!opts.colors) return l;
      const small = (l.w * l.h * l.scale * l.scale) / canvasArea < 0.03;
      const color = recolor(l.color);
      return { ...l, color: small ? visible(color) : color };
    }
    if (l.type === 'drawing') {
      return opts.colors ? { ...l, strokes: l.strokes.map((s) => ({ ...s, color: visible(recolor(s.color)) })) } : l;
    }
    if (l.type === 'photo') {
      return opts.colors && l.border > 0 && !isCard(l) ? { ...l, borderColor: recolor(l.borderColor) } : l;
    }
    if (l.sticker) return l;
    let next = { ...l };
    if (opts.colors) {
      next.color = recolor(l.color);
      next.fill = l.fill ? recolor(l.fill) : l.fill;
      next.outline = l.outline ? { ...l.outline, color: recolor(l.outline.color) } : l.outline;
      // Text over a photo (shadowed) is left to the photo; the rest must read on its backdrop.
      const backdrop = next.fill ? parseHex(next.fill)?.rgb : next.shadow ? null : groundRGB;
      const ink = parseHex(next.color);
      if (backdrop && ink && !next.outline) {
        const fixed = readableOn(backdrop, ink.rgb, brandRGB);
        if (fixed !== ink.rgb) {
          next.color = toHex(fixed, ink.alpha);
          changed++;
        }
      }
    }
    let remeasure = false;
    if (opts.fonts && heading) {
      const isHeading = DISPLAY_FONTS.has(l.font) || l.font.startsWith('custom:') || l.size >= 90;
      const font = isHeading ? heading : body;
      if (font !== l.font) {
        next.font = font;
        remeasure = true;
        changed++;
      }
    }
    if (opts.details && handle && HANDLE_TOKENS.test(l.text)) {
      next.text = l.text.replace(HANDLE_TOKENS, `@${handle}`);
      remeasure = true;
      changed++;
    }
    HANDLE_TOKENS.lastIndex = 0;
    if (remeasure) next = { ...next, ...measureText(next) };
    return next;
  });

  const swaps = tones
    .filter((t) => mapping.has(t))
    .slice(0, 6)
    .map((t) => ({ from: toHex(t.rgb), to: toHex(mapping.get(t)!) }));

  return { doc: { ...doc, background, layers }, swaps, changed };
}

/** How many distinct looks a kit can produce (accents can rotate; a bold colour can be the page). */
export function variantCount(kit: BrandKit) {
  return looksFor(kit.colors).length;
}
