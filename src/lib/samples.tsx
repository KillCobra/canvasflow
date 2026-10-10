import {
  BlurMask,
  Circle,
  FractalNoise,
  Group,
  LinearGradient,
  Oval,
  Path,
  RadialGradient,
  Rect,
  type SkImage,
  type SkPath,
  type SkPathBuilder,
  Skia,
  drawAsImage,
  vec,
} from '@shopify/react-native-skia';
import { type ReactElement, useEffect, useSyncExternalStore } from 'react';

import { frameInner } from './geometry';
import type { ImageMap } from './images';
import { type Template, templatePreview } from './templates';
import type { Doc } from './types';

// Sample "photos" for template previews: small procedural scenes drawn
// offscreen with Skia the first time a thumbnail asks for them, then kept.
// They only ever fill preview copies of a template (see samplePreview);
// projects made from a template keep their empty slots.

export type SceneId =
  | 'sunset'
  | 'ocean'
  | 'lake'
  | 'skyline'
  | 'dunes'
  | 'forest'
  | 'palms'
  | 'stars'
  | 'bokeh'
  | 'stilllife'
  | 'portrait'
  | 'peaks';

/** Tall fills portrait and square slots, land the landscape ones, wide the panoramas. */
type Variant = 'tall' | 'land' | 'wide';

const SIZES: Record<Variant, { width: number; height: number }> = {
  tall: { width: 512, height: 640 },
  land: { width: 768, height: 512 },
  wide: { width: 1440, height: 576 },
};

type Pt = [number, number];
type Scene = (w: number, h: number) => ReactElement;

/** Small seeded PRNG (mulberry32), so every scene draws the same each time. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type CrestOptions = {
  /** Mean height of the line, as a fraction of the image height. */
  base: number;
  /** Amplitude as a fraction of the height. */
  amp: number;
  /** Longest wavelength in image heights, so wider images get more hills rather than stretched ones. */
  wave: number;
  seed: number;
  /** Sharp peaks and round valleys (mountains) instead of rolling hills. */
  peaky?: boolean;
  /** How many octaves of detail: 2 is smooth, 6 is rocky. */
  octaves?: number;
};

/** A skyline of hills or mountains: summed sines across the width. */
function crest(w: number, h: number, o: CrestOptions, octaves = o.octaves ?? 4): Pt[] {
  const r = rng(o.seed);
  const parts = Array.from({ length: octaves }, (_, i) => ({
    k: (Math.PI * 2 * 2.13 ** i) / (o.wave * h),
    p: r() * Math.PI * 2,
    a: (o.amp * h) / 2.2 ** i,
  }));
  const step = Math.max(1.5, h / 240);
  const pts: Pt[] = [];
  for (let x = -step; x <= w + step; x += step) {
    let y = o.base * h;
    for (const c of parts) {
      const s = Math.sin(c.k * x + c.p);
      // Peaky: a triangle wave, straight slopes to sharp ridges.
      y -= o.peaky ? (c.a * Math.asin(s) * 2) / Math.PI : c.a * s;
    }
    pts.push([x, y]);
  }
  return pts;
}

/** Everything under a crest line. */
function below(pts: Pt[], h: number): SkPath {
  const b = Skia.PathBuilder.Make().moveTo(pts[0][0], h);
  for (const [x, y] of pts) b.lineTo(x, y);
  return b.lineTo(pts[pts.length - 1][0], h).close().build();
}

/** Everything above a line. */
function above(pts: Pt[]): SkPath {
  const b = Skia.PathBuilder.Make().moveTo(pts[0][0], 0);
  for (const [x, y] of pts) b.lineTo(x, y);
  return b.lineTo(pts[pts.length - 1][0], 0).close().build();
}

/**
 * Shade on the slopes facing away from a light on the left: a band under the
 * crest wherever it falls to the right, deepest on the steepest slopes.
 */
function faces(w: number, h: number, o: CrestOptions, depth: number): SkPath {
  const pts = crest(w, h, o);
  // Slopes come from a smoother crest so rocky detail doesn't streak the shade.
  const coarse = crest(w, h, o, Math.min(3, o.octaves ?? 4));
  const n = pts.length;
  const raw = coarse.map((_, i) => {
    const a = coarse[Math.max(0, i - 1)];
    const b = coarse[Math.min(n - 1, i + 1)];
    return Math.max(0, Math.min(1, ((b[1] - a[1]) / (b[0] - a[0])) * 2.5));
  });
  // Smooth the depth so the shade's lower edge is soft rather than jagged.
  const win = Math.max(2, Math.round(n / 120));
  const d = raw.map((_, i) => {
    let sum = 0;
    let count = 0;
    for (let k = Math.max(0, i - win); k <= Math.min(n - 1, i + win); k++) {
      sum += raw[k];
      count++;
    }
    return (sum / count) * depth * h;
  });
  const b = Skia.PathBuilder.Make().moveTo(pts[0][0], pts[0][1]);
  for (const [x, y] of pts) b.lineTo(x, y);
  for (let i = n - 1; i >= 0; i--) b.lineTo(pts[i][0], pts[i][1] + d[i]);
  return b.close().build();
}

/** A row of conifers standing on `base` (fraction of height), merged into one path with the ground below. */
function conifers(w: number, h: number, base: number, size: number, seed: number, spacing = 0.45): SkPath {
  const r = rng(seed);
  const b = Skia.PathBuilder.Make();
  const ground = base * h;
  let x = -size * h * 0.3;
  while (x < w + size * h * 0.3) {
    const H = size * h * (0.55 + r() * 0.6);
    const W = H * (0.28 + r() * 0.08);
    const y0 = ground + r() * size * h * 0.15;
    const tiers = 6;
    b.moveTo(x, y0 - H);
    for (let t = 1; t <= tiers; t++) {
      const f = t / tiers;
      b.lineTo(x + (W / 2) * f * (1 + r() * 0.25), y0 - H + H * f * 0.92);
      if (t < tiers) b.lineTo(x + (W / 2) * f * 0.45, y0 - H + H * f * 0.95);
    }
    b.lineTo(x + W * 0.05, y0).lineTo(x - W * 0.05, y0);
    for (let t = tiers; t >= 1; t--) {
      const f = t / tiers;
      if (t < tiers) b.lineTo(x - (W / 2) * f * 0.45, y0 - H + H * f * 0.95);
      b.lineTo(x - (W / 2) * f * (1 + r() * 0.25), y0 - H + H * f * 0.92);
    }
    b.close();
    x += H * spacing * (0.5 + r() * 0.7);
  }
  b.addRect({ x: -2, y: ground + size * h * 0.08, width: w + 4, height: h });
  return b.build();
}

