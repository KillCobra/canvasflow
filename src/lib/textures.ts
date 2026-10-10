import { type SkRuntimeEffect, Skia } from '@shopify/react-native-skia';

import type { Background, TextureId } from './types';

// Procedural background textures. One SkSL shader draws them all in canvas
// coordinates, so a texture runs unbroken across the seams and renders the
// same in the editor, thumbnails and export (no images, no random seeds:
// the noise is a pure function of the pixel's canvas position).

export const TEXTURES: { id: TextureId; label: string; tint: string }[] = [
  { id: 'paper', label: 'Paper', tint: '#F2EFE9' },
  { id: 'kraft', label: 'Kraft', tint: '#B8916A' },
  { id: 'linen', label: 'Linen', tint: '#E8DDCB' },
  { id: 'grain', label: 'Grain', tint: '#1D1C1A' },
  { id: 'concrete', label: 'Concrete', tint: '#A9A59E' },
  { id: 'canvas', label: 'Canvas', tint: '#EDE6D8' },
  { id: 'grid', label: 'Grid', tint: '#F4F3EE' },
  { id: 'dots', label: 'Dots', tint: '#F2EFE9' },
  { id: 'lined', label: 'Notebook', tint: '#F7F5EF' },
  { id: 'speckle', label: 'Speckle', tint: '#EFE9DF' },
];

const KIND: Record<TextureId, number> = Object.fromEntries(TEXTURES.map((t, i) => [t.id, i])) as Record<
  TextureId,
  number
>;

/** Background for a texture in a tint, with the ink derived from it. */
export function textureBackground(texture: TextureId, tint: string): Background {
  return { kind: 'texture', texture, colors: [tint, textureInk(tint)] };
}

function rgb(hex: string) {
  const c = Skia.Color(hex);
  return [c[0], c[1], c[2]];
}

