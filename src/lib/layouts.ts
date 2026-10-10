import { faceBoxes } from './geometry';
import { ASPECTS, type AspectId, MAX_SLIDES, type PhotoLayer, SLIDE_WIDTH, uid } from './types';

// One-tap arrangements. Each takes the project's photos in order and returns
// new photo geometry plus the slide count it needs. Text and shapes are left
// where they are.

export type LayoutId = 'seamless' | 'panorama' | 'full' | 'framed' | 'stack' | 'scatter';

export const LAYOUTS: { id: LayoutId; label: string; hint: string }[] = [
  { id: 'seamless', label: 'Seamless', hint: 'Photos flow across the swipe' },
  { id: 'panorama', label: 'Panorama', hint: 'First photo spans every slide' },
  { id: 'full', label: 'Full bleed', hint: 'One photo fills each slide' },
  { id: 'framed', label: 'Framed', hint: 'One photo per slide, with margin' },
  { id: 'stack', label: 'Stack', hint: 'Two photos per slide' },
  { id: 'scatter', label: 'Scatter', hint: 'Tilted prints across the seams' },
];

type Result = { slideCount: number; photos: PhotoLayer[] };

const clampSlides = (n: number) => Math.max(1, Math.min(MAX_SLIDES, Math.ceil(n)));

/** Largest box with the photo's aspect that fits inside maxW x maxH. */
function fit(aspect: number, maxW: number, maxH: number) {
  return aspect > maxW / maxH ? { w: maxW, h: maxW / aspect } : { w: maxH * aspect, h: maxH };
}

const reset = { scale: 1, rotation: 0, opacity: 1, crop: undefined };

/** Photos past a layout's capacity pile up, smaller, on the last slot instead of being left behind. */
const extra = (i: number, capacity: number) => (i >= capacity ? { scale: 0.5 } : {});

export function applyLayout(id: LayoutId, photos: PhotoLayer[], aspect: AspectId, currentSlides: number): Result {
  const res = arrange(id, photos, aspect, currentSlides);
  return { ...res, photos: avoidFaceSeams(res.photos, res.slideCount) };
}

/**
 * Slides a photo sideways (at most ~40% of a slide) when a detected face
 * would sit on a seam, so nobody gets split between two slides. Photos wide
 * enough to span seams on purpose (panoramas) are left alone.
 */
export function avoidFaceSeams(photos: PhotoLayer[], slideCount: number) {
  const S = SLIDE_WIDTH;
  const W = slideCount * S;
  const PAD = 16;
  return photos.map((p) => {
    const faces = faceBoxes(p);
    const half = (p.w * p.scale) / 2;
    if (faces.length === 0 || half * 2 > S * 1.5) return p;
    const cut = (dx: number) =>
      faces.some((f) => {
        const k = Math.round((f.left + f.right) / 2 / S);
        return [k - 1, k, k + 1].some((i) => i > 0 && i < slideCount && i * S > f.left + dx - PAD && i * S < f.right + dx + PAD);
      });
    if (!cut(0)) return p;
    for (let step = 12; step <= S * 0.4; step += 12) {
      for (const dx of [step, -step]) {
        if (p.x + dx - half < -half * 0.2 || p.x + dx + half > W + half * 0.2) continue;
        if (!cut(dx)) return { ...p, x: p.x + dx };
      }
    }
    return p;
  });
}