/** Lens vignette and a little grain, so flat gradients read as photographs. */
function Film({ w, h, vignette = 0.38, grain = 0.06 }: { w: number; h: number; vignette?: number; grain?: number }) {
  const c = vec(w / 2, h * 0.46);
  return (
    <Group>
      <Rect x={0} y={0} width={w} height={h}>
        <RadialGradient
          c={c}
          r={Math.hypot(w, h) * 0.62}
          colors={['#00000000', '#00000000', `rgba(0,0,0,${vignette})`]}
          positions={[0, 0.48, 1]}
        />
      </Rect>
      <Rect x={0} y={0} width={w} height={h} opacity={grain} blendMode="overlay">
        <FractalNoise freqX={0.9} freqY={0.9} octaves={2} seed={3} />
      </Rect>
    </Group>
  );
}

function Sky({ w, h, to, colors, positions }: { w: number; h: number; to: number; colors: string[]; positions?: number[] }) {
  return (
    <Rect x={0} y={0} width={w} height={h}>
      <LinearGradient start={vec(0, 0)} end={vec(0, to * h)} colors={colors} positions={positions} />
    </Rect>
  );
}

function Glow({ x, y, r, colors }: { x: number; y: number; r: number; colors: string[] }) {
  return (
    <Circle cx={x} cy={y} r={r}>
      <RadialGradient c={vec(x, y)} r={r} colors={colors} />
    </Circle>
  );
}

/** Soft streaks of cloud. */
function Streaks({ w, h, seed, top, bottom, color, count }: { w: number; h: number; seed: number; top: number; bottom: number; color: string; count: number }) {
  const r = rng(seed);
  const n = Math.round(count * (w / h));
  return (
    <Group>
      {Array.from({ length: n }, (_, i) => {
        const rx = h * (0.1 + r() * 0.24);
        const ry = h * (0.007 + r() * 0.016);
        const x = r() * w;
        const y = h * (top + r() * (bottom - top));
        return (
          <Oval key={i} x={x - rx} y={y - ry} width={rx * 2} height={ry * 2} color={color} opacity={0.3 + r() * 0.45}>
            <BlurMask blur={h * 0.012} style="normal" />
          </Oval>
        );
      })}
    </Group>
  );
}

/** Puffy cumulus: clusters of soft discs with flat bases, lit from above. */
function Cumulus({ w, h, seed, y, count, scale = 1 }: { w: number; h: number; seed: number; y: number; count: number; scale?: number }) {
  const r = rng(seed);
  const n = Math.max(1, Math.round(count * (w / h)));
  const shade = Skia.PathBuilder.Make();
  const lit = Skia.PathBuilder.Make();
  const bases = Skia.PathBuilder.Make();
  for (let i = 0; i < n; i++) {
    const cx = ((i + 0.15 + r() * 0.7) / n) * w;
    const base = h * (y + (r() - 0.5) * 0.05);
    const size = h * 0.035 * scale * (0.7 + r() * 0.7);
    const span = size * (4 + r() * 3);
    for (let k = 0; k < 16; k++) {
      const t = r() * 2 - 1;
      const rad = size * (0.55 + (1 - Math.abs(t)) * 0.9 * r() + 0.3);
      const px = cx + t * span * 0.5;
      const py = base - rad * (0.5 + (1 - Math.abs(t)) * 0.9);
      shade.addCircle(px, py + rad * 0.18, rad);
      lit.addCircle(px - rad * 0.08, py - rad * 0.14, rad * 0.88);
    }
    bases.addRect({ x: cx - span, y: base - h, width: span * 2, height: h });
  }
  return (
    <Group clip={bases.build()}>
      <Path path={shade.build()} color="#BFCCDA">
        <BlurMask blur={h * 0.005} style="normal" />
      </Path>
      <Path path={lit.build()} color="#FFFFFF" opacity={0.95}>
        <BlurMask blur={h * 0.007} style="normal" />
      </Path>
    </Group>
  );
}

// ---------------------------------------------------------------------------
// The scenes. Coordinates are relative to the image height where shape
// matters (hills, figures) so the wide variants extend rather than stretch.

const sunset: Scene = (w, h) => {
  const sun = { x: w * 0.6, y: h * 0.64 };
  const hills = [
    { base: 0.67, amp: 0.03, wave: 1.5, color: '#B66A7E', haze: '#E9967E' },
    { base: 0.73, amp: 0.04, wave: 1.2, color: '#7D3F63', haze: '#B86D7C' },
    { base: 0.81, amp: 0.045, wave: 1, color: '#4B2447', haze: '#6E3B5E' },
    { base: 0.91, amp: 0.045, wave: 0.8, color: '#25112A', haze: '#371C37' },
  ];
  return (
    <Group>
      <Sky w={w} h={h} to={0.72} colors={['#29245A', '#5D3B74', '#B5566B', '#EF8650', '#FCCB7A']} positions={[0, 0.3, 0.58, 0.82, 1]} />
      <Glow x={sun.x} y={sun.y} r={h * 0.45} colors={['#FFE2A6D0', '#FFB26B50', '#FF8A5000']} />
      <Streaks w={w} h={h} seed={11} top={0.16} bottom={0.5} color="#FFB492" count={5} />
      <Circle cx={sun.x} cy={sun.y} r={h * 0.05} color="#FFF3D6">
        <BlurMask blur={h * 0.01} style="solid" />
      </Circle>
      {hills.map((l, i) => (
        <Path key={i} path={below(crest(w, h, { ...l, seed: 20 + i }), h)}>
          <LinearGradient start={vec(0, h * (l.base - l.amp * 1.5))} end={vec(0, h * (l.base + 0.1))} colors={[l.color, l.haze]} />
        </Path>
      ))}
      <Film w={w} h={h} />
    </Group>
  );
};

