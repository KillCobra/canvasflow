import { type GridId, gridCells } from './layouts';
import { measureText } from './text';
import {
  ASPECTS,
  type AspectId,
  type Layer,
  type PhotoLayer,
  SLIDE_WIDTH,
  type ShapeLayer,
  type TextLayer,
  uid,
} from './types';

// Single-slide arrangements for the New Slide sheet. Photos are empty layout
// cells (tap to fill, or drop a photo in), placed on slide `slide`; some
// layouts add a decoration such as tape or a caption.

export type SlideLayoutId =
  | 'full'
  | 'framed'
  | 'split'
  | 'stacked'
  | 'offset'
  | 'polaroid'
  | 'taped'
  | 'circle'
  | 'arch'
  | 'three'
  | 'hero'
  | 'caption';

export const SLIDE_LAYOUTS: { id: SlideLayoutId; label: string }[] = [
  { id: 'full', label: 'Full bleed' },
  { id: 'framed', label: 'Framed' },
  { id: 'split', label: 'Split' },
  { id: 'stacked', label: 'Stacked' },
  { id: 'offset', label: 'Offset' },
  { id: 'polaroid', label: 'Polaroid' },
  { id: 'taped', label: 'Taped' },
  { id: 'circle', label: 'Circle' },
  { id: 'arch', label: 'Arch' },
  { id: 'three', label: 'Three' },
  { id: 'hero', label: 'Hero + 2' },
  { id: 'caption', label: 'Caption' },
];

/** What a new slide starts with. */
export type SlideContent = { kind: 'blank' } | { kind: 'layout'; id: SlideLayoutId } | { kind: 'grid'; id: GridId };

/** Layers for a new slide at index `slide`. `ink` colours any text so it reads on the background. */
export function slideContents(content: SlideContent, slide: number, aspect: AspectId, ink: string): Layer[] {
  if (content.kind === 'grid') return gridCells(content.id, slide, aspect);
  if (content.kind === 'layout') return slideLayout(content.id, slide, aspect, ink);
  return [];
}

const S = SLIDE_WIDTH;

type SlotStyle = Partial<Pick<PhotoLayer, 'frame' | 'radius' | 'border' | 'borderColor' | 'shadow' | 'rotation'>>;

/** An empty layout cell centered at (cx, cy) on the slide. */
function slot(slide: number, cx: number, cy: number, w: number, h: number, style: SlotStyle = {}): PhotoLayer {
  return {
    id: uid(),
    type: 'photo',
    src: '',
    slot: true,
    cell: true,
    aspect: w / h,
    x: slide * S + cx,
    y: cy,
    w,
    h,
    scale: 1,
    rotation: 0,
    opacity: 1,
    radius: 0,
    border: 0,
    borderColor: '#FFFFFF',
    ...style,
  };
}

export function slideLayout(id: SlideLayoutId, slide: number, aspect: AspectId, ink: string): Layer[] {
  const H = ASPECTS[aspect].height;
  switch (id) {
    case 'full':
      return [slot(slide, S / 2, H / 2, S, H)];
    case 'framed': {
      const m = 120;
      return [slot(slide, S / 2, H / 2, S - m * 2, H - m * 2, { radius: 6, shadow: true })];
    }
    case 'split': {
      // Edge to edge with a hairline gutter (the Split grid keeps a margin).
      const w = (S - 12) / 2;
      return [slot(slide, w / 2, H / 2, w, H), slot(slide, S - w / 2, H / 2, w, H)];
    }
    case 'stacked': {
      const m = 70;
      const h = (H - m * 2 - 30) / 2;
      return [
        slot(slide, S / 2, m + h / 2, S - m * 2, h, { radius: 18 }),
        slot(slide, S / 2, H - m - h / 2, S - m * 2, h, { radius: 18 }),
      ];
    }
    case 'offset': {
      const w = S * 0.6;
      const h = Math.min(w * 1.25, H * 0.5);
      const print = { border: 18, shadow: true };
      return [
        slot(slide, S * 0.4, H * 0.36, w, h, { ...print, rotation: -0.03 }),
        slot(slide, S * 0.6, H * 0.64, w, h, { ...print, rotation: 0.025 }),
      ];
    }
    case 'polaroid':
    case 'taped': {
      const h = Math.min(S * 0.72 * 1.22, H * 0.74);
      const w = h / 1.22;
      const tilt = id === 'taped' ? 0.035 : -0.045;
      const card = slot(slide, S / 2, H / 2 + (id === 'taped' ? H * 0.02 : 0), w, h, {
        frame: 'polaroid',
        shadow: true,
        rotation: tilt,
      });
      if (id === 'polaroid') return [card];
      // A strip of paper tape across the card's top edge, a little off-axis.
      const tape: ShapeLayer = {
        id: uid(),
        type: 'shape',
        shape: 'rect',
        // Warm paper, dark enough to read on white card and ivory background alike.
        color: '#D9C9A8',
        radius: 4,
        x: card.x + (Math.sin(tilt) * h) / 2,
        y: card.y - (Math.cos(tilt) * h) / 2,
        w: S * 0.24,
        h: 66,
        scale: 1,
        rotation: tilt - 0.09,
        opacity: 0.8,
      };
      return [card, tape];
    }
    case 'circle': {
      const d = Math.min(S * 0.68, H * 0.62);
      return [slot(slide, S / 2, H / 2, d, d, { frame: 'circle' })];
    }
    case 'arch': {
      const w = S * 0.62;
      return [slot(slide, S / 2, H / 2, w, Math.min(w * 1.4, H * 0.74), { frame: 'arch' })];
    }
    case 'three': {
      const m = 54;
      const g = 18;
      const w = (S - m * 2 - g * 2) / 3;
      const h = Math.min(w * 1.6, H - m * 2);
      return [0, 1, 2].map((i) => slot(slide, m + w / 2 + i * (w + g), H / 2, w, h, { radius: 8 }));
    }
    case 'hero': {
      const m = 54;
      const g = 18;
      const top = H * 0.58;
      const w = (S - m * 2 - g) / 2;
      const h = H - m - top - g;
      const y = top + g + h / 2;
      return [slot(slide, S / 2, top / 2, S, top), slot(slide, m + w / 2, y, w, h), slot(slide, S - m - w / 2, y, w, h)];
    }
    case 'caption': {
      const m = 80;
      const h = H * 0.7;
      const values = { text: 'Write a caption', font: 'serif' as const, size: 64, color: ink, align: 'center' as const, fill: null };
      const caption: TextLayer = {
        id: uid(),
        type: 'text',
        ...values,
        ...measureText(values),
        x: slide * S + S / 2,
        y: m + h + (H - m - h) / 2,
        scale: 1,
        rotation: 0,
        opacity: 1,
      };
      return [slot(slide, S / 2, m + h / 2, S - m * 2, h, { radius: 4 }), caption];
    }
  }
}
