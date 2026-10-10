import { Canvas, Group, Path, RadialGradient, Rect, Skia, vec } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';

import { useSamplePreview } from '@/lib/samples';
import { GOLD, type Template, doodle, shp, slot } from '@/lib/template-kit';
import { C } from '@/theme';

import { DocRenderer } from './doc-renderer';

// The scrapbook collage behind Home's title: a faded photo in the corner, two
// polaroids (one taped), a torn scrap and a hand-drawn heart. It's built from
// the same frames and doodles as the templates and drawn by DocRenderer, so it
// looks like something Seam made.

const W = 1080;
const H = 1350;
const CLEAR = '#00000000';

/** The faded photo in the top corner, drawn under a fade into the page. */
const BACKDROP: Template = {
  id: 'home-hero-backdrop',
  name: 'Home backdrop',
  category: 'Home',
  aspect: '4:5',
  slideCount: 1,
  background: { kind: 'solid', color: CLEAR },
  samples: ['cabin'],
  items: [slot(660, 360, 960, 720, { filter: 'mono' })],
};

const COLLAGE: Template = {
  id: 'home-hero-collage',
  name: 'Home collage',
  category: 'Home',
  aspect: '4:5',
  slideCount: 1,
  background: { kind: 'solid', color: CLEAR },
  samples: ['summer', 'friends'],
  items: [
    shp('torn', 380, 960, 160, 74, '#8C6A48', { rotation: -0.4 }),
    slot(975, 930, 420, 510, { frame: 'polaroid', rotation: 0.14, shadow: true, filter: 'warm' }),
    slot(600, 740, 470, 580, { frame: 'taped', rotation: -0.09, shadow: true }),
    doodle('heart', 360, 320, 80, 110, GOLD, { width: 7, rotation: -0.14 }),
  ],
};

/**
 * The collage, `width` × `height` points, pinned to the top-right corner of
 * its parent. It fades in once its photos are ready.
 */
export function HeroCollage({ width, height }: { width: number; height: number }) {
  const back = useSamplePreview(BACKDROP);
  const front = useSamplePreview(COLLAGE);
  const ready = back.ready && front.ready;
  const shown = useSharedValue(0);
  useEffect(() => {
    if (ready) shown.set(withDelay(120, withTiming(1, { duration: 700 })));
  }, [ready, shown]);
  const fade = useAnimatedStyle(() => ({ opacity: shown.get(), transform: [{ translateY: (1 - shown.get()) * 10 }] }));

  // Scaled to the height and anchored right, so narrow phones crop the left.
  const k = height / H;
  const dx = width - W * k;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', top: 0, right: 0, width, height }, fade]}>
      {ready && (
        <Canvas style={{ width, height }}>
          <Group transform={[{ translateX: dx }, { scale: k }]}>
            <Group opacity={0.5}>
              <DocRenderer doc={back.doc} images={back.images} noBackground />
            </Group>
          </Group>
          {/* Fade the corner photo into the page, strongest toward the title. */}
          <Rect x={0} y={0} width={width} height={height}>
            <RadialGradient
              c={vec(width, 0)}
              r={Math.max(width, height) * 0.82}
              colors={[C.bg + '00', C.bg + '66', C.bg]}
              positions={[0, 0.45, 0.9]}
            />
          </Rect>
          <Group transform={[{ translateX: dx }, { scale: k }]}>
            <DocRenderer doc={front.doc} images={front.images} noBackground />
          </Group>
        </Canvas>
      )}
    </Animated.View>
  );
}

/** One tapered ink stroke along `pts`, widest at `peak` (0..1 along it). */
function brush(pts: [number, number][], weight: number, peak = 0.4) {
  const n = pts.length;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = pts[Math.max(0, i - 1)];
    const b = pts[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const nx = -(b[1] - a[1]) / len;
    const ny = (b[0] - a[0]) / len;
    // Swells to `peak`, then thins out to a dry tail.
    const swell = t < peak ? Math.sin((t / peak) * (Math.PI / 2)) : Math.cos(((t - peak) / (1 - peak)) * (Math.PI / 2));
    const half = (weight / 2) * (0.18 + 0.82 * Math.max(0, swell));
    left.push([pts[i][0] + nx * half, pts[i][1] + ny * half]);
    right.push([pts[i][0] - nx * half, pts[i][1] - ny * half]);
  }
  const path = Skia.PathBuilder.Make().moveTo(...left[0]);
  for (const p of left.slice(1)) path.lineTo(...p);
  for (const p of right.reverse()) path.lineTo(...p);
  return path.close().build();
}

const sample = (n: number, f: (t: number) => [number, number]) => Array.from({ length: n }, (_, i) => f(i / (n - 1)));

/** Rounds a polyline's corners off (Chaikin), so a zig reads as a pen turn. */
function rounded(pts: [number, number][], passes = 3) {
  let p = pts;
  for (let k = 0; k < passes; k++) {
    const q: [number, number][] = [p[0]];
    for (let i = 0; i + 1 < p.length; i++) {
      const [a, b] = [p[i], p[i + 1]];
      q.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
    }
    q.push(p[p.length - 1]);
    p = q;
  }
  return p;
}

/** A gold brush flourish to underline the wordmark: a swash, a quick zig, then a long tail. */
export function BrushSwash({ width = 150, color = GOLD }: { width?: number; color?: string }) {
  const h = width * 0.13;
  const swash = brush(
    sample(40, (t) => [width * (0.02 + t * 0.36), h * (0.62 - Math.sin(t * Math.PI * 1.8) * 0.22)]),
    h * 0.36,
    0.35,
  );
  const zig = brush(
    rounded([
      [width * 0.3, h * 0.42],
      [width * 0.44, h * 0.3],
      [width * 0.33, h * 0.74],
      [width * 0.47, h * 0.6],
    ]),
    h * 0.2,
    0.45,
  );
  const tail = brush(
    sample(48, (t) => [width * (0.42 + t * 0.57), h * (0.6 - t * 0.16 + Math.sin(t * Math.PI) * 0.04)]),
    h * 0.2,
    0.12,
  );
  return (
    <Canvas style={{ width, height: h }}>
      <Path path={swash} color={color} />
      <Path path={zig} color={color} opacity={0.9} />
      <Path path={tail} color={color} opacity={0.92} />
    </Canvas>
  );
}
