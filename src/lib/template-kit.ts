import type { AspectId, Background, FilterId, FontId, FrameShape, ShapeLayer, Stroke, TextureId } from './types';

// Building blocks for templates: the item types a template is made of, small
// constructors for them, and the hand-drawn doodles. All geometry is in
// export pixels; x/y are centres.

export type Slot = {
  kind: 'slot';
  x: number;
  y: number;
  w: number;
  h: number;
  radius?: number;
  border?: number;
  borderColor?: string;
  rotation?: number;
  frame?: FrameShape;
  shadow?: boolean;
  /** A look applied to whatever photo fills the slot. */
  filter?: FilterId;
};

export type Txt = {
  kind: 'text';
  text: string;
  font: FontId;
  size: number;
  color: string;
  x: number;
  y: number;
  align?: 'left' | 'center' | 'right';
  fill?: string;
  fillStyle?: 'pill' | 'highlight';
  outline?: { width: number; color: string };
  curve?: number;
  spacing?: number;
  shadow?: boolean;
  rotation?: number;
};

export type Shp = {
  kind: 'shape';
  shape: ShapeLayer['shape'];
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  radius?: number;
  rotation?: number;
};

export type DoodleShape = 'arrow' | 'underline' | 'heart' | 'star' | 'circle' | 'sparkle' | 'route' | 'squiggle';

/** Hand-drawn ink, generated to fit its box. Becomes an editable drawing layer. */
export type Doodle = {
  kind: 'doodle';
  shape: DoodleShape;
  x: number;
  y: number;
  w: number;
  h: number;
  color: string;
  /** Line width (dot size for `route`). */
  width?: number;
  rotation?: number;
  /** Mirror left to right (an arrow pointing left). */
  flip?: boolean;
};

export type TemplateItem = Slot | Txt | Shp | Doodle;

export type TemplateCategory = string;

export type Template = {
  id: string;
  name: string;
  category: TemplateCategory;
  aspect: AspectId;
  slideCount: number;
  background: Background;
  items: TemplateItem[];
  /** Search words; also how templates join collections and onboarding interests. */
  tags?: string[];
  /** Listed under the New filter. */
  isNew?: boolean;
  /** Scene ids for the sample photos in its preview (see samples.tsx). */
  samples?: string[];
};

export const S = 1080;

export const INK = '#16120B';
export const IVORY = '#F2EFE9';
export const SAND = '#E8DDCB';
export const STONE = '#5B5650';
export const CLAY = '#C8553D';
export const GOLD = '#D9C29C';
export const NIGHT = '#0A0A0A';
export const SAGE = '#81B29A';
export const DUSK = '#3D5A80';
export const ROSE = '#E5989B';
export const RED = '#E5484D';

export const slot = (x: number, y: number, w: number, h: number, extra: Partial<Slot> = {}): Slot => ({
  kind: 'slot',
  x,
  y,
  w,
  h,
  ...extra,
});

export const txt = (
  text: string,
  font: FontId,
  size: number,
  color: string,
  x: number,
  y: number,
  extra: Partial<Txt> = {},
): Txt => ({ kind: 'text', text, font, size, color, x, y, ...extra });

export const shp = (
  shape: Shp['shape'],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  extra: Partial<Shp> = {},
): Shp => ({ kind: 'shape', shape, x, y, w, h, color, ...extra });

export const doodle = (
  shape: DoodleShape,
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
  extra: Partial<Doodle> = {},
): Doodle => ({ kind: 'doodle', shape, x, y, w, h, color, ...extra });

/** A 2x2 grid of slots filling one slide. */
export const grid = (slide: number, margin: number, gutter: number, height: number): Slot[] => {
  const cw = (S - margin * 2 - gutter) / 2;
  const ch = (height - margin * 2 - gutter) / 2;
  return [0, 1, 2, 3].map((i) =>
    slot(
      slide * S + margin + cw / 2 + (i % 2) * (cw + gutter),
      margin + ch / 2 + Math.floor(i / 2) * (ch + gutter),
      cw,
      ch,
    ),
  );
};

/**
 * A textured background. The ink follows the same rule as the background
 * picker (see textureInk in textures.ts) without needing Skia at load time.
 */
