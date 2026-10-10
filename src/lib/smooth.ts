// Smooth ink: turns a shaky finger stroke into a clean, confident line.
//
// 1. Judge how shaky the hand was, so a careful stroke keeps its detail and a
//    wobbly one gets more help.
// 2. Resample evenly, so slow and fast parts of the stroke weigh the same.
// 3. Find the corners it meant (a star's points, a heart's dip) and keep them
//    sharp; relax the jitter out of everything in between.
// 4. Snap the obvious cases: a nearly straight stroke becomes straight, and a
//    stroke that ends close to where it began closes into a loop.
// 5. Keep only the points that carry the shape, then run a centripetal
//    Catmull-Rom spline through them for a silky curve.
//
// Points are flat [x0, y0, x1, y1, ...] in canvas px; `width` is the brush.

type P = [number, number];

const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function toPoints(flat: number[]): P[] {
  const out: P[] = [];
  for (let i = 0; i + 1 < flat.length; i += 2) out.push([flat[i], flat[i + 1]]);
  return out;
}

const flatten = (pts: P[]) => pts.flatMap(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]);

function length(pts: P[]) {
  let total = 0;
  for (let i = 1; i < pts.length; i++) total += dist(pts[i - 1], pts[i]);
  return total;
}

/** Points every `spacing` px along the polyline. */
function resample(pts: P[], spacing: number): P[] {
  const out: P[] = [pts[0]];
  let carry = 0;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1];
    const b = pts[i];
    const seg = dist(a, b);
    if (seg === 0) continue;
    let d = spacing - carry;
    while (d <= seg) {
      const t = d / seg;
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      d += spacing;
    }
    carry = seg - (d - spacing);
  }
  const last = pts[pts.length - 1];
  if (dist(out[out.length - 1], last) > spacing * 0.3) out.push(last);
  return out;
}

/** How far the direction swings at each point, judged `k` samples either side. */
function turns(pts: P[], closed: boolean, k: number): number[] {
  const n = pts.length;
  const turn: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    if (!closed && (i < k || i > n - 1 - k)) continue;
    const a = closed ? pts[(((i - k) % n) + n) % n] : pts[i - k];
    const b = closed ? pts[(i + k) % n] : pts[i + k];
    const v1: P = [pts[i][0] - a[0], pts[i][1] - a[1]];
    const v2: P = [b[0] - pts[i][0], b[1] - pts[i][1]];
    const l1 = Math.hypot(v1[0], v1[1]);
    const l2 = Math.hypot(v2[0], v2[1]);
    if (!l1 || !l2) continue;
    const cos = (v1[0] * v2[0] + v1[1] * v2[1]) / (l1 * l2);
    turn[i] = Math.acos(Math.max(-1, Math.min(1, cos)));
  }
  return turn;
}

/**
 * Sharp turns the stroke meant to make (a heart's dip, a star's points):
 * where the direction swings more than ~62° over `k` samples, at the peak.
 * A real corner stays sharp judged from twice as far away; a wobble of the
 * hand doesn't, so it's ignored.
 */
function corners(pts: P[], closed: boolean, k: number): Set<number> {
  const n = pts.length;
  const near = turns(pts, closed, k);
  const far = turns(pts, closed, Math.min(k * 2, Math.floor((n - 1) / (closed ? 3 : 2))));
  const out = new Set<number>();
  const limit = (62 * Math.PI) / 180;
  for (let i = 0; i < n; i++) {
    if (near[i] < limit || far[i] < limit * 0.8) continue;
    let peak = true;
    for (let j = -k; j <= k && peak; j++) {
      const m = closed ? (i + j + n) % n : i + j;
      if (j !== 0 && m >= 0 && m < n && near[m] > near[i]) peak = false;
    }
    if (peak) out.add(i);
  }
  return out;
}

/**
 * Laplacian smoothing: each point moves toward the average of its neighbours.
 * Pinned points stay put and act as walls, so the two sides of a corner
 * smooth independently instead of dragging each other into a hook.
 */
