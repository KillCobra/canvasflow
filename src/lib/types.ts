// Document model. All geometry is in export pixels: one slide is 1080px wide,
// and the full canvas is `slideCount` slides laid side by side.

export const SLIDE_WIDTH = 1080;
export const MAX_SLIDES = 20;

export type AspectId = '4:5' | '1:1' | '3:4' | '9:16';

export const ASPECTS: Record<AspectId, { label: string; height: number }> = {
  '4:5': { label: 'Portrait', height: 1350 },
  '1:1': { label: 'Square', height: 1080 },
  '3:4': { label: 'Tall', height: 1440 },
  '9:16': { label: 'Story', height: 1920 },
};

export type TextureId =
  | 'paper'
  | 'kraft'
  | 'linen'
  | 'grain'
  | 'concrete'
  | 'canvas'
  | 'grid'
  | 'dots'
  | 'lined'
  | 'speckle';

export type Background =
  | { kind: 'solid'; color: string }
  | { kind: 'gradient'; colors: [string, string]; angle: number }
  /**
   * Procedural texture across the whole canvas. `colors` is [tint, ink]: the
   * tint sits where a gradient's first stop does, so code that reads a
   * background's main colour (text ink, video fill) works unchanged.
   */
  | { kind: 'texture'; texture: TextureId; colors: [string, string] };

type LayerBase = {
  id: string;
  /** Center of the layer in canvas coordinates. */
  x: number;
  y: number;
  /** Unscaled box size. */
  w: number;
  h: number;
  scale: number;
  /** Radians. */
  rotation: number;
  opacity: number;
  /** Not drawn (editor, preview or export). */
  hidden?: boolean;
  /** Ignored by canvas gestures so layers below can be worked on. */
  locked?: boolean;
  /** Layers sharing a group id select and move together. */
  group?: string;
};

/** Normalized 0..1 rect, top-left origin, in the upright source image. */
export type NormRect = { x: number; y: number; width: number; height: number };

export type FrameShape = 'rect' | 'circle' | 'arch' | 'polaroid' | 'taped' | 'film' | 'stamp';

export type PhotoLayer = LayerBase & {
  type: 'photo';
  /** File name inside the project folder. */
  src: string;
  /** Natural width / height of the image. */
  aspect: number;
  radius: number;
  border: number;
  borderColor: string;
  /** Reposition inside the frame: offsets in -1..1 of the overflow, zoom >= 1. */
  crop?: Crop;
  /** Empty template slot waiting for a photo (src is ''). */
  slot?: boolean;
  /** Set when the layer is a video clip instead of a still. `src` is the video file. */
  video?: VideoClip;
  adjust?: Adjust;
  /** Soft drop shadow under the frame. */
  shadow?: boolean;
  /** Frame shape. Default 'rect' (rounded by `radius`). */
  frame?: FrameShape;
  /** A layout cell: dropping another photo on it moves that photo in. */
  cell?: boolean;
  /** Transparent PNG lifted out of another photo. */
  cutout?: boolean;
  /** Detected faces in the source image, used to warn when a seam cuts one. */
  faces?: NormRect[];
};

export type VideoClip = {
  /** Full source length, seconds. */
  duration: number;
  /** Trim start, seconds. */
  start: number;
  /** Trim length, seconds. */
  length: number;
  muted: boolean;
};

export type FilterId = 'none' | 'warm' | 'cool' | 'mono' | 'fade' | 'vivid' | 'film' | 'noir';

/** Colour adjustments. Sliders are -1..1, 0 = unchanged. */
export type Adjust = {
  filter: FilterId;
  exposure: number;
  contrast: number;
  saturation: number;
  warmth: number;
};

export type Crop = { x: number; y: number; zoom: number };

export type TextLayer = LayerBase & {
  type: 'text';
  text: string;
  font: FontId;
  size: number;
  color: string;
  align: 'left' | 'center' | 'right';
  /** Optional colour behind the text: a pill, or per-line highlight bars. */
  fill: string | null;
  fillStyle?: 'pill' | 'highlight';
  /** Emoji sticker: no text editing or color. */
  sticker?: boolean;
  /** Tracking as a fraction of the font size (-0.05..0.3). */
  spacing?: number;
  shadow?: boolean;
  /** Outline around the letters; width as a fraction of the font size. */
  outline?: { width: number; color: string } | null;
  /** Bend along an arc, -1..1 (0 = straight). Curved text is a single line. */
  curve?: number;
};

export type ShapeLayer = LayerBase & {
  type: 'shape';
  shape: 'rect' | 'circle' | 'line';
  color: string;
  radius: number;
};

export type Stroke = {
  /** Flat x,y pairs in the layer's local coords (origin at the layer center). */
  points: number[];
  color: string;
  /** Unscaled line width. */
  width: number;
};

/** Freehand ink. The box (w/h) is fitted around the strokes. */
export type DrawingLayer = LayerBase & {
  type: 'drawing';
  strokes: Stroke[];
};

export type Layer = PhotoLayer | TextLayer | ShapeLayer | DrawingLayer;

export type Doc = {
  id: string;
  name: string;
  aspect: AspectId;
  slideCount: number;
  background: Background;
  /** Bottom to top. */
  layers: Layer[];
  createdAt: number;
  updatedAt: number;
  /** Home screen folder id (see projects.ts); unset = not in a folder. */
  folder?: string;
};

export type BuiltinFontId =
  | 'sans'
  | 'serif'
  | 'italic'
  | 'editorial'
  | 'rounded'
  | 'mono'
  | 'script'
  | 'condensed';

/** A bundled face, or `custom:<family>` for a font imported from Files. */
export type FontId = BuiltinFontId | `custom:${string}`;

/**
 * Text styles. `family` is the Skia canvas family, `rn` the matching React
 * Native font key (same file), so the text input previews exactly what the
 * canvas draws. Older ids keep working; they map to the bundled fonts.
 */
export const FONTS: Record<BuiltinFontId, { label: string; family: string; rn: string; weight: number }> = {
  sans: { label: 'Inter', family: 'Inter', rn: 'Inter_700Bold', weight: 700 },
  serif: { label: 'Serif', family: 'Instrument Serif', rn: 'InstrumentSerif_400Regular', weight: 400 },
  italic: {
    label: 'Italic',
    family: 'Instrument Serif Italic',
    rn: 'InstrumentSerif_400Regular_Italic',
    weight: 400,
  },
  editorial: { label: 'Editorial', family: 'Playfair Display', rn: 'PlayfairDisplay_700Bold', weight: 700 },
  rounded: { label: 'Grotesk', family: 'Space Grotesk', rn: 'SpaceGrotesk_500Medium', weight: 500 },
  mono: { label: 'Mono', family: 'DM Mono', rn: 'DMMono_500Medium', weight: 500 },
  script: { label: 'Hand', family: 'Caveat', rn: 'Caveat_700Bold', weight: 700 },
  condensed: { label: 'Poster', family: 'Bebas Neue', rn: 'BebasNeue_400Regular', weight: 400 },
};

export function canvasSize(doc: Pick<Doc, 'aspect' | 'slideCount'>) {
  return { width: SLIDE_WIDTH * doc.slideCount, height: ASPECTS[doc.aspect].height };
}

export function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
