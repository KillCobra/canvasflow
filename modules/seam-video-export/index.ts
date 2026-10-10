import { NativeModule, requireOptionalNativeModule } from 'expo';

/** CG affine [a, b, c, d, tx, ty]: x' = a*x + c*y + tx, y' = b*x + d*y + ty */
export type Matrix = [number, number, number, number, number, number];

export type SlideImagePart = {
  type: 'image';
  /** file:// URI of a PNG exactly width x height px, may be transparent. Drawn full-frame. */
  uri: string;
};

export type SlideVideoPart = {
  type: 'video';
  /** file:// URI of the source video (mp4/mov from the photo library, possibly rotated via preferredTransform). */
  uri: string;
  /** Source time in seconds where this clip starts. */
  start: number;
  /** Clip length in seconds; if the slide duration is longer, the clip LOOPS from `start`. */
  length: number;
  /** Maps the layer's LOCAL coordinate space to OUTPUT PIXELS (top-left origin, y down). */
  matrix: Matrix;
  /** The layer's frame in local coords is the rect (-frameWidth/2, -frameHeight/2, frameWidth, frameHeight). Everything drawn for this layer is clipped to it (with cornerRadius). */
  frameWidth: number;
  frameHeight: number;
  cornerRadius: number;
  /** Where the full, upright (rotation-corrected) video frame is drawn, in the same local coords (may extend beyond the frame; it gets clipped). */
  drawRect: { x: number; y: number; width: number; height: number };
  /** 0..1 */
  opacity: number;
  /** Optional 4x5 row-major color matrix (20 numbers), same semantics as Skia ColorMatrix / CIColorMatrix with normalized 0..1 bias in column 5. Apply to the video frame before drawing. */
  colorMatrix?: number[] | null;
  /** Clip shape for the frame. Default 'roundedRect' (uses cornerRadius). 'ellipse' fills the frame rect; 'arch' = rect whose top edge is a half-ellipse spanning the full width (height of the arch cap = frame width / 2, clamped to frame height). */
  clip?: 'roundedRect' | 'ellipse' | 'arch';
  /** Overrides the centered frame rect (-frameWidth/2, -frameHeight/2, frameWidth, frameHeight), in the same local coords. Used for polaroid-style insets. */
  frameRect?: { x: number; y: number; width: number; height: number } | null;
};

export type ExportSlideOptions = {
  /** Output px, e.g. 1080 */
  width: number;
  /** e.g. 1350 */
  height: number;
  /** e.g. 30 */
  fps: number;
  /** Seconds of output */
  duration: number;
  /** Bottom to top. Images and videos interleave in z-order. */
  parts: (SlideImagePart | SlideVideoPart)[];
  /** Optional audio: taken from this video's audio track from `start`, for `duration` (clamped to the source; silence after), at `volume` 0..1. Omit/null for silent output. */
  audio?: { uri: string; start: number; volume: number } | null;
  /** file:// URI where the .mp4 is written (overwrite if exists). */
  outputUri: string;
};

export type PanVideoOptions = {
  /** file:// URIs of each slide rendered as an image exactly window.width x window.height px, in order. */
  slides: string[];
  /** Output px, e.g. 1080 */
  width: number;
  /** e.g. 1350 or 1920 */
  height: number;
  /** Where the slide viewport sits in the output (px, top-left origin). */
  window: { x: number; y: number; width: number; height: number };
  /** '#RRGGBB' fill for the whole frame (visible outside the window). */
  background: string;
  /** Optional full-frame image drawn over the background, under the window (e.g. a blurred version of slide 1). */
  backgroundImage?: string | null;
  /** Rounding of the window, px */
  cornerRadius?: number;
  /** e.g. 30 */
  fps: number;
  /** Seconds resting on each slide, e.g. 1.6 */
  hold: number;
  /** Seconds per transition, e.g. 0.55 */
  move: number;
  /** Optional page dots under the window, Instagram style. y = center line in output px. */
  dots?: { y: number; color: string; activeColor: string; size: number; gap: number } | null;
  /** 'zoom': a slow push-in on each slide that eases back for the swipe. Default 'none'. */
  motion?: 'none' | 'zoom';
  /** Optional soundtrack, e.g. a song from Files (from `start` s, faded out at the end). */
  audio?: { uri: string; start: number; volume: number } | null;
  /** file:// URI where the .mp4 is written (overwrite if exists). */
  outputUri: string;
};