const ocean: Scene = (w, h) => {
  const r = rng(7);
  const horizon = h * 0.5;
  const glints = Skia.PathBuilder.Make();
  for (let i = 0; i < 260 * (w / h); i++) {
    const t = r();
    const y = horizon + 2 + t * t * h * 0.36;
    const spread = h * (0.04 + t * 0.22);
    const x = w * 0.66 + (r() - 0.5) * 2 * spread * (0.4 + r());
    const len = h * (0.004 + t * 0.03) * (0.4 + r());
    glints.addOval({ x: x - len, y, width: len * 2, height: Math.max(0.8, len * 0.12) });
  }
  const waves = Skia.PathBuilder.Make();
  for (let i = 0; i < 90 * (w / h); i++) {
    const t = r();
    const y = horizon + 4 + t * h * 0.34;
    const len = h * (0.02 + t * 0.14);
    const x = r() * w;
    waves.addRect({ x, y, width: len, height: Math.max(0.7, t * 2.2) });
  }
  const shore = crest(w, h, { base: 0.86, amp: 0.012, wave: 1.3, seed: 8, octaves: 3 });
  const foam = crest(w, h, { base: 0.858, amp: 0.012, wave: 1.3, seed: 8, octaves: 3 });
  return (
    <Group>
      <Sky w={w} h={h} to={0.5} colors={['#4E86C0', '#8FBCE2', '#D8EAF3']} />
      <Cumulus w={w} h={h} seed={4} y={0.45} count={1.6} />
      <Rect x={0} y={horizon} width={w} height={h - horizon}>
        <LinearGradient start={vec(0, horizon)} end={vec(0, h * 0.88)} colors={['#1E4F73', '#25698A', '#3B98A4']} />
      </Rect>
      <Path path={waves.build()} color="#BFE6EE" opacity={0.28} />
      <Path path={glints.build()} color="#FFF8E6" opacity={0.85} />
      <Path path={below(foam.map(([x, y]) => [x, y - h * 0.012] as Pt), h)} color="#5FB9BC" />
      <Path path={below(shore, h)}>
        <LinearGradient start={vec(0, h * 0.85)} end={vec(0, h)} colors={['#CDB58C', '#E9D6AF', '#E2C99C']} positions={[0, 0.25, 1]} />
      </Path>
      <Path path={below(foam, h)} color="#FFFFFF" opacity={0.75} style="stroke" strokeWidth={h * 0.006}>
        <BlurMask blur={h * 0.004} style="normal" />
      </Path>
      <Film w={w} h={h} vignette={0.28} />
    </Group>
  );
};

const lake: Scene = (w, h) => {
  const shoreY = 0.6;
  const far = { base: 0.5, amp: 0.16, wave: 1.2, seed: 31, peaky: true, octaves: 6 };
  const near = { base: 0.56, amp: 0.1, wave: 0.9, seed: 32, peaky: true, octaves: 6 };
  const snow = crest(w, h, { base: 0.4, amp: 0.02, wave: 0.3, seed: 33, octaves: 4 });
  const farBody = below(crest(w, h, far), h);
  const upper = (
    <Group>
      <Sky w={w} h={h} to={shoreY} colors={['#5F96C8', '#A9CDE8', '#E2EDF2']} />
      <Path path={farBody}>
        <LinearGradient start={vec(0, h * 0.3)} end={vec(0, h * shoreY)} colors={['#8197B3', '#A7B8CB']} />
      </Path>
      <Group clip={farBody}>
        <Path path={above(snow)} color="#F4F7FA" />
        <Path path={faces(w, h, far, 0.25)} color="#3E5878" opacity={0.32} />
      </Group>
      <Path path={below(crest(w, h, near), h)}>
        <LinearGradient start={vec(0, h * 0.42)} end={vec(0, h * shoreY)} colors={['#4C6782', '#6F8799']} />
      </Path>
      <Path path={faces(w, h, near, 0.2)} color="#22364C" opacity={0.35} />
      <Path path={conifers(w, h, shoreY - 0.012, 0.075, 34, 0.38)} color="#1B3229" />
    </Group>
  );
  return (
    <Group>
      {upper}
      <Group clip={{ x: 0, y: h * shoreY, width: w, height: h }}>
        <Group transform={[{ translateY: h * shoreY * 2 }, { scaleY: -1 }]}>{upper}</Group>
        <Rect x={0} y={h * shoreY} width={w} height={h}>
          <LinearGradient start={vec(0, h * shoreY)} end={vec(0, h)} colors={['#1C3A5233', '#0F2436B0']} />
        </Rect>
        <Ripples w={w} h={h} top={shoreY} seed={35} />
      </Group>
      <Film w={w} h={h} vignette={0.32} />
    </Group>
  );
};

function Ripples({ w, h, top, seed }: { w: number; h: number; top: number; seed: number }) {
  const r = rng(seed);
  const b = Skia.PathBuilder.Make();
  for (let i = 0; i < 70 * (w / h); i++) {
    const t = r();
    const y = h * top + 3 + t * t * h * (1 - top);
    const len = h * (0.03 + t * 0.2) * (0.5 + r());
    b.addRect({ x: r() * w - len / 2, y, width: len, height: 0.6 + t * 1.6 });
  }
  return <Path path={b.build()} color="#E8F1F5" opacity={0.22} />;
}

