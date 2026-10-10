import { Group, Path, type SkPath, Skia } from '@shopify/react-native-skia';

import type { DrawingLayer, Stroke } from '@/lib/types';

// Freehand ink, drawn the same way in the editor, thumbnails and export.

/**
 * Smooth path through flat x,y samples: a quadratic curve from midpoint to
 * midpoint, with each sample as the control point, so a jittery finger still
 * reads as one clean line. Also runs on the UI thread for the live stroke.
 */
export function strokePath(points: number[]): SkPath {
  'worklet';
  const b = Skia.PathBuilder.Make();
  const n = Math.floor(points.length / 2);
  if (n === 0) return b.build();
  b.moveTo(points[0], points[1]);
  // A tap: a hair-length segment, so the round cap draws a dot.
  if (n === 1) return b.lineTo(points[0] + 0.01, points[1]).build();
  for (let i = 1; i < n - 1; i++) {
    const x = points[i * 2];
    const y = points[i * 2 + 1];
    b.quadTo(x, y, (x + points[i * 2 + 2]) / 2, (y + points[i * 2 + 3]) / 2);
  }
  return b.lineTo(points[n * 2 - 2], points[n * 2 - 1]).build();
}

export function StrokeLine({ stroke }: { stroke: Stroke }) {
  return (
    <Path
      path={strokePath(stroke.points)}
      style="stroke"
      strokeWidth={stroke.width}
      strokeCap="round"
      strokeJoin="round"
      color={stroke.color}
    />
  );
}

/** A drawing layer's strokes in its local coords (the caller applies the layer transform). */
export function DrawingNode({ layer }: { layer: DrawingLayer }) {
  return (
    <Group>
      {layer.strokes.map((s, i) => (
        <StrokeLine key={i} stroke={s} />
      ))}
    </Group>
  );
}

/**
 * Turns strokes drawn in canvas coords into a drawing layer: the box is fitted
 * around the ink (including half the line width) and points become local.
 */
export function drawingFromStrokes(strokes: Stroke[], id: string): DrawingLayer | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const s of strokes) {
    const r = s.width / 2;
    for (let i = 0; i + 1 < s.points.length; i += 2) {
      left = Math.min(left, s.points[i] - r);
      right = Math.max(right, s.points[i] + r);
      top = Math.min(top, s.points[i + 1] - r);
      bottom = Math.max(bottom, s.points[i + 1] + r);
    }
  }
  if (!Number.isFinite(left)) return null;
  const x = (left + right) / 2;
  const y = (top + bottom) / 2;
  return {
    id,
    type: 'drawing',
    strokes: strokes.map((s) => ({
      ...s,
      points: s.points.map((v, i) => (i % 2 === 0 ? v - x : v - y)),
    })),
    x,
    y,
    w: Math.max(1, right - left),
    h: Math.max(1, bottom - top),
    scale: 1,
    rotation: 0,
    opacity: 1,
  };
}
