import {
  type FontWeight,
  type SkFont,
  type SkParagraph,
  type SkPath,
  type SkRect,
  Skia,
  TextAlign,
} from '@shopify/react-native-skia';

import { canvasFonts, canvasFontsVersion, fontInfo } from './fonts';
import type { TextLayer } from './types';

const MAX_TEXT_WIDTH = 1000;
const MAX_CACHED = 200;

const ALIGN = { left: TextAlign.Left, center: TextAlign.Center, right: TextAlign.Right };

type TextStyleInput = Pick<
  TextLayer,
  'text' | 'font' | 'size' | 'color' | 'align' | 'spacing' | 'shadow' | 'fill' | 'fillStyle' | 'outline' | 'curve'
>;

/** Inner padding (canvas px) around the text inside its box. */
export function textPad(layer: Pick<TextLayer, 'fill' | 'fillStyle' | 'outline' | 'size'>) {
  const outline = layer.outline ? layer.outline.width * layer.size : 0;
  if (layer.fill && layer.fillStyle === 'highlight') return Math.max(20, layer.size * 0.22) + outline;
  return (layer.fill ? 28 : 8) + outline;
}

/** Outline thickness in canvas px. */
export const outlinePx = (layer: Pick<TextLayer, 'outline' | 'size'>) =>
  layer.outline ? Math.max(1, layer.outline.width * layer.size) : 0;

export const isCurved = (layer: Pick<TextLayer, 'curve'>) => Math.abs(layer.curve ?? 0) > 0.02;

const cache = new Map<string, SkParagraph>();

function remember<T>(map: Map<string, T>, k: string, v: T) {
  map.set(k, v);
  if (map.size > MAX_CACHED) map.delete(map.keys().next().value as string);
}

/**
 * The laid-out paragraph. `color` overrides the ink (used for the outline
 * pass, which also drops the shadow).
 */
export function buildParagraph(layer: TextStyleInput, width: number, color?: string): SkParagraph {
  const ink = color ?? layer.color;
  const shadow = layer.shadow && !color;
  const k = `${canvasFontsVersion()}|${layer.font}|${layer.size}|${ink}|${layer.align}|${layer.spacing ?? 0}|${shadow ? 1 : 0}|${width}|${layer.text}`;
  const hit = cache.get(k);
  if (hit) {
    // Refresh recency.
    cache.delete(k);
    cache.set(k, hit);
    return hit;
  }
  const font = fontInfo(layer.font);
  const builder = Skia.ParagraphBuilder.Make({ textAlign: ALIGN[layer.align] }, canvasFonts() ?? undefined);
  builder.pushStyle({
    color: Skia.Color(ink),
    fontFamilies: [font.family],
    fontSize: layer.size,
    fontStyle: { weight: font.weight as FontWeight },
    heightMultiplier: 1.12,
    letterSpacing: (layer.spacing ?? 0) * layer.size,
    shadows: shadow
      ? [{ color: Skia.Color('#00000073'), offset: { x: 0, y: layer.size * 0.05 }, blurRadius: layer.size * 0.14 }]
      : [],
  });
  builder.addText(layer.text || ' ');
  builder.pop();
  const paragraph = builder.build();
  paragraph.layout(width);
  remember(cache, k, paragraph);
  return paragraph;
}

/** One rounded bar per line, Instagram "highlight" style, in paragraph coordinates. */
export function highlightBars(paragraph: SkParagraph, size: number) {
  const padX = size * 0.22;
  const padY = size * 0.08;
  return paragraph
    .getLineMetrics()
    .filter((m) => m.width > 0.5)
    .map((m) => ({
      x: m.left - padX,
      y: m.baseline - m.ascent - padY,
      width: m.width + padX * 2,
      height: m.ascent + m.descent + padY * 2,
      r: (m.ascent + m.descent) * 0.24,
    }));
}

// ---------------------------------------------------------------------------
// Curved text: a single line set along a circular arc with Skia's TextPath.

export type CurveLayout = {
  font: SkFont;
  text: string;
  /** Baseline arc in box coordinates (box centered on 0,0). */
  path: SkPath;
  w: number;
  h: number;
};

const curveCache = new Map<string, CurveLayout>();

function fontFor(layer: TextStyleInput): SkFont {
  const info = fontInfo(layer.font);
  const typeface = canvasFonts()?.matchFamilyStyle(info.family, { weight: info.weight as FontWeight });
  return Skia.Font(typeface ?? undefined, layer.size);
}

export function curveLayout(layer: TextStyleInput): CurveLayout {
  const text = (layer.text || ' ').replace(/\s*\n+\s*/g, ' ');
  const curve = Math.max(-1, Math.min(1, layer.curve ?? 0));
  const k = `${canvasFontsVersion()}|${layer.font}|${layer.size}|${curve.toFixed(3)}|${text}`;
  const hit = curveCache.get(k);
  if (hit) return hit;

  const font = fontFor(layer);
  const textWidth = Math.max(1, font.measureText(text).width);
  const { ascent, descent } = font.getMetrics();
  // Total sweep of the arc; the arc is exactly as long as the text.
  const sweep = Math.max(0.05, Math.abs(curve) * Math.PI * 0.95);
  const R = textWidth / sweep;
  const up = curve > 0; // rainbow (center below) vs smile (center above)
  const start = up ? -Math.PI / 2 - sweep / 2 : Math.PI / 2 + sweep / 2;
  const dir = up ? 1 : -1;

  // Bounds of the glyph band (baseline offset by ascent/descent along the normal).
  const outer = up ? -ascent : descent; // ascent is negative in Skia metrics
  const inner = up ? descent : -ascent;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let i = 0; i <= 24; i++) {
    const a = start + dir * sweep * (i / 24);
    for (const r of [R + outer, R - inner]) {
      const x = Math.cos(a) * r;
      const y = Math.sin(a) * r;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const cx = -(minX + maxX) / 2;
  const cy = -(minY + maxY) / 2;
  const oval: SkRect = { x: cx - R, y: cy - R, width: R * 2, height: R * 2 };
  const path = Skia.PathBuilder.Make()
    .addArc(oval, (start * 180) / Math.PI, (dir * sweep * 180) / Math.PI)
    .build();
  const layout = { font, text, path, w: maxX - minX, h: maxY - minY };
  remember(curveCache, k, layout);
  return layout;
}

/** Box size that fits the text on as few lines as possible, capped in width. */
export function measureText(layer: TextStyleInput) {
  const pad = textPad(layer);
  if (isCurved(layer)) {
    const c = curveLayout(layer);
    return { w: Math.ceil(c.w) + pad * 2, h: Math.ceil(c.h) + pad * 2 };
  }
  const probe = buildParagraph(layer, 100000);
  const natural = Math.ceil(probe.getMaxIntrinsicWidth()) + 2;
  const width = Math.min(natural, MAX_TEXT_WIDTH);
  const height = Math.ceil(buildParagraph(layer, width).getHeight());
  return { w: width + pad * 2, h: height + pad * 2 };
}