const skyline: Scene = (w, h) => {
  const r = rng(41);
  const ground = h * 0.74;
  const rows = [
    { color: '#4B456A', min: 0.06, max: 0.2, width: [0.04, 0.1] },
    { color: '#2A2944', min: 0.1, max: 0.36, width: [0.05, 0.11] },
    { color: '#15142A', min: 0.14, max: 0.48, width: [0.06, 0.14] },
  ];
  const windows = Skia.PathBuilder.Make();
  const reflections = Skia.PathBuilder.Make();
  const towers = rows.map((row, ri) => {
    const b = Skia.PathBuilder.Make();
    let x = -h * 0.05;
    while (x < w) {
      const bw = h * (row.width[0] + r() * (row.width[1] - row.width[0]));
      const bh = h * (row.min + r() * (row.max - row.min));
      b.addRect({ x, y: ground - bh, width: bw - h * 0.004, height: bh + 2 });
      if (r() < 0.25) b.addRect({ x: x + bw * 0.45, y: ground - bh - h * 0.04, width: h * 0.004, height: h * 0.04 });
      if (ri === 2) {
        const cols = Math.max(2, Math.floor(bw / (h * 0.016)));
        const cw = bw / cols;
        for (let yy = ground - bh + h * 0.02; yy < ground - h * 0.015; yy += h * 0.022) {
          for (let c = 0; c < cols - 1; c++) {
            if (r() < 0.32) {
              const wx = x + cw * (c + 0.5);
              windows.addRect({ x: wx, y: yy, width: cw * 0.5, height: h * 0.011 });
              if (r() < 0.5) reflections.addRect({ x: wx, y: ground + (ground - yy) * 0.35 + h * 0.01, width: cw * 0.5, height: h * 0.03 });
            }
          }
        }
      }
      x += bw;
    }
    return b.build();
  });
  return (
    <Group>
      <Sky w={w} h={h} to={0.75} colors={['#121838', '#2B2D5E', '#6B4A7C', '#D7786A', '#F4B67F']} positions={[0, 0.3, 0.6, 0.86, 1]} />
      <Glow x={w * 0.4} y={ground} r={h * 0.5} colors={['#FFB57A80', '#FF8F6A20', '#FF8F6A00']} />
      {towers.map((p, i) => (
        <Path key={i} path={p} color={rows[i].color} />
      ))}
      <Path path={windows.build()} color="#F7C873" opacity={0.85} />
      <Rect x={0} y={ground} width={w} height={h - ground}>
        <LinearGradient start={vec(0, ground)} end={vec(0, h)} colors={['#1E1E3A', '#0B0C1C']} />
      </Rect>
      <Path path={reflections.build()} color="#F7C873" opacity={0.35}>
        <BlurMask blur={h * 0.006} style="normal" />
      </Path>
      <Ripples w={w} h={h} top={0.745} seed={42} />
      <Film w={w} h={h} vignette={0.4} />
    </Group>
  );
};

const dunes: Scene = (w, h) => {
  const layers = [
    { base: 0.5, amp: 0.025, wave: 1.6, seed: 51, lit: '#E7BD8E', shade: '#C08A62' },
    { base: 0.6, amp: 0.05, wave: 1.3, seed: 52, lit: '#E9A86C', shade: '#A9603A' },
    { base: 0.74, amp: 0.07, wave: 1.1, seed: 53, lit: '#EDA463', shade: '#94502E' },
    { base: 0.9, amp: 0.06, wave: 0.9, seed: 54, lit: '#F0AE6E', shade: '#8C4A2A' },
  ];
  return (
    <Group>
      <Sky w={w} h={h} to={0.55} colors={['#6FA6D2', '#B8D4E5', '#F3E4C8']} />
      <Glow x={w * 0.2} y={h * 0.42} r={h * 0.35} colors={['#FFF4DC90', '#FFF4DC00']} />
      {layers.map((l, i) => {
        const o = { ...l, octaves: 2 };
        const body = below(crest(w, h, o), h);
        return (
          <Group key={i}>
            <Path path={body}>
              <LinearGradient start={vec(0, h * (l.base - l.amp))} end={vec(0, h * (l.base + 0.15))} colors={[l.lit, l.shade]} />
            </Path>
            <Group clip={body}>
              <Path path={faces(w, h, o, 0.3)} color={l.shade} opacity={0.85} />
            </Group>
          </Group>
        );
      })}
      <Film w={w} h={h} vignette={0.3} grain={0.08} />
    </Group>
  );
};

const forest: Scene = (w, h) => {
  const rows = [
    { base: 0.5, size: 0.16, color: '#A9B9B2' },
    { base: 0.6, size: 0.2, color: '#839A90' },
    { base: 0.72, size: 0.26, color: '#58716A' },
    { base: 0.86, size: 0.34, color: '#334A43' },
    { base: 1.02, size: 0.46, color: '#1A2A25' },
  ];
  const rays = Skia.PathBuilder.Make();
  const r = rng(61);
  for (let i = 0; i < 5 * (w / h); i++) {
    const x = (i / (5 * (w / h))) * w + r() * h * 0.1;
    const width = h * (0.02 + r() * 0.05);
    rays.moveTo(x, 0).lineTo(x + width, 0).lineTo(x + width - h * 0.45, h).lineTo(x - h * 0.5, h).close();
  }
  return (
    <Group>
      <Sky w={w} h={h} to={1} colors={['#DCE3DE', '#B7C4BE', '#90A39A']} />
      <Path path={rays.build()} color="#FFFDF2" opacity={0.12} blendMode="screen">
        <BlurMask blur={h * 0.015} style="normal" />
      </Path>
      {rows.map((row, i) => (
        <Group key={i}>
          <Path path={conifers(w, h, row.base, row.size, 62 + i)} color={row.color} />
          {i < rows.length - 1 && (
            <Rect x={0} y={h * (row.base - 0.04)} width={w} height={h * 0.12}>
              <LinearGradient
                start={vec(0, h * (row.base - 0.04))}
                end={vec(0, h * (row.base + 0.08))}
                colors={['#DCE3DE00', '#DCE3DEB0', '#DCE3DE00']}
              />
            </Rect>
          )}
        </Group>
      ))}
      <Film w={w} h={h} vignette={0.3} grain={0.07} />
    </Group>
  );
};