function relax(pts: P[], radius: number, passes: number, closed: boolean, pinned: Set<number> = new Set()): P[] {
  let cur = pts;
  const n = pts.length;
  const sigma2 = 2 * (radius / 2) ** 2;
  for (let pass = 0; pass < passes; pass++) {
    const next: P[] = cur.map((p) => [p[0], p[1]]);
    for (let i = 0; i < n; i++) {
      if (!closed && (i === 0 || i === n - 1)) continue;
      if (pinned.has(i)) continue;
      let sx = cur[i][0];
      let sy = cur[i][1];
      let sw = 1;
      for (const dir of [-1, 1]) {
        for (let k = 1; k <= radius; k++) {
          let j = i + dir * k;
          if (closed) j = ((j % n) + n) % n;
          else if (j < 0 || j >= n) break;
          // Gaussian-ish weights.
          const w = Math.exp(-(k * k) / sigma2);
          sx += cur[j][0] * w;
          sy += cur[j][1] * w;
          sw += w;
          if (pinned.has(j)) break;
        }
      }
      next[i] = [sx / sw, sy / sw];
    }
    cur = next;
  }
  return cur;
}

/** How shaky this hand is: the typical distance of the samples from a steadied copy. */
function shake(pts: P[], radius: number): number {
  if (pts.length < radius * 2 + 3) return 0;
  const steady = relax(pts, radius, 2, false);
  const off = pts.map((p, i) => dist(p, steady[i])).sort((x, y) => x - y);
  return off[Math.floor(off.length / 2)];
}