/** Lines, dots and fibres: a deeper shade of a light tint, a lighter one of a dark tint. */
export function textureInk(tint: string) {
  const [r, g, b] = rgb(tint);
  const light = 0.299 * r + 0.587 * g + 0.114 * b > 0.45;
  const mix = (v: number) => (light ? v * 0.42 : v + (1 - v) * 0.5);
  const hex = (v: number) =>
    Math.round(Math.max(0, Math.min(1, mix(v))) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`.toUpperCase();
}

export function textureUniforms(bg: Extract<Background, { kind: 'texture' }>) {
  return { base: rgb(bg.colors[0]), ink: rgb(bg.colors[1]), kind: KIND[bg.texture] ?? 0 };
}

let effect: SkRuntimeEffect | null | undefined;

/** Compiled once on first use; null if the shader can't compile (callers fall back to the tint). */
export function textureEffect() {
  if (effect === undefined) effect = Skia.RuntimeEffect.Make(TEXTURE_SKSL);
  return effect;
}

// Sine-free hash (Dave Hoskins) so the noise stays identical across GPUs and
// the CPU rasterizer even at large canvas coordinates.
export const TEXTURE_SKSL = `
uniform float3 base;
uniform float3 ink;
uniform float kind;

float hash(float2 p) {
  float3 p3 = fract(float3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(float2 p) {
  float2 i = floor(p);
  float2 f = fract(p);
  float2 u = f * f * (3.0 - 2.0 * f);
  float a = hash(i);
  float b = hash(i + float2(1.0, 0.0));
  float c = hash(i + float2(0.0, 1.0));
  float d = hash(i + float2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(float2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    v += a * noise(p);
    p = p * 2.03 + float2(17.1, 9.7);
    a *= 0.5;
  }
  return v;
}

// Coverage of a line of width w at distance d, softened by about a pixel.
float stroke(float d, float w) {
  return 1.0 - smoothstep(w * 0.5 - 0.7, w * 0.5 + 0.7, d);
}

// Distance to the nearest line of a family spaced every s px.
float rule(float v, float s) {
  float m = mod(v, s);
  return min(m, s - m);
}

// Fine paper tooth shared by most textures.
float tooth(float2 p) {
  return (hash(floor(p / 1.5)) - 0.5) * 0.5 + (noise(p / 3.0) - 0.5);
}

half4 main(float2 p) {
  float k = kind;
  float shade = 0.0;
  float amt = 0.0;
  float3 extra = float3(0.0);
  float extraAmt = 0.0;

  if (k < 0.5) {
    // Paper: soft mottling, faint fibres and tooth.
    float mottle = fbm(p / 220.0) - 0.5;
    float fibre = noise(float2(p.x / 2.5 + p.y / 9.0, p.y / 70.0)) - 0.5;
    shade = mottle * 0.07 + fibre * 0.025 + tooth(p) * 0.025;
  } else if (k < 1.5) {
    // Kraft: streaky fibres in two directions, dark flecks.
    float mottle = fbm(p / 160.0) - 0.5;
    float f1 = noise(float2(p.x / 2.0, p.y / 55.0)) - 0.5;
    float2 q = float2(p.x * 0.8 + p.y * 0.6, p.y * 0.8 - p.x * 0.6);
    float f2 = noise(float2(q.x / 60.0, q.y / 1.8)) - 0.5;
    shade = mottle * 0.10 + f1 * 0.05 + f2 * 0.03 + tooth(p) * 0.03;
    float2 cell = floor(p / 7.0);
    float h = hash(cell + 41.0);
    float2 c = (cell + float2(hash(cell + 7.0), hash(cell + 13.0))) * 7.0;
    amt = step(0.985, h) * (1.0 - smoothstep(0.6, 2.2, length(p - c))) * 0.7;
  } else if (k < 2.5) {
    // Linen: fine woven threads with slubs.
    float wx = 0.5 + 0.5 * sin(p.x * 0.9);
    float wy = 0.5 + 0.5 * sin(p.y * 0.9);
    float sx = noise(float2(floor(p.x / 7.0), p.y / 90.0));
    float sy = noise(float2(p.x / 90.0, floor(p.y / 7.0)));
    shade = ((wx * sx + wy * sy) * 0.5 - 0.3) * 0.13 + (fbm(p / 260.0) - 0.5) * 0.05 + tooth(p) * 0.02;
  } else if (k < 3.5) {
    // Film grain: dense per-pixel grain with a slow luminance drift.
    float g = hash(floor(p)) + hash(floor(p / 2.0) + 91.0) - 1.0;
    shade = g * 0.11 + (fbm(p / 300.0) - 0.5) * 0.05;
  } else if (k < 4.5) {
    // Concrete: layered mottling, pits and pale aggregate.
    float m = fbm(p / 90.0) - 0.5;
    float m2 = fbm(p / 18.0 + 5.0) - 0.5;
    shade = m * 0.16 + m2 * 0.07 + tooth(p) * 0.05;
    float2 cell = floor(p / 9.0);
    float h = hash(cell + 3.0);
    float2 c = (cell + float2(hash(cell + 11.0), hash(cell + 17.0))) * 9.0;
    float r = 0.8 + hash(cell + 23.0) * 2.0;
    float pit = 1.0 - smoothstep(r - 0.7, r + 0.7, length(p - c));
    amt = step(0.955, h) * pit * 0.45;
    shade += step(h, 0.03) * pit * 0.08;
  } else if (k < 5.5) {
    // Canvas: coarse basket weave with bumps.
    float2 cell = floor(p / 8.0);
    float over = mod(cell.x + cell.y, 2.0);
    float2 f = fract(p / 8.0) - 0.5;
    float ridge = over > 0.5 ? cos(f.y * 3.14159) : cos(f.x * 3.14159);
    float slub = noise(over > 0.5 ? float2(cell.x, p.y / 60.0) : float2(p.x / 60.0, cell.y));
    shade = (ridge - 0.65) * 0.10 + (slub - 0.5) * 0.06 + (fbm(p / 200.0) - 0.5) * 0.06 + tooth(p) * 0.02;
  } else if (k < 6.5) {
    // Grid paper: fine rules every 45 px, a heavier one every 5.
    float minor = max(stroke(rule(p.x, 45.0), 2.0), stroke(rule(p.y, 45.0), 2.0));
    float major = max(stroke(rule(p.x, 225.0), 3.2), stroke(rule(p.y, 225.0), 3.2));
    amt = max(minor * 0.28, major * 0.45);
    shade = (fbm(p / 220.0) - 0.5) * 0.04 + tooth(p) * 0.015;
  } else if (k < 7.5) {
    // Dot grid: a dot every 54 px.
    float2 d = mod(p, 54.0) - 27.0;
    amt = (1.0 - smoothstep(2.6, 4.0, length(d))) * 0.5;
    shade = (fbm(p / 220.0) - 0.5) * 0.04 + tooth(p) * 0.015;
  } else if (k < 8.5) {
    // Notebook: ruled lines and one margin line at the start of the strip.
    amt = stroke(rule(p.y + 27.0, 54.0), 2.2) * 0.38;
    extra = float3(0.85, 0.42, 0.40);
    extraAmt = stroke(abs(p.x - 150.0), 2.4) * 0.6;
    shade = (fbm(p / 220.0) - 0.5) * 0.04 + tooth(p) * 0.015;
  } else {
    // Speckle: eggshell stock with scattered dark flecks.
    float2 cell = floor(p / 10.0);
    float h = hash(cell + 5.0);
    float2 c = (cell + float2(hash(cell + 19.0), hash(cell + 29.0))) * 10.0;
    float r = 0.7 + hash(cell + 37.0) * 1.6;
    amt = step(0.9, h) * (1.0 - smoothstep(r - 0.6, r + 0.6, length(p - c))) * (0.35 + hash(cell + 43.0) * 0.4);
    shade = (fbm(p / 200.0) - 0.5) * 0.05 + tooth(p) * 0.02;
  }

  float3 col = mix(base, ink, clamp(amt, 0.0, 1.0));
  col = mix(col, extra, clamp(extraAmt, 0.0, 1.0));
  col = clamp(col + shade, 0.0, 1.0);
  return half4(half3(col), 1.0);
}
`;