/** A leaning palm: tapered trunk and drooping fronds. */
function palm(b: SkPathBuilder, fronds: SkPathBuilder, x: number, ground: number, height: number, lean: number, seed: number) {
  const r = rng(seed);
  const top = { x: x + lean * height, y: ground - height };
  const mid = { x: x + lean * height * 0.15, y: ground - height * 0.55 };
  const w0 = height * 0.045;
  const w1 = height * 0.022;
  b.moveTo(x - w0, ground)
    .quadTo(mid.x - w0 * 0.8, mid.y, top.x - w1, top.y)
    .lineTo(top.x + w1, top.y)
    .quadTo(mid.x + w0 * 0.8, mid.y, x + w0, ground)
    .close();
  // Fronds: a curved spine with leaflets hanging off both sides.
  const n = 11;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI * 0.97 + (i / (n - 1)) * Math.PI * 1.94 + (r() - 0.5) * 0.2;
    const len = height * (0.34 + r() * 0.14);
    const ex = top.x + Math.cos(a) * len;
    const ey = top.y + Math.sin(a) * len * 0.4 + height * (0.1 + r() * 0.12);
    const cx = top.x + Math.cos(a) * len * 0.55;
    const cy = top.y + Math.sin(a) * len * 0.45 - height * 0.07;
    for (let k = 1; k <= 16; k++) {
      const t = k / 17;
      const u = 1 - t;
      const px = u * u * top.x + 2 * u * t * cx + t * t * ex;
      const py = u * u * top.y + 2 * u * t * cy + t * t * ey;
      let tx = 2 * u * (cx - top.x) + 2 * t * (ex - cx);
      let ty = 2 * u * (cy - top.y) + 2 * t * (ey - cy);
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const leaf = height * 0.13 * Math.sin(Math.PI * Math.min(1, t * 1.15)) * (0.75 + r() * 0.3);
      for (const side of [1, -1]) {
        let dx = tx * 0.55 - ty * side;
        let dy = ty * 0.55 + tx * side + 0.7;
        const dl = Math.hypot(dx, dy) || 1;
        dx /= dl;
        dy /= dl;
        fronds
          .moveTo(px - tx * height * 0.008, py - ty * height * 0.008)
          .lineTo(px + dx * leaf, py + dy * leaf)
          .lineTo(px + tx * height * 0.008, py + ty * height * 0.008)
          .close();
      }
    }
    fronds.moveTo(top.x, top.y - height * 0.006).quadTo(cx, cy - height * 0.006, ex, ey).quadTo(cx, cy + height * 0.006, top.x, top.y + height * 0.006).close();
  }
}

const palms: Scene = (w, h) => {
  const trunks = Skia.PathBuilder.Make();
  const leaves = Skia.PathBuilder.Make();
  const shadows = Skia.PathBuilder.Make();
  const count = Math.max(1, Math.round(w / h));
  for (let i = 0; i < count; i++) {
    const x = w * ((i + 0.3) / count) + h * 0.05;
    const ground = h * (0.86 + (i % 2) * 0.05);
    const height = h * (0.62 + (i % 2) * 0.1);
    const lean = i % 2 ? -0.22 : 0.26;
    palm(trunks, leaves, x, ground, height, lean, 70 + i);
    shadows.addOval({ x: x - h * 0.05, y: ground - h * 0.01, width: h * 0.4, height: h * 0.035 });
  }
  const shore = crest(w, h, { base: 0.7, amp: 0.008, wave: 1.4, seed: 75, octaves: 3 });
  return (
    <Group>
      <Sky w={w} h={h} to={0.62} colors={['#2186D3', '#6BBDEB', '#CFEAF6']} />
      <Cumulus w={w} h={h} seed={76} y={0.56} count={1.2} scale={0.8} />
      <Rect x={0} y={h * 0.6} width={w} height={h * 0.2}>
        <LinearGradient start={vec(0, h * 0.6)} end={vec(0, h * 0.72)} colors={['#0B6E9A', '#1FA9BC', '#71D8D0']} />
      </Rect>
      <Path path={below(shore.map(([x, y]) => [x, y - h * 0.008] as Pt), h)} color="#F4FBFA" opacity={0.85} />
      <Path path={below(shore, h)}>
        <LinearGradient start={vec(0, h * 0.7)} end={vec(0, h)} colors={['#E9D3A6', '#F2E1BC', '#E3C796']} positions={[0, 0.3, 1]} />
      </Path>
      <Path path={shadows.build()} color="#7A5A3A" opacity={0.25}>
        <BlurMask blur={h * 0.012} style="normal" />
      </Path>
      <Path path={trunks.build()} color="#5B4430" />
      <Path path={leaves.build()} color="#2C5A30" />
      <Film w={w} h={h} vignette={0.25} />
    </Group>
  );
};

const stars: Scene = (w, h) => {
  const r = rng(81);
  const dim = Skia.PathBuilder.Make();
  const mid = Skia.PathBuilder.Make();
  const bright = Skia.PathBuilder.Make();
  const n = Math.round(w * h * 0.0035);
  for (let i = 0; i < n; i++) {
    // Denser along the Milky Way, a diagonal band.
    let x = r() * w;
    let y = r() * h * 0.8;
    if (i % 3 === 0) {
      const t = r();
      x = t * w;
      y = h * (0.62 - t * (h / w) * 0.4 * (w / h)) + (r() - 0.5) * h * 0.18;
    }
    const s = r();
    if (s > 0.985) bright.addCircle(x, y, 1.3 + r());
    else if (s > 0.85) mid.addCircle(x, y, 0.9);
    else dim.addCircle(x, y, 0.55);
  }
  const band = { x: w * 0.5, y: h * 0.4 };
  const ridge = { base: 0.84, amp: 0.07, wave: 1, seed: 82, peaky: true, octaves: 5 };
  return (
    <Group>
      <Sky w={w} h={h} to={0.9} colors={['#03050D', '#0A1430', '#1C2B55', '#3B4A72']} positions={[0, 0.4, 0.8, 1]} />
      <Group transform={[{ translateX: band.x }, { translateY: band.y }, { rotate: -0.55 }]}>
        <Oval x={-w * 0.9} y={-h * 0.08} width={w * 1.8} height={h * 0.16} color="#9FB0E0" opacity={0.22}>
          <BlurMask blur={h * 0.06} style="normal" />
        </Oval>
        <Oval x={-w * 0.6} y={-h * 0.03} width={w * 1.2} height={h * 0.05} color="#E8D8F0" opacity={0.18}>
          <BlurMask blur={h * 0.03} style="normal" />
        </Oval>
      </Group>
      <Path path={dim.build()} color="#C9D4F0" opacity={0.6} />
      <Path path={mid.build()} color="#EEF2FF" opacity={0.85} />
      <Path path={bright.build()} color="#FFFFFF">
        <BlurMask blur={1.5} style="solid" />
      </Path>
      <Glow x={w * 0.3} y={h * 0.86} r={h * 0.35} colors={['#C98A6A40', '#C98A6A00']} />
      <Path path={below(crest(w, h, ridge), h)} color="#04060C" />
      <Film w={w} h={h} vignette={0.45} grain={0.08} />
    </Group>
  );
};