export function tex(texture: TextureId, tint: string): Background {
  const n = parseInt(tint.slice(1, 7), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255);
  const light = 0.299 * r + 0.587 * g + 0.114 * b > 0.45;
  const mix = (v: number) => (light ? v * 0.42 : v + (1 - v) * 0.5);
  const hex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, mix(v))) * 255)
      .toString(16)
      .padStart(2, '0');
  return { kind: 'texture', texture, colors: [tint, `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase()] };
}

/**
 * Confetti: small dots and dashes scattered over a region, the same every
 * time for a given seed.
 */
export function confetti(seed: number, count: number, area: { x: number; y: number; w: number; h: number }, colors: string[]) {
  let s = seed >>> 0 || 1;
  const rand = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  return Array.from({ length: count }, (_, i) => {
    const x = area.x + rand() * area.w;
    const y = area.y + rand() * area.h;
    const color = colors[i % colors.length];
    const size = 14 + rand() * 18;
    return i % 3 === 0
      ? shp('circle', x, y, size, size, color)
      : shp('rect', x, y, size * 2.2, size * 0.7, color, { radius: size * 0.35, rotation: rand() * Math.PI });
  });
}

// ---------------------------------------------------------------------------
// Doodles: strokes in the layer's local coordinates (origin at the centre),
// sampled densely so the editor's smoothing keeps them flowing.

type Pt = [number, number];

const sample = (n: number, f: (t: number) => Pt): number[] => {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const [x, y] = f(i / n);
    out.push(Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  }
  return out;
};

function shapeStrokes(shape: DoodleShape, w: number, h: number, width: number): number[][] {
  const hw = w / 2;
  const hh = h / 2;
  switch (shape) {
    case 'arrow': {
      // A swooping stroke with an open head at the end.
      const p0: Pt = [-hw, hh * 0.55];
      const p1: Pt = [-hw * 0.1, -hh * 1.05];
      const p2: Pt = [hw, hh * 0.1];
      const at = (t: number): Pt => [
        (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0],
        (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1],
      ];
      const dx = p2[0] - p1[0];
      const dy = p2[1] - p1[1];
      const len = Math.hypot(dx, dy) || 1;
      const head = Math.min(w * 0.2, h * 0.7);
      const wing = (a: number): number[] => {
        const ux = (dx / len) * Math.cos(a) - (dy / len) * Math.sin(a);
        const uy = (dx / len) * Math.sin(a) + (dy / len) * Math.cos(a);
        return [p2[0] - ux * head, p2[1] - uy * head, p2[0], p2[1]];
      };
      return [sample(28, at), wing(0.5), wing(-0.5)];
    }
    case 'underline':
      // Wavy, with a little overshoot back at the end like a quick pen stroke.
      return [sample(40, (t) => [-hw + t * w, Math.sin(t * Math.PI * 3) * hh * 0.6 + (t - 0.5) * hh * 0.4])];
    case 'heart':
      return [
        sample(64, (t) => {
          const a = t * (Math.PI * 2 + 0.3);
          const x = 16 * Math.sin(a) ** 3;
          const y = -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a));
          return [(x / 32) * w, ((y - 2.5) / 29) * h];
        }),
      ];
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i <= 11; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 ? 0.42 : 1;
        // Doubled corner points keep the tips sharp through the smoothing.
        const x = Math.cos(a) * hw * r;
        const y = Math.sin(a) * hh * r;
        pts.push(x, y, x, y);
      }
      return [pts];
    }
    case 'circle':
      // A loop that overshoots where it started, as if circled by hand.
      return [
        sample(60, (t) => {
          const a = -2.2 + t * (Math.PI * 2 + 0.55);
          const wobble = 1 + Math.sin(a * 1.7) * 0.035;
          return [Math.cos(a) * hw * wobble, Math.sin(a) * hh * (1 + (t - 0.5) * 0.08)];
        }),
      ];
    case 'sparkle':
      return [
        sample(64, (t) => {
          const a = t * Math.PI * 2;
          return [Math.cos(a) ** 3 * hw, Math.sin(a) ** 3 * hh];
        }),
      ];
    case 'route': {
      // A dotted path: each dot is a one-point stroke (drawn as a round cap).
      const gap = width * 2.6;
      const n = Math.max(2, Math.round(w / gap));
      return Array.from({ length: n + 1 }, (_, i) => {
        const t = i / n;
        return [Math.round((-hw + t * w) * 10) / 10, Math.round(Math.sin(t * Math.PI * 2.2 + 0.6) * hh * 0.8 * 10) / 10];
      });
    }
    case 'squiggle': {
      const loops = Math.max(2, Math.round(w / h));
      return [
        sample(loops * 24, (t) => {
          const a = t * loops * Math.PI * 2;
          return [-hw * 0.9 + t * w * 0.9 + Math.sin(a) * hh * 0.45, -Math.cos(a) * hh * 0.8];
        }),
      ];
    }
  }
}

/** The doodle's strokes, plus the layer box that fits them (with room for the line). */
export function doodleStrokes(d: Doodle): { strokes: Stroke[]; w: number; h: number } {
  const width = d.width ?? Math.max(4, Math.min(d.w, d.h) * 0.06);
  const lines = shapeStrokes(d.shape, d.w, d.h, width);
  const strokes = lines.map((points) => ({
    points: d.flip ? points.map((v, i) => (i % 2 ? v : -v)) : points,
    color: d.color,
    width,
  }));
  return { strokes, w: d.w + width, h: d.h + width };
}
