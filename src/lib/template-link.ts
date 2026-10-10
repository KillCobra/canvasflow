import * as Linking from 'expo-linking';

import { DEFAULT_ADJUST, FILTERS } from './adjust';
import { createDoc } from './projects';
import { TEXTURES } from './textures';
import {
  ASPECTS,
  type Adjust,
  type AspectId,
  type Background,
  type Doc,
  type DrawingLayer,
  FONTS,
  type FontId,
  type FrameShape,
  type Layer,
  MAX_SLIDES,
  type PhotoLayer,
  type ShapeLayer,
  type Stroke,
  type TextLayer,
  uid,
} from './types';

// Template links: a project without its photos, packed into a URL so it can
// be sent to someone else. Photos and videos become empty slots (frames,
// borders and filters stay); text, shapes, background, slide count and
// aspect come through as they are. The doc is written as compact JSON with
// short keys, then base64url, into seam://import?t=... (an exp:// URL in
// Expo Go, so links work there too).

const VERSION = 1;
/** Past this a link stops being practical to paste or message. */
const MAX_LINK = 60_000;
const MAX_LAYERS = 300;

type PackedBg =
  | { k: 's'; c: string }
  | { k: 'g'; c: [string, string]; a: number }
  | { k: 't'; x: string; c: [string, string] };

/** Short keys; anything left out takes its default. */
type PackedLayer = {
  t: 'p' | 't' | 's' | 'd';
  x: number;
  y: number;
  w: number;
  h: number;
  s?: number; // scale
  r?: number; // rotation
  o?: number; // opacity
  g?: number; // group, as an index
  lk?: 1; // locked
  // photo slot
  ra?: number;
  b?: number;
  bc?: string;
  f?: string; // frame (photo) or font (text)
  sh?: 1;
  ad?: [string, number, number, number, number];
  // text
  tx?: string;
  z?: number;
  c?: string; // text or shape colour
  al?: 'l' | 'r';
  fi?: string;
  fs?: 'h';
  st?: 1;
  sp?: number;
  ol?: [number, string];
  cu?: number;
  // shape
  k?: ShapeLayer['shape'];
  // drawing: [colour, width, x0, y0, x1, y1, ...] per stroke, points rounded
  dr?: (string | number)[][];
};

type Packed = { v: number; n: string; a: AspectId; s: number; b: PackedBg; l: PackedLayer[] };

// ---------------------------------------------------------------------------
// Encode

const r1 = (v: number) => Math.round(v * 10) / 10;
const r4 = (v: number) => Math.round(v * 10000) / 10000;

function packBackground(bg: Background): PackedBg {
  if (bg.kind === 'solid') return { k: 's', c: bg.color };
  if (bg.kind === 'gradient') return { k: 'g', c: bg.colors, a: r4(bg.angle) };
  return { k: 't', x: bg.texture, c: bg.colors };
}

function packLayer(l: Layer, groups: Map<string, number>): PackedLayer | null {
  const p: PackedLayer = { t: 'p', x: r1(l.x), y: r1(l.y), w: r1(l.w), h: r1(l.h) };
  if (l.scale !== 1) p.s = r4(l.scale);
  if (l.rotation) p.r = r4(l.rotation);
  if (l.opacity !== 1) p.o = r4(l.opacity);
  if (l.locked) p.lk = 1;
  if (l.group) {
    if (!groups.has(l.group)) groups.set(l.group, groups.size);
    p.g = groups.get(l.group);
  }
  if (l.type === 'photo') {
    // A lifted subject is only meaningful with its photo.
    if (l.cutout) return null;
    if (l.radius) p.ra = r1(l.radius);
    if (l.border) p.b = r1(l.border);
    if (l.borderColor && l.borderColor.toUpperCase() !== '#FFFFFF') p.bc = l.borderColor;
    if (l.frame && l.frame !== 'rect') p.f = l.frame;
    if (l.shadow) p.sh = 1;
    const a = l.adjust;
    if (a && (a.filter !== 'none' || a.exposure || a.contrast || a.saturation || a.warmth)) {
      p.ad = [a.filter, r4(a.exposure), r4(a.contrast), r4(a.saturation), r4(a.warmth)];
    }
    return p;
  }
  if (l.type === 'text') {
    p.t = 't';
    p.tx = l.text;
    p.f = l.font;
    p.z = r1(l.size);
    p.c = l.color;
    if (l.align !== 'center') p.al = l.align === 'left' ? 'l' : 'r';
    if (l.fill) p.fi = l.fill;
    if (l.fill && l.fillStyle === 'highlight') p.fs = 'h';
    if (l.sticker) p.st = 1;
    if (l.spacing) p.sp = r4(l.spacing);
    if (l.shadow) p.sh = 1;
    if (l.outline) p.ol = [r4(l.outline.width), l.outline.color];
    if (l.curve) p.cu = r4(l.curve);
    return p;
  }
  if (l.type === 'shape') {
    p.t = 's';
    p.k = l.shape;
    p.c = l.color;
    if (l.radius) p.ra = r1(l.radius);
    return p;
  }
  if (l.type === 'drawing') {
    p.t = 'd';
    p.dr = l.strokes.map((st) => [st.color, r1(st.width), ...st.points.map(Math.round)]);
    return p;
  }
  // Layer kinds this format doesn't know yet are left out.
  return null;
}