const bokeh: Scene = (w, h) => {
  const r = rng(91);
  const colors = ['#F8C9D4', '#FDE6B6', '#D8EDB5', '#FFFFFF', '#F3A9BC'];
  const dots = Array.from({ length: Math.round(26 * (w / h)) }, () => ({
    x: r() * w,
    y: r() * h,
    r: h * (0.03 + r() * 0.09),
    c: colors[Math.floor(r() * colors.length)],
    o: 0.12 + r() * 0.35,
  }));
  const cx = w * 0.56;
  const cy = h * 0.47;
  const R = h * 0.15;
  const petals = Skia.PathBuilder.Make();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.2;
    const px = cx + Math.cos(a) * R * 0.55;
    const py = cy + Math.sin(a) * R * 0.55;
    // An oval petal rotated about the flower's centre.
    const m = Skia.Matrix();
    m.translate(px, py);
    m.rotate(a);
    const petal = Skia.PathBuilder.Make().addOval({ x: -R * 0.55, y: -R * 0.24, width: R * 1.1, height: R * 0.48 }).build();
    petals.addPath(petal, m);
  }
  const stem = Skia.PathBuilder.Make()
    .moveTo(cx - R * 0.05, cy + R * 0.3)
    .quadTo(cx - R * 0.6, cy + h * 0.3, cx - R * 0.2, h + 4)
    .build();
  return (
    <Group>
      <Rect x={0} y={0} width={w} height={h}>
        <LinearGradient start={vec(0, 0)} end={vec(w, h)} colors={['#3B4A2E', '#5E6B3E', '#8D6B5E', '#4A3A3E']} />
      </Rect>
      <Glow x={w * 0.25} y={h * 0.3} r={h * 0.4} colors={['#C8D89A70', '#C8D89A00']} />
      {dots.map((d, i) => (
        <Circle key={i} cx={d.x} cy={d.y} r={d.r} color={d.c} opacity={d.o}>
          <BlurMask blur={d.r * 0.12} style="normal" />
        </Circle>
      ))}
      <Path path={stem} color="#4E7A3A" style="stroke" strokeWidth={h * 0.012} />
      <Path path={petals.build()}>
        <RadialGradient c={vec(cx, cy)} r={R * 1.1} colors={['#FFFFFF', '#F7B3C6', '#E7779A']} positions={[0, 0.45, 1]} />
      </Path>
      <Circle cx={cx} cy={cy} r={R * 0.2} color="#F2B83A" />
      <Circle cx={cx - R * 0.04} cy={cy - R * 0.05} r={R * 0.1} color="#FFD978" opacity={0.7} />
      <Film w={w} h={h} vignette={0.4} />
    </Group>
  );
};

const stilllife: Scene = (w, h) => {
  const table = h * 0.7;
  const cx = w * 0.5;
  const u = h;
  const cup = { x: cx - u * 0.16, w: u * 0.2, top: table - u * 0.16 };
  const vase = Skia.PathBuilder.Make()
    .moveTo(cx + u * 0.12, table)
    .cubicTo(cx + u * 0.05, table - u * 0.1, cx + u * 0.08, table - u * 0.2, cx + u * 0.15, table - u * 0.24)
    .lineTo(cx + u * 0.15, table - u * 0.3)
    .lineTo(cx + u * 0.2, table - u * 0.3)
    .lineTo(cx + u * 0.2, table - u * 0.24)
    .cubicTo(cx + u * 0.27, table - u * 0.2, cx + u * 0.3, table - u * 0.1, cx + u * 0.23, table)
    .close()
    .build();
  const branch = Skia.PathBuilder.Make()
    .moveTo(cx + u * 0.175, table - u * 0.28)
    .quadTo(cx + u * 0.2, table - u * 0.45, cx + u * 0.3, table - u * 0.56)
    .moveTo(cx + u * 0.19, table - u * 0.4)
    .quadTo(cx + u * 0.1, table - u * 0.48, cx + u * 0.06, table - u * 0.5)
    .build();
  const light = Skia.PathBuilder.Make()
    .moveTo(cx - u * 0.1, 0)
    .lineTo(cx + u * 0.45, 0)
    .lineTo(cx + u * 0.15, table)
    .lineTo(cx - u * 0.45, table)
    .close()
    .build();
  const mullions = Skia.PathBuilder.Make()
    .addRect({ x: cx + u * 0.12, y: 0, width: u * 0.03, height: table })
    .addRect({ x: cx - u * 0.45, y: table * 0.45, width: u * 0.9, height: u * 0.025 })
    .build();
  return (
    <Group>
      <Rect x={0} y={0} width={w} height={table}>
        <LinearGradient start={vec(0, 0)} end={vec(0, table)} colors={['#D9CCB8', '#E7DCCB']} />
      </Rect>
      <Group>
        <Path path={light} color="#FFF4E0" opacity={0.55}>
          <BlurMask blur={u * 0.02} style="normal" />
        </Path>
        <Group transform={[{ skewX: -0.4 }, { translateX: table * 0.2 }]}>
          <Path path={mullions} color="#CDBFAA" opacity={0.6}>
            <BlurMask blur={u * 0.012} style="normal" />
          </Path>
        </Group>
      </Group>
      <Rect x={0} y={table} width={w} height={h - table}>
        <LinearGradient start={vec(0, table)} end={vec(0, h)} colors={['#B98C62', '#946A45']} />
      </Rect>
      {/* Contact shadows, then the objects. */}
      <Oval x={cup.x - u * 0.04} y={table - u * 0.012} width={cup.w + u * 0.24} height={u * 0.035} color="#3A2614" opacity={0.35}>
        <BlurMask blur={u * 0.012} style="normal" />
      </Oval>
      <Oval x={cx + u * 0.08} y={table - u * 0.01} width={u * 0.32} height={u * 0.03} color="#3A2614" opacity={0.35}>
        <BlurMask blur={u * 0.01} style="normal" />
      </Oval>
      <Oval x={cup.x - u * 0.05} y={table - u * 0.025} width={cup.w + u * 0.1} height={u * 0.04} color="#EEE8DF" />
      <Path
        path={Skia.PathBuilder.Make()
          .moveTo(cup.x, cup.top)
          .lineTo(cup.x + cup.w, cup.top)
          .cubicTo(cup.x + cup.w, table - u * 0.04, cup.x + cup.w * 0.8, table - u * 0.015, cup.x + cup.w / 2, table - u * 0.015)
          .cubicTo(cup.x + cup.w * 0.2, table - u * 0.015, cup.x, table - u * 0.04, cup.x, cup.top)
          .close()
          .build()}>
        <LinearGradient start={vec(cup.x, 0)} end={vec(cup.x + cup.w, 0)} colors={['#FFFFFF', '#F1ECE4', '#C9C0B4']} />
      </Path>
      <Path
        path={Skia.PathBuilder.Make().addOval({ x: cup.x + cup.w * 0.9, y: cup.top + u * 0.025, width: u * 0.07, height: u * 0.07 }).build()}
        style="stroke"
        strokeWidth={u * 0.014}
        color="#DCD5CA"
      />
      <Oval x={cup.x} y={cup.top - u * 0.012} width={cup.w} height={u * 0.024} color="#F7F4EE" />
      <Oval x={cup.x + u * 0.008} y={cup.top - u * 0.008} width={cup.w - u * 0.016} height={u * 0.016} color="#5A3A22" />
      <Path path={branch} style="stroke" strokeWidth={u * 0.006} color="#6B5A45" />
      <Path path={vase}>
        <LinearGradient start={vec(cx + u * 0.06, 0)} end={vec(cx + u * 0.29, 0)} colors={['#E08A5E', '#C8643C', '#8E4026']} />
      </Path>
      <Circle cx={cx - u * 0.28} cy={table - u * 0.05} r={u * 0.05}>
        <RadialGradient c={vec(cx - u * 0.295, table - u * 0.065)} r={u * 0.06} colors={['#FFC36A', '#F08A24', '#B85A12']} />
      </Circle>
      <Film w={w} h={h} vignette={0.3} grain={0.05} />
    </Group>
  );
};

