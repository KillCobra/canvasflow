// Torn paper edges: the outline of a rectangle torn by hand, as flat x,y
// points. Deterministic for a given seed, so a frame keeps its tear when it
// redraws, exports or reopens. Shared by the torn photo frame and the torn
// paper shape.

export type Rect = { x: number; y: number; width: number; height: number };

export function hashSeed(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Smooth 1D value noise in -1..1. */
function noise(seed: number) {
  const lattice = (i: number) => {
    let h = Math.imul((i | 0) ^ seed, 2654435761) >>> 0;
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  };
  return (t: number) => {
    const i = Math.floor(t);
    const f = t - i;
    const u = f * f * (3 - 2 * f);
    return (lattice(i) * (1 - u) + lattice(i + 1) * u) * 2 - 1;
  };
}

/**
 * The perimeter of `r`, walked clockwise in small steps, each point pushed
 * inward by a tear depth that wanders (a slow wave plus fine fibres).
 * Near a corner the push also borrows the next edge's inward direction, so
 * corners tuck in like the rest of the edge instead of poking out.
 * `depth` is the deepest bite, in the same units as `r`.
 */
export function tornOutline(r: Rect, seed: number, depth: number): number[] {
  const slow = noise(seed);
  const fine = noise(seed ^ 0x9e3779b9);
  // Clockwise from the top-left: top, right, bottom, left, with inward normals.
  const edges = [
    { x: r.x, y: r.y, dx: 1, dy: 0, len: r.width, nx: 0, ny: 1 },
    { x: r.x + r.width, y: r.y, dx: 0, dy: 1, len: r.height, nx: -1, ny: 0 },
    { x: r.x + r.width, y: r.y + r.height, dx: -1, dy: 0, len: r.width, nx: 0, ny: -1 },
    { x: r.x, y: r.y + r.height, dx: 0, dy: -1, len: r.height, nx: 1, ny: 0 },
  ];
  const perimeter = 2 * (r.width + r.height);
  const step = Math.max(2, depth * 0.45);
  const n = Math.max(24, Math.round(perimeter / step));
  const reach = Math.max(1, Math.min(depth * 1.5, r.width / 2, r.height / 2));
  const out: number[] = [];
  for (let k = 0; k < n; k++) {
    const d = (k / n) * perimeter;
    let e = 0;
    let s = d;
    while (e < 3 && s >= edges[e].len) s -= edges[e++].len;
    const edge = edges[e];
    const prev = edges[(e + 3) % 4];
    const next = edges[(e + 1) % 4];
    const fromStart = Math.max(0, 1 - s / reach);
    const toEnd = Math.max(0, 1 - (edge.len - s) / reach);
    // 0..1: mostly shallow, with occasional deeper bites and a fibrous edge.
    const wave = (slow(d / (depth * 7)) + 1) / 2;
    const fibre = (fine(d / (depth * 0.9)) + 1) / 2;
    const bite = depth * Math.min(1, 0.15 + wave * 0.6 + fibre * 0.35);
    out.push(
      edge.x + edge.dx * s + bite * (edge.nx + prev.nx * fromStart + next.nx * toEnd),
      edge.y + edge.dy * s + bite * (edge.ny + prev.ny * fromStart + next.ny * toEnd),
    );
  }
  return out;
}