export type GridRevealOptions = {
  /** file:// URIs of each tile in reading order (left to right, top to bottom). */
  tiles: string[];
  columns: number;
  rows: number;
  /** Output px, e.g. 1080 x 1920 */
  width: number;
  height: number;
  /** '#RRGGBB' */
  background: string;
  /** Px between tiles */
  gap: number;
  /** Tile indices in the order they appear (posting order). */
  order: number[];
  fps: number;
  /** Seconds between tiles */
  step: number;
  /** Seconds on the finished grid */
  hold: number;
  audio?: { uri: string; start: number; volume: number } | null;
  outputUri: string;
};

type ProgressEvent = { id: string; fraction: number };

type SeamVideoExportEvents = {
  onProgress: (event: ProgressEvent) => void;
};

declare class SeamVideoExportNativeModule extends NativeModule<SeamVideoExportEvents> {
  exportSlideVideo(id: string, options: ExportSlideOptions): Promise<string>;
  exportPanVideo(id: string, options: PanVideoOptions): Promise<string>;
  exportGridReveal(id: string, options: GridRevealOptions): Promise<string>;
}

// Null in Expo Go / Android / web, where the native module isn't compiled in.
const NativeSeamVideoExport =
  requireOptionalNativeModule<SeamVideoExportNativeModule>('SeamVideoExport');

let nextExportId = 0;

export function isVideoExportAvailable(): boolean {
  return NativeSeamVideoExport != null;
}

function requireNative(): SeamVideoExportNativeModule {
  const native = NativeSeamVideoExport;
  if (!native) {
    throw new Error(
      'Video export is unavailable: the SeamVideoExport native module is not in this build (Expo Go is not supported; use a development build on iOS).',
    );
  }
  return native;
}

/** Subscribes to progress events for one export call (events carry the call's id). */
async function withProgress<T>(
  native: SeamVideoExportNativeModule,
  prefix: string,
  onProgress: ((fraction: number) => void) | undefined,
  run: (id: string) => Promise<T>,
): Promise<T> {
  const id = `${prefix}-${Date.now()}-${nextExportId++}`;
  const subscription = onProgress
    ? native.addListener('onProgress', (event: ProgressEvent) => {
        if (event.id === id) {
          onProgress(Math.min(1, Math.max(0, event.fraction)));
        }
      })
    : null;
  try {
    return await run(id);
  } finally {
    subscription?.remove();
  }
}

/** Resolves with outputUri when done. */
export async function exportSlideVideo(
  options: ExportSlideOptions,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const native = requireNative();
  return withProgress(native, 'seam-export', onProgress, (id) =>
    native.exportSlideVideo(id, {
      ...options,
      audio: options.audio ?? null,
      parts: options.parts.map((part) =>
        part.type === 'video'
          ? {
              ...part,
              colorMatrix: part.colorMatrix ?? null,
              clip: part.clip ?? 'roundedRect',
              frameRect: part.frameRect ?? null,
            }
          : part,
      ),
    }),
  );
}

/**
 * Renders a silent "swipe preview" MP4 that pans across the slides like a finger swiping
 * through the carousel. Total length = n*hold + (n-1)*move seconds. Resolves with outputUri.
 */
export async function exportPanVideo(
  options: PanVideoOptions,
  onProgress?: (fraction: number) => void,
): Promise<string> {
  const native = requireNative();
  return withProgress(native, 'seam-pan', onProgress, (id) =>
    native.exportPanVideo(id, {
      ...options,
      backgroundImage: options.backgroundImage ?? null,
      cornerRadius: options.cornerRadius ?? 0,
      dots: options.dots ?? null,
      motion: options.motion ?? 'none',
      audio: options.audio ?? null,
    }),
  );
}

/** A Reel of a grid puzzle assembling tile by tile, in posting order. Resolves with outputUri. */
export async function exportGridReveal(options: GridRevealOptions, onProgress?: (fraction: number) => void): Promise<string> {
  const native = requireNative();
  return withProgress(native, 'seam-grid', onProgress, (id) =>
    native.exportGridReveal(id, { ...options, audio: options.audio ?? null }),
  );
}