const portrait: Scene = (w, h) => {
  const cx = w * (w > h ? 0.38 : 0.44);
  const u = h;
  const sun = { x: cx + u * 0.16, y: u * 0.6 };
  // Head and shoulders, three-quarter back view.
  const figure = Skia.PathBuilder.Make()
    .moveTo(cx - u * 0.33, u + 2)
    .cubicTo(cx - u * 0.32, u * 0.86, cx - u * 0.3, u * 0.78, cx - u * 0.22, u * 0.75)
    .cubicTo(cx - u * 0.14, u * 0.72, cx - u * 0.07, u * 0.7, cx - u * 0.05, u * 0.63)
    .lineTo(cx - u * 0.045, u * 0.55)
    .lineTo(cx + u * 0.045, u * 0.55)
    .lineTo(cx + u * 0.05, u * 0.63)
    .cubicTo(cx + u * 0.07, u * 0.7, cx + u * 0.14, u * 0.72, cx + u * 0.22, u * 0.75)
    .cubicTo(cx + u * 0.3, u * 0.78, cx + u * 0.32, u * 0.86, cx + u * 0.33, u + 2)
    .close()
    .addOval({ x: cx - u * 0.085, y: u * 0.35, width: u * 0.17, height: u * 0.23 })
    .addCircle(cx - u * 0.07, u * 0.38, u * 0.05)
    .build();
  return (
    <Group>
      <Sky w={w} h={h} to={0.86} colors={['#3B5A8A', '#8A8DB8', '#E7A688', '#F8CB8C']} positions={[0, 0.4, 0.78, 1]} />
      <Glow x={sun.x} y={sun.y} r={u * 0.55} colors={['#FFF0C8F0', '#FFC98A70', '#FFB07A00']} />
      <Streaks w={w} h={h} seed={101} top={0.12} bottom={0.4} color="#F6C3A6" count={3} />
      <Path path={below(crest(w, h, { base: 0.86, amp: 0.03, wave: 1.2, seed: 102 }), h)} color="#6A5262" />
      <Path path={figure} color="#FFD9A0" style="stroke" strokeWidth={u * 0.01}>
        <BlurMask blur={u * 0.012} style="solid" />
      </Path>
      <Path path={figure} color="#1D1419" />
      <Circle cx={sun.x + u * 0.12} cy={sun.y + u * 0.12} r={u * 0.025} color="#FFE6B8" opacity={0.25} blendMode="screen" />
      <Circle cx={sun.x + u * 0.22} cy={sun.y + u * 0.22} r={u * 0.045} color="#FFD0A0" opacity={0.15} blendMode="screen" />
      <Film w={w} h={h} vignette={0.32} />
    </Group>
  );
};

const peaks: Scene = (w, h) => {
  const far = { base: 0.5, amp: 0.17, wave: 1.1, seed: 111, peaky: true, octaves: 6 };
  const main = { base: 0.66, amp: 0.24, wave: 1.3, seed: 112, peaky: true, octaves: 6 };
  const farBody = below(crest(w, h, far), h);
  const mainBody = below(crest(w, h, main), h);
  const snowFar = crest(w, h, { base: 0.42, amp: 0.025, wave: 0.25, seed: 113 });
  const snowMain = crest(w, h, { base: 0.53, amp: 0.035, wave: 0.3, seed: 114 });
  return (
    <Group>
      <Sky w={w} h={h} to={0.62} colors={['#24548F', '#6E9FCF', '#CFE1EE']} />
      <Path path={farBody}>
        <LinearGradient start={vec(0, h * 0.3)} end={vec(0, h * 0.7)} colors={['#8499B4', '#AEBFD1']} />
      </Path>
      <Group clip={farBody}>
        <Path path={above(snowFar)} color="#EEF3F8" />
        <Path path={faces(w, h, far, 0.3)} color="#5A7598" opacity={0.3} />
      </Group>
      <Streaks w={w} h={h} seed={115} top={0.45} bottom={0.55} color="#FFFFFF" count={2} />
      <Path path={mainBody}>
        <LinearGradient start={vec(0, h * 0.4)} end={vec(0, h * 0.9)} colors={['#56677B', '#3D4B5A']} />
      </Path>
      <Group clip={mainBody}>
        <Path path={above(snowMain)} color="#F6F8FB" />
        <Path path={faces(w, h, main, 0.4)} color="#2E4766" opacity={0.42} />
      </Group>
      <Path path={conifers(w, h, 0.9, 0.12, 116, 0.35)} color="#18261F" />
      <Film w={w} h={h} vignette={0.3} />
    </Group>
  );
};

const SCENES: Record<SceneId, Scene> = {
  sunset,
  ocean,
  lake,
  skyline,
  dunes,
  forest,
  palms,
  stars,
  bokeh,
  stilllife,
  portrait,
  peaks,
};

export const SCENE_IDS = Object.keys(SCENES) as SceneId[];