/** The doc as a share link (photos left out). Throws if it's too big for a link. */
export function templateLink(doc: Doc) {
  const groups = new Map<string, number>();
  const packed: Packed = {
    v: VERSION,
    n: doc.name,
    a: doc.aspect,
    s: doc.slideCount,
    b: packBackground(doc.background),
    l: doc.layers.flatMap((l) => {
      if (l.hidden) return [];
      const p = packLayer(l, groups);
      return p ? [p] : [];
    }),
  };
  const t = toBase64Url(utf8Encode(JSON.stringify(packed)));
  const url = Linking.createURL('import', { queryParams: { t } });
  if (url.length > MAX_LINK) throw new Error('This design has too much in it to fit in a link.');
  return url;
}

// ---------------------------------------------------------------------------
// Decode: every field is checked, so a mangled or hostile link can't put
// anything odd into a project.

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function num(v: unknown, min: number, max: number, fallback: number) {
  return typeof v === 'number' && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : fallback;
}

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const hex = (v: unknown, fallback: string) => (typeof v === 'string' && HEX.test(v) ? v : fallback);

function oneOf<T extends string>(v: unknown, options: readonly T[]): T | undefined {
  return options.includes(v as T) ? (v as T) : undefined;
}

const FRAMES: FrameShape[] = ['rect', 'circle', 'arch', 'polaroid', 'taped', 'film', 'stamp'];
const SHAPES: ShapeLayer['shape'][] = ['rect', 'circle', 'line'];
const TEXTURE_IDS = TEXTURES.map((t) => t.id);
const FILTER_IDS = FILTERS.map((f) => f.id);
const BIG = 100_000;

function font(v: unknown): FontId {
  if (typeof v !== 'string') return 'sans';
  if (v in FONTS) return v as FontId;
  // Fonts imported on the sender's phone fall back to Inter here if missing.
  if (v.startsWith('custom:') && v.length < 120) return v as FontId;
  return 'sans';
}

function unpackBackground(v: unknown): Background {
  const fallback: Background = { kind: 'solid', color: '#F4EFE6' };
  if (!isObj(v)) return fallback;
  if (v.k === 's') return { kind: 'solid', color: hex(v.c, fallback.color) };
  const pair = Array.isArray(v.c) ? ([hex(v.c[0], '#F2EFE9'), hex(v.c[1], '#E8DDCB')] as [string, string]) : null;
  if (v.k === 'g' && pair) return { kind: 'gradient', colors: pair, angle: num(v.a, -100, 100, 0) };
  const texture = oneOf(v.x, TEXTURE_IDS);
  if (v.k === 't' && pair && texture) return { kind: 'texture', texture, colors: pair };
  return fallback;
}

function unpackAdjust(v: unknown): Adjust | undefined {
  if (!Array.isArray(v)) return undefined;
  const filter = oneOf(v[0], FILTER_IDS) ?? 'none';
  const [e, c, s, w] = [1, 2, 3, 4].map((i) => num(v[i], -1, 1, 0));
  return { ...DEFAULT_ADJUST, filter, exposure: e, contrast: c, saturation: s, warmth: w };
}