/** Ramer-Douglas-Peucker: the fewest points that keep the shape within `epsilon`. */
function simplify(pts: P[], epsilon: number): P[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [s, e] = stack.pop()!;
    const [ax, ay] = pts[s];
    const [bx, by] = pts[e];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    let best = -1;
    let bestD = 0;
    for (let i = s + 1; i < e; i++) {
      // When the ends meet (a loop), distance from the end point stands in for distance from the chord.
      const d = len < 1e-6 ? dist(pts[i], pts[s]) : Math.abs(dy * pts[i][0] - dx * pts[i][1] + bx * ay - by * ax) / len;
      if (d > bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best >= 0 && bestD > epsilon) {
      keep[best] = 1;
      stack.push([s, best], [best, e]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/** A centripetal Catmull-Rom spline through `pts`, about one sample per `step` px. */
function spline(pts: P[], step: number, closed: boolean): P[] {
  if (pts.length < 3) return pts;
  const n = pts.length;
  const at = (i: number): P => {
    if (closed) return pts[(i + n) % n];
    if (i < 0) return [2 * pts[0][0] - pts[1][0], 2 * pts[0][1] - pts[1][1]];
    if (i >= n) return [2 * pts[n - 1][0] - pts[n - 2][0], 2 * pts[n - 1][1] - pts[n - 2][1]];
    return pts[i];
  };
  const out: P[] = [];
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    // Centripetal parameterisation avoids cusps and self-loops.
    const t01 = Math.sqrt(dist(p0, p1)) || 1e-4;
    const t12 = Math.sqrt(dist(p1, p2)) || 1e-4;
    const t23 = Math.sqrt(dist(p2, p3)) || 1e-4;
    const m1: P = [
      p2[0] - p1[0] + t12 * ((p1[0] - p0[0]) / t01 - (p2[0] - p0[0]) / (t01 + t12)),
      p2[1] - p1[1] + t12 * ((p1[1] - p0[1]) / t01 - (p2[1] - p0[1]) / (t01 + t12)),
    ];
    const m2: P = [
      p2[0] - p1[0] + t12 * ((p3[0] - p2[0]) / t23 - (p3[0] - p1[0]) / (t12 + t23)),
      p2[1] - p1[1] + t12 * ((p3[1] - p2[1]) / t23 - (p3[1] - p1[1]) / (t12 + t23)),
    ];
    const samples = Math.max(2, Math.ceil(dist(p1, p2) / step));
    for (let s = 0; s < samples; s++) {
      const t = s / samples;
      const t2 = t * t;
      const t3 = t2 * t;
      const h00 = 2 * t3 - 3 * t2 + 1;
      const h10 = t3 - 2 * t2 + t;
      const h01 = -2 * t3 + 3 * t2;
      const h11 = t3 - t2;
      out.push([
        h00 * p1[0] + h10 * m1[0] + h01 * p2[0] + h11 * m2[0],
        h00 * p1[1] + h10 * m1[1] + h01 * p2[1] + h11 * m2[1],
      ]);
    }
  }
  out.push(closed ? out[0] : pts[n - 1]);
  return out;
}

/**
 * The smoothed stroke. Taps and tiny marks come back unchanged.
 * `scale` is canvas px per screen point: finger wobble is a few screen points
 * whatever the zoom, so it sets how big a wiggle counts as noise.
 * `strength` 0..1 (default 0.6) sets how much wobble is taken out.
 */
export function smoothStroke(flat: number[], width: number, { scale = 1, strength = 0.6 } = {}): number[] {
  const raw = toPoints(flat);
  if (raw.length < 3) return flat;
  const total = length(raw);
  // Wiggles smaller than this are the hand, not the shape: at least a couple of
  // screen points, more for a shakier hand (judged over ~8 points either side).
  const steady = Math.max(width * 0.5, scale * 2.5);
  const grain = Math.max(steady, shake(resample(raw, Math.max(1, scale * 2)), 4) * 5);
  if (total < Math.max(12, width * 1.5, grain * 3)) return flat;

  const spacing = Math.max(2, grain * 0.4);
  let pts = resample(raw, spacing);
  if (pts.length < 4) return flat;

  // A stroke that comes back near its start is a loop: close it, trimming any
  // overshoot past the start so the join is seamless.
  const tailFrom = Math.floor(pts.length * 0.75);
  let join = pts.length - 1;
  for (let j = tailFrom; j < pts.length; j++) if (dist(pts[j], pts[0]) < dist(pts[join], pts[0])) join = j;
  const gap = dist(pts[0], pts[join]);
  // Judged against the drawing's size, not its length: a spiral is long but
  // its end is nowhere near its start.
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
  const closed = total > Math.max(width * 8, grain * 12, size * 2) && gap < Math.max(width * 2, grain * 3, size * 0.12);
  if (closed) pts = pts.slice(0, Math.max(3, join));

  // In samples: the relax window, and how far either side a turn is judged
  // (several grains, or 4% of the stroke) so jitter doesn't read as a corner.
  const samples = (px: number) => Math.max(2, Math.round(px / spacing));
  const radius = samples(grain * (1.5 + strength * 3));
  const reach = Math.max(3, samples(Math.max(width * 1.6, grain * 4, total * 0.04)));
  const sharp = corners(relax(pts, samples(grain * 2), 2, closed), closed, reach);
  pts = relax(pts, radius, 1 + Math.round(strength * 2), closed, sharp);

  // Nearly straight: make it a clean straight line.
  if (!closed) {
    const a = pts[0];
    const b = pts[pts.length - 1];
    const chord = dist(a, b);
    if (chord > Math.max(width * 4, grain * 6)) {
      let worst = 0;
      for (const p of pts) {
        const d = Math.abs((b[1] - a[1]) * p[0] - (b[0] - a[0]) * p[1] + b[0] * a[1] - b[1] * a[0]) / chord;
        worst = Math.max(worst, d);
      }
      if (worst < Math.max(width * 0.6, grain * 1.2, chord * 0.035)) return flatten([raw[0], raw[raw.length - 1]]);
    }
  }

  // The relax pass already took the shake out, so key points follow the
  // steadied line closely: a looser fit would flatten gentle arcs into chords.
  const epsilon = Math.max(1.2, steady * (0.4 + strength * 0.5));
  const step = Math.max(2, width * 0.3);

  // Smooth curves between corners; corners stay sharp.
  const cuts = [...sharp].sort((a, b) => a - b);
  if (closed && !cuts.length) {
    // A plain loop: simplify it as two halves (start and end meet, so one pass can't).
    const far = pts.reduce((best, p, i) => (dist(p, pts[0]) > dist(pts[best], pts[0]) ? i : best), 0);
    const key = [...simplify(pts.slice(0, far + 1), epsilon).slice(0, -1), ...simplify([...pts.slice(far), pts[0]], epsilon).slice(0, -1)];
    return flatten(key.length >= 3 ? spline(key, step, true) : pts);
  }
  // Open strokes run end to end; loops with corners run from a corner round to itself.
  const ring = closed ? [...pts.slice(cuts[0]), ...pts.slice(0, cuts[0] + 1)] : pts;
  const marks = closed ? cuts.map((c) => (c - cuts[0] + pts.length) % pts.length).concat(pts.length) : [0, ...cuts, pts.length - 1];
  const out: P[] = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const piece = ring.slice(marks[i], marks[i + 1] + 1);
    if (piece.length < 2) continue;
    const key = simplify(piece, epsilon);
    const curve = key.length >= 3 ? spline(key, step, false) : key;
    out.push(...(out.length ? curve.slice(1) : curve));
  }
  return flatten(out.length >= 2 ? out : pts);
}