// ---------------------------------------------------------------------------
// Lazy cache. Images are made one at a time, yielding a frame between each,
// the first time something on screen needs them.

const PREFIX = 'sample:';
const images = new Map<string, SkImage>();
const failed = new Set<string>();
const queue: string[] = [];
const listeners = new Set<() => void>();
let version = 0;
let running = false;

const keyFor = (scene: SceneId, variant: Variant) => `${PREFIX}${scene}${variant === 'tall' ? '' : `@${variant}`}`;

export const isSampleSrc = (src: string) => src.startsWith(PREFIX);

function parseKey(key: string) {
  const [scene, variant = 'tall'] = key.slice(PREFIX.length).split('@');
  return SCENES[scene as SceneId] && variant in SIZES ? { scene: scene as SceneId, variant: variant as Variant } : null;
}

/** Draws one scene offscreen. The caller owns the image. */
export function renderScene(scene: SceneId, variant: Variant = 'tall') {
  const size = SIZES[variant];
  return drawAsImage(SCENES[scene](size.width, size.height), size);
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

async function pump() {
  running = true;
  while (queue.length) {
    const key = queue.shift()!;
    const parsed = parseKey(key);
    if (!parsed || images.has(key)) continue;
    try {
      const image = await renderScene(parsed.scene, parsed.variant);
      if (image) images.set(key, image);
      else failed.add(key);
    } catch {
      failed.add(key);
    }
    version++;
    listeners.forEach((l) => l());
    await nextFrame();
  }
  running = false;
}

function request(keys: string[]) {
  for (const k of keys) {
    if (!images.has(k) && !failed.has(k) && !queue.includes(k)) queue.push(k);
  }
  if (!running && queue.length) pump();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

// `_version` makes the inputs change when the cache does, so the React
// Compiler doesn't reuse a stale result (same trick as images.ts).
function missing(keys: string[], _version: number) {
  return keys.filter((k) => !images.has(k) && !failed.has(k)).join('|');
}

function mapFor(keys: string[], _version: number): ImageMap {
  const out: ImageMap = {};
  for (const k of keys) out[k] = images.get(k);
  return out;
}

/**
 * Sample images for these keys, drawing any that aren't made yet. `ready`
 * once every one has been drawn (or failed, which then shows as a blank).
 */
function useSampleKeys(keys: string[]) {
  const v = useSyncExternalStore(subscribe, () => version);
  const todo = missing(keys, v);
  useEffect(() => {
    if (todo) request(todo.split('|'));
  }, [todo]);
  return { images: mapFor(keys, v), ready: !todo };
}

/**
 * A template's preview doc with sample photos in its slots (or its plain
 * empty slots with `empty`), plus the images to draw it with.
 */
export function useSamplePreview(t: Template, empty = false): { doc: Doc; images: ImageMap; ready: boolean } {
  const doc = empty ? templatePreview(t) : samplePreview(t);
  const { images, ready } = useSampleKeys(sampleKeys(doc));
  return { doc, images, ready };
}

export const isScene = (s: string): s is SceneId => s in SCENES;

/** One scene, portrait-shaped (onboarding tiles). */
export function useSceneImage(scene: SceneId): SkImage | undefined {
  const key = keyFor(scene, 'tall');
  return useSampleKeys([key]).images[key];
}

function sampleKeys(doc: Doc) {
  return [...new Set(doc.layers.flatMap((l) => (l.type === 'photo' && isSampleSrc(l.src) ? [l.src] : [])))];
}

// ---------------------------------------------------------------------------
// Filling templates.

/** Scenes that suit each kind of template; anything else draws from all of them. */
const POOLS: Record<string, SceneId[]> = {
  travel: ['palms', 'peaks', 'skyline', 'ocean', 'lake', 'dunes', 'sunset'],
  panorama: ['peaks', 'sunset', 'ocean', 'dunes', 'lake', 'stars'],
  'photo dump': ['bokeh', 'stilllife', 'sunset', 'portrait', 'palms', 'skyline', 'forest', 'ocean'],
  editorial: ['portrait', 'stilllife', 'dunes', 'forest', 'bokeh', 'lake'],
  business: ['stilllife', 'skyline', 'portrait', 'bokeh', 'dunes'],
  minimal: ['dunes', 'ocean', 'forest', 'lake', 'stilllife', 'stars'],
  story: ['skyline', 'portrait', 'stars', 'forest', 'sunset'],
  events: ['bokeh', 'portrait', 'stilllife', 'sunset', 'lake'],
};

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function poolFor(t: Pick<Template, 'category' | 'samples'>): SceneId[] {
  const own = t.samples?.filter(isScene);
  if (own?.length) return own;
  return POOLS[t.category.toLowerCase()] ?? SCENE_IDS;
}

const variantFor = (aspect: number): Variant => (aspect >= 1.9 ? 'wide' : aspect >= 1.2 ? 'land' : 'tall');

/**
 * A copy of `doc` with every empty slot showing a sample photo, picked
 * deterministically from the template so a thumbnail always looks the same.
 * For previews only: these `sample:` srcs must never be saved.
 */
export function fillWithSamples(doc: Doc, t: Pick<Template, 'id' | 'category' | 'samples'>): Doc {
  const slots = doc.layers.filter((l) => l.type === 'photo' && !l.src).length;
  const own = poolFor(t);
  // Busy layouts borrow from the other scenes before repeating any.
  const pool = slots > own.length ? [...own, ...SCENE_IDS.filter((s) => !own.includes(s))] : own;
  const start = hash(t.id) % pool.length;
  let n = 0;
  const layers = doc.layers.map((l) => {
    if (l.type !== 'photo' || l.src) return l;
    const inner = frameInner(l);
    const variant = variantFor(inner.width / inner.height);
    const { width, height } = SIZES[variant];
    const scene = pool[(start + n++) % pool.length];
    return { ...l, src: keyFor(scene, variant), aspect: width / height, crop: undefined };
  });
  return { ...doc, layers };
}

const filled = new WeakMap<Doc, Doc>();

/** The template's cached preview doc, filled with sample photos. */
export function samplePreview(t: Template): Doc {
  const base = templatePreview(t);
  let doc = filled.get(base);
  if (!doc) {
    doc = fillWithSamples(base, t);
    filled.set(base, doc);
  }
  return doc;
}