function unpackLayer(v: unknown, groups: Map<number, string>): Layer | null {
  if (!isObj(v)) return null;
  const w = num(v.w, 1, BIG, 0);
  const h = num(v.h, 1, BIG, 0);
  if (!w || !h || typeof v.x !== 'number' || typeof v.y !== 'number') return null;
  let group: string | undefined;
  if (typeof v.g === 'number' && Number.isInteger(v.g) && v.g >= 0 && v.g < MAX_LAYERS) {
    group = groups.get(v.g) ?? uid();
    groups.set(v.g, group);
  }
  const base = {
    id: uid(),
    x: num(v.x, -BIG, BIG, 0),
    y: num(v.y, -BIG, BIG, 0),
    w,
    h,
    scale: num(v.s, 0.01, 100, 1),
    rotation: num(v.r, -100, 100, 0),
    opacity: num(v.o, 0.05, 1, 1),
    ...(v.lk === 1 ? { locked: true } : {}),
    ...(group ? { group } : {}),
  };
  if (v.t === 'p') {
    const slot: PhotoLayer = {
      ...base,
      type: 'photo',
      src: '',
      slot: true,
      cell: true,
      aspect: w / h,
      radius: num(v.ra, 0, BIG, 0),
      border: num(v.b, 0, 400, 0),
      borderColor: hex(v.bc, '#FFFFFF'),
      frame: oneOf(v.f, FRAMES),
      shadow: v.sh === 1 || undefined,
      adjust: unpackAdjust(v.ad),
    };
    return slot;
  }
  if (v.t === 't') {
    if (typeof v.tx !== 'string') return null;
    const outline =
      Array.isArray(v.ol) && typeof v.ol[0] === 'number'
        ? { width: num(v.ol[0], 0, 0.5, 0.05), color: hex(v.ol[1], '#000000') }
        : null;
    const fill = typeof v.fi === 'string' && HEX.test(v.fi) ? v.fi : null;
    const text: TextLayer = {
      ...base,
      type: 'text',
      text: v.tx.slice(0, 2000),
      font: font(v.f),
      size: num(v.z, 4, 4000, 96),
      color: hex(v.c, '#111111'),
      align: v.al === 'l' ? 'left' : v.al === 'r' ? 'right' : 'center',
      fill,
      fillStyle: fill ? (v.fs === 'h' ? 'highlight' : 'pill') : undefined,
      sticker: v.st === 1 || undefined,
      spacing: v.sp === undefined ? undefined : num(v.sp, -0.05, 0.3, 0),
      shadow: v.sh === 1 || undefined,
      outline,
      curve: v.cu === undefined ? undefined : num(v.cu, -1, 1, 0),
    };
    return text;
  }
  if (v.t === 's') {
    const shape = oneOf(v.k, SHAPES);
    if (!shape) return null;
    const s: ShapeLayer = { ...base, type: 'shape', shape, color: hex(v.c, '#111111'), radius: num(v.ra, 0, BIG, 0) };
    return s;
  }
  if (v.t === 'd') {
    if (!Array.isArray(v.dr)) return null;
    const strokes: Stroke[] = v.dr.flatMap((st: unknown) => {
      if (!Array.isArray(st) || st.length < 4) return [];
      const points = st.slice(2).filter((n): n is number => typeof n === 'number' && Number.isFinite(n));
      if (points.length < 2) return [];
      return [{ color: hex(st[0], '#111111'), width: num(st[1], 0.5, 400, 8), points: points.slice(0, points.length - (points.length % 2)) }];
    });
    if (strokes.length === 0) return null;
    const d: DrawingLayer = { ...base, type: 'drawing', strokes };
    return d;
  }
  return null;
}

/**
 * Reads the `t` parameter of a template link (or a whole pasted link) into
 * a preview document with fresh ids. Null if it isn't a valid template.
 */
export function decodeTemplate(param: string): Doc | null {
  try {
    const raw = param.trim();
    const t = raw.includes('t=') ? (/[?&]t=([^&#\s]+)/.exec(raw)?.[1] ?? '') : raw;
    const bytes = fromBase64Url(decodeURIComponent(t));
    if (!bytes) return null;
    const json: unknown = JSON.parse(utf8Decode(bytes));
    if (!isObj(json) || json.v !== VERSION || !Array.isArray(json.l)) return null;
    const aspect = oneOf(json.a, Object.keys(ASPECTS) as AspectId[]);
    if (!aspect) return null;
    const slideCount = Math.round(num(json.s, 1, MAX_SLIDES, 0));
    if (!slideCount) return null;
    const groups = new Map<number, string>();
    const layers = json.l.slice(0, MAX_LAYERS).flatMap((l) => {
      const layer = unpackLayer(l, groups);
      return layer ? [layer] : [];
    });
    const name = typeof json.n === 'string' && json.n.trim() ? json.n.trim().slice(0, 80) : 'Shared template';
    return { ...createDoc(aspect, slideCount), name, background: unpackBackground(json.b), layers };
  } catch {
    return null;
  }
}

/** A new project from a decoded template: its own id, fresh layer ids, stamped now. */
export function projectFromTemplate(template: Doc): Doc {
  const now = Date.now();
  return {
    ...template,
    id: uid(),
    layers: template.layers.map((l) => ({ ...l, id: uid() })),
    createdAt: now,
    updatedAt: now,
  };
}

// ---------------------------------------------------------------------------
// UTF-8 + base64url, by hand: Hermes' TextDecoder/atob support varies and
// text layers can hold any Unicode (emoji stickers).

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function utf8Encode(s: string) {
  const out: number[] = [];
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c < 0x80) out.push(c);
    else if (c < 0x800) out.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else out.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  return out;
}

function utf8Decode(bytes: number[]) {
  let s = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    const n = b < 0x80 ? 1 : b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : 2;
    let c = n === 1 ? b : b & (0xff >> (n + 1));
    for (let k = 1; k < n; k++) c = (c << 6) | ((bytes[i + k] ?? 0) & 63);
    s += String.fromCodePoint(c);
    i += n;
  }
  return s;
}

function toBase64Url(bytes: number[]) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) s += B64[(n >> (18 - k * 6)) & 63];
  }
  return s;
}

function fromBase64Url(s: string) {
  const clean = s.replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
  const out: number[] = [];
  let acc = 0;
  let bits = 0;
  for (const ch of clean) {
    const v = B64.indexOf(ch);
    if (v < 0) return null;
    // Only the low bits are ever read; masking keeps the shift from overflowing.
    acc = ((acc << 6) | v) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((acc >> bits) & 255);
    }
  }
  return out.length ? out : null;
}