function arrange(id: LayoutId, photos: PhotoLayer[], aspect: AspectId, currentSlides: number): Result {
  const H = ASPECTS[aspect].height;
  const S = SLIDE_WIDTH;
  const n = photos.length;
  if (n === 0) return { slideCount: currentSlides, photos };

  switch (id) {
    case 'full': {
      return {
        slideCount: clampSlides(n),
        photos: photos.map((p, i) => ({
          ...p,
          ...reset,
          ...extra(i, MAX_SLIDES),
          x: Math.min(i, MAX_SLIDES - 1) * S + S / 2,
          y: H / 2,
          w: S,
          h: H,
          radius: 0,
          border: 0,
        })),
      };
    }
    case 'framed': {
      const m = 90;
      return {
        slideCount: clampSlides(n),
        photos: photos.map((p, i) => {
          const box = fit(p.aspect, S - m * 2, H - m * 2);
          return { ...p, ...reset, ...extra(i, MAX_SLIDES), x: Math.min(i, MAX_SLIDES - 1) * S + S / 2, y: H / 2, ...box, radius: 6, border: 0 };
        }),
      };
    }
    case 'stack': {
      const m = 60;
      const g = 30;
      const cellH = (H - m * 2 - g) / 2;
      return {
        slideCount: clampSlides(n / 2),
        photos: photos.map((p, i) => {
          const slide = Math.min(Math.floor(i / 2), MAX_SLIDES - 1);
          const top = i % 2 === 0;
          return {
            ...p,
            ...reset,
            ...extra(i, MAX_SLIDES * 2),
            x: slide * S + S / 2,
            y: top ? m + cellH / 2 : H - m - cellH / 2,
            w: S - m * 2,
            h: cellH,
            radius: 18,
            border: 0,
          };
        }),
      };
    }
    case 'panorama': {
      const [first, ...rest] = photos;
      const slides = clampSlides(Math.max(2, Math.round((first.aspect * H) / S)));
      const W = slides * S;
      return {
        slideCount: slides,
        photos: [
          { ...first, ...reset, x: W / 2, y: H / 2, w: W, h: H, radius: 0, border: 0 },
          ...rest,
        ],
      };
    }
    case 'scatter': {
      const slides = clampSlides(Math.max(2, n * 0.8));
      const W = slides * S;
      const step = W / n;
      return {
        slideCount: slides,
        photos: photos.map((p, i) => {
          const box = fit(p.aspect, S * 0.62, H * 0.5);
          return {
            ...p,
            ...reset,
            x: step * (i + 0.5),
            y: H * (i % 2 === 0 ? 0.4 : 0.6),
            ...box,
            rotation: (i % 2 === 0 ? -1 : 1) * (0.05 + (i % 3) * 0.02),
            radius: 4,
            border: 22,
            borderColor: '#FFFFFF',
          };
        }),
      };
    }
    case 'seamless': {
      // Spacing photos at 3/4 of a slide means most of them straddle a seam,
      // which is what makes the swipe feel continuous.
      const slides = clampSlides(Math.max(2, 1 + (n - 1) * 0.75));
      const step = S * 0.75;
      return {
        slideCount: slides,
        photos: photos.map((p, i) => {
          const big = i % 3 === 0;
          const box = fit(p.aspect, S * (big ? 0.95 : 0.7), H * (big ? 0.72 : 0.5));
          const y = big ? H * 0.5 : H * (i % 2 === 0 ? 0.3 : 0.7);
          return { ...p, ...reset, x: Math.min(S / 2 + i * step, slides * S - S / 2), y, ...box, radius: 0, border: 0 };
        }),
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Grids: empty layout cells on one slide. Dropping or picking photos fills them.

export type GridId =
  | 'split'
  | 'rows2'
  | 'rows3'
  | 'rows4'
  | 'cols3'
  | '2x2'
  | '2x3'
  | '3x3'
  | 'hero'
  | 'heroLeft'
  | 'heroRight'
  | 'twoThree'
  | 'lShape'
  | 'mosaic'
  | 'magazine'
  | 'filmstrip'
  | 'offset'
  | 'corner';

type Cell = [number, number, number, number];

/** `cols` x `rows` equal cells, row by row. */
const even = (cols: number, rows: number): Cell[] =>
  Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c): Cell => [c / cols, r / rows, 1 / cols, 1 / rows]),
  ).flat();

export const GRIDS: { id: GridId; label: string; cells: Cell[] }[] = [
  // Cells as fractions of the slide's content box: [x, y, w, h]. Cells
  // needn't fill the box: the gaps are room for a caption.
  { id: 'split', label: 'Split', cells: even(2, 1) },
  { id: 'rows2', label: 'Rows', cells: even(1, 2) },
  { id: 'rows3', label: 'Three', cells: even(1, 3) },
  { id: 'rows4', label: 'Four', cells: even(1, 4) },
  { id: 'cols3', label: 'Columns', cells: even(3, 1) },
  { id: '2x2', label: 'Quad', cells: even(2, 2) },
  { id: '2x3', label: 'Six', cells: even(2, 3) },
  { id: '3x3', label: 'Nine', cells: even(3, 3) },
  { id: 'hero', label: 'Hero', cells: [[0, 0, 1, 0.62], [0, 0.62, 0.5, 0.38], [0.5, 0.62, 0.5, 0.38]] },
  { id: 'heroLeft', label: 'Hero L', cells: [[0, 0, 0.62, 1], [0.62, 0, 0.38, 0.5], [0.62, 0.5, 0.38, 0.5]] },
  { id: 'heroRight', label: 'Hero R', cells: [[0, 0, 0.38, 0.5], [0, 0.5, 0.38, 0.5], [0.38, 0, 0.62, 1]] },
  {
    id: 'twoThree',
    label: '2 + 3',
    cells: [[0, 0, 0.5, 0.55], [0.5, 0, 0.5, 0.55], [0, 0.55, 1 / 3, 0.45], [1 / 3, 0.55, 1 / 3, 0.45], [2 / 3, 0.55, 1 / 3, 0.45]],
  },
  {
    id: 'lShape',
    label: 'L-shape',
    cells: [[0, 0, 2 / 3, 2 / 3], [2 / 3, 0, 1 / 3, 1 / 3], [2 / 3, 1 / 3, 1 / 3, 1 / 3], [0, 2 / 3, 1 / 3, 1 / 3], [1 / 3, 2 / 3, 1 / 3, 1 / 3], [2 / 3, 2 / 3, 1 / 3, 1 / 3]],
  },
  {
    id: 'mosaic',
    label: 'Mosaic',
    cells: [[0, 0, 0.6, 0.45], [0.6, 0, 0.4, 0.3], [0.6, 0.3, 0.4, 0.4], [0, 0.45, 0.35, 0.55], [0.35, 0.45, 0.25, 0.55], [0.6, 0.7, 0.4, 0.3]],
  },
  { id: 'magazine', label: 'Magazine', cells: [[0, 0, 1, 0.38], [0, 0.38, 0.42, 0.62], [0.42, 0.38, 0.58, 0.31], [0.42, 0.69, 0.58, 0.31]] },
  { id: 'filmstrip', label: 'Film', cells: [[0, 0.3, 1 / 3, 0.4], [1 / 3, 0.3, 1 / 3, 0.4], [2 / 3, 0.3, 1 / 3, 0.4]] },
  { id: 'offset', label: 'Offset', cells: [[0, 0, 0.62, 0.32], [0.38, 0.34, 0.62, 0.32], [0, 0.68, 0.62, 0.32]] },
  { id: 'corner', label: 'Corner', cells: [[0, 0, 1, 0.7], [0.58, 0.7, 0.42, 0.3]] },
];

/** Empty cell layers filling slide `slide`, with an outer margin and gutters. */
export function gridCells(id: GridId, slide: number, aspect: AspectId, margin = 54, gutter = 18): PhotoLayer[] {
  const H = ASPECTS[aspect].height;
  const grid = GRIDS.find((g) => g.id === id)!;
  const boxW = SLIDE_WIDTH - margin * 2;
  const boxH = H - margin * 2;
  return grid.cells.map(([fx, fy, fw, fh]) => {
    // Gutters only between cells, not at the outer edge.
    const left = margin + fx * boxW + (fx > 0 ? gutter / 2 : 0);
    const right = margin + (fx + fw) * boxW - (fx + fw < 0.999 ? gutter / 2 : 0);
    const top = margin + fy * boxH + (fy > 0 ? gutter / 2 : 0);
    const bottom = margin + (fy + fh) * boxH - (fy + fh < 0.999 ? gutter / 2 : 0);
    const w = right - left;
    const h = bottom - top;
    return {
      id: uid(),
      type: 'photo',
      src: '',
      slot: true,
      cell: true,
      aspect: w / h,
      x: slide * SLIDE_WIDTH + left + w / 2,
      y: top + h / 2,
      w,
      h,
      scale: 1,
      rotation: 0,
      opacity: 1,
      radius: 0,
      border: 0,
      borderColor: '#FFFFFF',
    };
  });
}

// ---------------------------------------------------------------------------
// Magic: several generated arrangements of the project's photos in a mood.

export type Mood = 'clean' | 'editorial' | 'playful' | 'bold';

export const MOODS: { id: Mood; label: string }[] = [
  { id: 'clean', label: 'Clean' },
  { id: 'editorial', label: 'Editorial' },
  { id: 'playful', label: 'Playful' },
  { id: 'bold', label: 'Bold' },
];

const MOOD_BACKGROUNDS: Record<Mood, string[]> = {
  clean: ['#FFFFFF', '#F2EFE9', '#EEF1F4'],
  editorial: ['#F2EFE9', '#E8DDCB', '#141414'],
  playful: ['#F6D5C4', '#F2CC8F', '#98C1D9', '#E5989B'],
  bold: ['#0A0A0A', '#C8553D', '#264653'],
};

export type MagicResult = { slideCount: number; photos: PhotoLayer[]; background: string; label: string };

/** Small deterministic PRNG so a seed always gives the same arrangement. */
function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds one arrangement. Each photo gets a "beat" (a big hero that crosses a
 * seam, a framed single, a pair, or a scatter print), walking left to right so
 * the result reads as one continuous strip.
 */
export function magicLayout(photos: PhotoLayer[], aspect: AspectId, mood: Mood, seed: number): MagicResult {
  const rand = rng(seed * 7919 + photos.length * 31 + mood.length);
  const H = ASPECTS[aspect].height;
  const S = SLIDE_WIDTH;
  const bgs = MOOD_BACKGROUNDS[mood];
  const background = bgs[Math.floor(rand() * bgs.length)];
  const border = mood === 'playful' ? 20 : 0;
  const radius = mood === 'clean' ? 14 : mood === 'playful' ? 6 : 0;
  const tilt = mood === 'playful' ? 0.07 : mood === 'editorial' ? 0.015 : 0;
  const shadow = mood === 'playful' || mood === 'clean';
  const margin = mood === 'bold' ? 0 : mood === 'editorial' ? 110 : 70;

  const out: PhotoLayer[] = [];
  let cursor = 0; // canvas x where the next beat starts
  let i = 0;
  const place = (p: PhotoLayer, x: number, y: number, maxW: number, maxH: number, extra: Partial<PhotoLayer> = {}) => {
    const box = fit(p.aspect, maxW, maxH);
    out.push({
      ...p,
      ...reset,
      x,
      y,
      ...box,
      radius,
      border,
      borderColor: '#FFFFFF',
      shadow,
      rotation: tilt ? (rand() * 2 - 1) * tilt : 0,
      ...extra,
    });
  };

  while (i < photos.length) {
    const left = photos.length - i;
    const roll = rand();
    if (mood === 'bold' && roll < 0.5) {
      // Full-bleed slide.
      place(photos[i++], cursor + S / 2, H / 2, S, H, { w: S, h: H, rotation: 0, radius: 0, border: 0 });
      cursor += S;
    } else if (roll < 0.35 && left >= 1) {
      // Hero crossing the next seam.
      const w = S * (1.3 + rand() * 0.4);
      place(photos[i++], cursor + w / 2 + margin / 2, H / 2, w - margin, H - margin * 2);
      cursor += w * 0.82;
    } else if (roll < 0.62 && left >= 2) {
      // Stacked pair on one slide.
      const cellH = (H - margin * 2 - 30) / 2;
      place(photos[i++], cursor + S / 2, margin + cellH / 2, S - margin * 2, cellH);
      place(photos[i++], cursor + S / 2, H - margin - cellH / 2, S - margin * 2, cellH);
      cursor += S;
    } else if (roll < 0.82 && left >= 2) {
      // Two prints overlapping across a seam.
      place(photos[i++], cursor + S * 0.42, H * 0.38, S * 0.62, H * 0.5);
      place(photos[i++], cursor + S * 1.02, H * 0.64, S * 0.62, H * 0.5);
      cursor += S * 1.35;
    } else {
      // Framed single.
      place(photos[i++], cursor + S / 2, H / 2, S - margin * 2 - 60, H - margin * 2 - 60);
      cursor += S;
    }
  }
  const slideCount = clampSlides(cursor / S);
  // Keep everything inside the last slide.
  const W = slideCount * S;
  for (const p of out) p.x = Math.min(p.x, W - (p.w * p.scale) / 2 + 40);
  const names: Record<Mood, string[]> = {
    clean: ['Airy', 'Gallery', 'Calm'],
    editorial: ['Spread', 'Column', 'Feature'],
    playful: ['Scrapbook', 'Pinboard', 'Collage'],
    bold: ['Poster', 'Impact', 'Statement'],
  };
  return { slideCount, photos: avoidFaceSeams(out, slideCount), background, label: names[mood][seed % 3] };
}
