import { Blur, Group, Image, ImageFormat, Rect, type SkImage, drawAsImage } from '@shopify/react-native-skia';
import { Directory, File, Paths } from 'expo-file-system';
import { Asset, requestPermissionsAsync } from 'expo-media-library';

import { DocRenderer, type LayerPart } from '@/components/doc-renderer';

import {
  type SlideImagePart,
  type SlideVideoPart,
  exportPanVideo,
  exportSlideVideo,
  isVideoExportAvailable,
} from '../../modules/seam-video-export';

import { adjustMatrix } from './adjust';
import { isCardFrame, layersOnSlide as onSlide, photoImageRect } from './geometry';
import { type ImageMap, loadFullImage, preloadImages } from './images';
import { assetUri, writeThumb } from './projects';
import { exportFormat, recordExport } from './settings';
import { type Doc, type Layer, type PhotoLayer, SLIDE_WIDTH, canvasSize, isGrid, tileCount, tileRect } from './types';

/** Layers drawn on slide `index`; empty template slots never make it into an export. */
const layersOnSlide = (layers: Layer[], index: number) =>
  onSlide(
    layers.filter((l) => !l.hidden),
    index,
    SLIDE_WIDTH,
    true,
  );

/** Renders one slide offscreen at `outWidth` px wide. */
export function renderSlide(doc: Doc, images: ImageMap, index: number, outWidth = SLIDE_WIDTH) {
  const { height } = canvasSize(doc);
  const k = outWidth / SLIDE_WIDTH;
  return drawAsImage(
    <Group transform={[{ scale: k }, { translateX: -index * SLIDE_WIDTH }]}>
      <DocRenderer doc={doc} images={images} layers={layersOnSlide(doc.layers, index)} />
    </Group>,
    { width: Math.round(outWidth), height: Math.round(height * k) },
  );
}

/** Layers that make it into an export: visible, and no empty template slots. */
const exportLayers = (doc: Doc) => doc.layers.filter((l) => !l.hidden && (l.type !== 'photo' || !!l.src));

/** One tile of a grid puzzle (reading order), offscreen, at `outWidth` px wide. */
export function renderTile(doc: Doc, images: ImageMap, index: number, outWidth = SLIDE_WIDTH) {
  const t = tileRect(doc, index);
  const k = outWidth / SLIDE_WIDTH;
  return drawAsImage(
    <Group transform={[{ scale: k }, { translateX: -t.x }, { translateY: -t.y }]}>
      <DocRenderer doc={doc} images={images} layers={exportLayers(doc)} />
    </Group>,
    { width: Math.round(outWidth), height: Math.round(t.height * k) },
  );
}

/**
 * Posting order for a grid puzzle: Instagram puts the newest post first, so
 * the last tile (bottom right) goes up first and the first tile last.
 */
export const postingOrder = (doc: Doc) => Array.from({ length: tileCount(doc) }, (_, k) => tileCount(doc) - 1 - k);

/** The whole canvas as one wide image, capped to a sane texture size. */
function renderStrip(doc: Doc, images: ImageMap, maxWidth = 8000) {
  const { width, height } = canvasSize(doc);
  const k = Math.min(1, maxWidth / width, 8000 / height);
  return drawAsImage(
    <Group transform={[{ scale: k }]}>
      <DocRenderer doc={doc} images={images} layers={exportLayers(doc)} />
    </Group>,
    { width: Math.round(width * k), height: Math.round(height * k) },
  );
}

/** A finished image, in the format chosen in Settings → Export. */
function writeExport(image: SkImage, dir: Directory, base: string) {
  const png = exportFormat() === 'png';
  const file = new File(dir, `${base}.${png ? 'png' : 'jpg'}`);
  if (file.exists) file.delete();
  file.write(png ? image.encodeToBytes(ImageFormat.PNG) : image.encodeToBytes(ImageFormat.JPEG, 95));
  return file;
}

function writeTemp(image: SkImage, name: string) {
  const file = new File(Paths.cache, name);
  if (file.exists) file.delete();
  file.write(image.encodeToBytes(ImageFormat.JPEG, 95));
  return file;
}

const nextFrame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

/**
 * Full-resolution photos for export, decoded when a slide first needs them
 * and disposed after the last slide that uses them.
 */
class FullImages {
  private images: ImageMap = {};
  private lastUse = new Map<string, number>();
  private docId: string;

  constructor(docId: string, slides: Layer[][]) {
    this.docId = docId;
    slides.forEach((layers, i) => {
      for (const l of layers) if (l.type === 'photo' && l.src) this.lastUse.set(l.src, i);
    });
  }

  async forSlide(layers: Layer[]) {
    for (const l of layers) {
      if (l.type === 'photo' && l.src && !this.images[l.src]) {
        this.images[l.src] = (await loadFullImage(this.docId, l.src)) ?? undefined;
      }
    }
    return this.images;
  }

  releaseAfter(slide: number) {
    for (const [src, last] of this.lastUse) {
      if (last <= slide && this.images[src]) {
        this.images[src]?.dispose();
        delete this.images[src];
      }
    }
  }

  releaseAll() {
    this.releaseAfter(Infinity);
  }
}

/**
 * slides: one file per slide. strip: the whole canvas as one image.
 * swipe: a video panning across the slides at the post's size.
 * reel: the same pan inside a 9:16 frame for Reels/TikTok.
 */
export type ExportMode = 'slides' | 'strip' | 'swipe' | 'reel' | 'grid';

export type ExportProgress = {
  /** Slides finished, plus the fraction of the current one (0..total). */
  done: number;
  total: number;
  /** 1-based slide being rendered. */
  current: number;
  /** The current slide is being encoded as a video. */
  video: boolean;
  /** Overrides the default "Rendering · slide n of m" status. */
  label?: string;
};

export type ExportResult = {
  saved: number;
  videos: number;
  /** Video slides saved as a still because this build can't encode video. */
  stills: number;
};

const isVideoLayer = (l: Layer): l is PhotoLayer => l.type === 'photo' && !!l.video && !!l.src && !l.hidden;

/**
 * Saves the slides to Photos in swipe order (one at a time so they sort
 * correctly in the Instagram picker). Slides with video become MP4s when the
 * native encoder is available, otherwise a still of the poster frame.
 */
export async function exportToPhotos(
  doc: Doc,
  mode: ExportMode,
  onProgress?: (p: ExportProgress) => void,
): Promise<ExportResult> {
  const permission = await requestPermissionsAsync(true);
  if (!permission.granted) throw new Error('Photos access is needed to save your slides.');

  const stamp = Date.now();

  if (mode === 'swipe' || mode === 'reel') {
    const video = await exportSwipeVideo(doc, mode, new File(Paths.cache, `seam-${stamp}-${mode}.mp4`), onProgress);
    try {
      await Asset.create(video.uri);
    } finally {
      if (video.exists) video.delete();
    }
    recordExport(1);
    return { saved: 1, videos: 1, stills: 0 };
  }

  if (mode === 'grid') {
    // One file per tile, saved in posting order so the Photos library lists them that way.
    const order = postingOrder(doc);
    const total = order.length;
    const full = new FullImages(doc.id, [doc.layers]);
    try {
      const images = await full.forSlide(doc.layers);
      for (let k = 0; k < total; k++) {
        onProgress?.({ done: k, total, current: k + 1, video: false, label: `Saving post ${k + 1} of ${total}` });
        const image = await renderTile(doc, images, order[k]);
        if (!image) throw new Error(`Could not render post ${k + 1}.`);
        const file = writeExport(image, Paths.cache, `seam-${stamp}-post-${String(k + 1).padStart(2, '0')}`);
        image.dispose();
        await Asset.create(file.uri);
        file.delete();
        await nextFrame();
      }
    } finally {
      full.releaseAll();
    }
    onProgress?.({ done: total, total, current: total, video: false });
    recordExport(total);
    return { saved: total, videos: 0, stills: doc.layers.some(isVideoLayer) ? total : 0 };
  }

  if (mode === 'strip') {
    const full = new FullImages(doc.id, [doc.layers]);
    try {
      const image = await renderStrip(doc, await full.forSlide(doc.layers));
      if (!image) throw new Error('Could not render the panorama.');
      const file = writeExport(image, Paths.cache, `seam-${stamp}-strip`);
      image.dispose();
      await Asset.create(file.uri);
      file.delete();
    } finally {
      full.releaseAll();
    }
    onProgress?.({ done: 1, total: 1, current: 1, video: false });
    recordExport(1);
    return { saved: 1, videos: 0, stills: doc.layers.some(isVideoLayer) ? 1 : 0 };
  }

  const total = doc.slideCount;
  const canEncode = isVideoExportAvailable();
  const result: ExportResult = { saved: 0, videos: 0, stills: 0 };
  const slides = Array.from({ length: total }, (_, i) => layersOnSlide(doc.layers, i));
  const full = new FullImages(doc.id, slides);
  try {
    for (let i = 0; i < total; i++) {
      const name = `seam-${stamp}-${String(i + 1).padStart(2, '0')}`;
      const images = await full.forSlide(slides[i]);
      const hasVideo = slides[i].some(isVideoLayer);
      onProgress?.({ done: i, total, current: i + 1, video: hasVideo && canEncode });

      if (hasVideo && canEncode) {
        const uri = await exportVideoSlide(doc, images, slides[i], i, name, (f) =>
          onProgress?.({ done: i + f, total, current: i + 1, video: true }),
        );
        await Asset.create(uri);
        new File(uri).delete();
        result.videos++;
      } else {
        const image = await renderSlide(doc, images, i);
        if (!image) throw new Error(`Could not render slide ${i + 1}.`);
        const file = writeExport(image, Paths.cache, name);
        image.dispose();
        await Asset.create(file.uri);
        file.delete();
        if (hasVideo) result.stills++;
      }
      result.saved++;
      full.releaseAfter(i);
      onProgress?.({ done: i + 1, total, current: i + 1, video: false });
      // Let the progress UI paint between slides.
      await nextFrame();
    }
  } finally {
    full.releaseAll();
  }
  recordExport(result.saved);
  return result;
}

/** One file for the share sheet: a single slide, the panorama, or the swipe video. */
export type ShareTarget = { kind: 'slide'; index: number } | { kind: 'strip' } | { kind: 'swipe' };

/** A clean folder per share; the files from the last share are dropped. */
function shareDir() {
  const dir = new Directory(Paths.cache, 'seam-share');
  if (dir.exists) dir.delete();
  dir.create({ intermediates: true });
  return dir;
}

/** The project name as a file name (it's what AirDrop and Files show). */
const fileBase = (doc: Doc) =>
  doc.name
    .replace(/[\\/:*?"<>|#%\s]+/g, ' ')
    .trim()
    .slice(0, 40) || 'Seam';

/**
 * Renders `target` to a file in the cache for the share sheet, without
 * touching Photos. Resolves the file:// URI. The file stays until the next
 * share (the receiving app may still be reading it when the sheet closes).
 */
export async function exportForShare(
  doc: Doc,
  target: ShareTarget,
  onProgress?: (p: ExportProgress) => void,
): Promise<string> {
  const dir = shareDir();
  const base = fileBase(doc);

  if (target.kind === 'swipe') {
    return (await exportSwipeVideo(doc, 'swipe', new File(dir, `${base} swipe.mp4`), onProgress)).uri;
  }

  const index = Math.max(0, Math.min(doc.slideCount - 1, target.kind === 'slide' ? target.index : 0));
  const layers = target.kind === 'strip' ? doc.layers : layersOnSlide(doc.layers, index);
  const full = new FullImages(doc.id, [layers]);
  try {
    const images = await full.forSlide(layers);
    if (target.kind === 'slide' && layers.some(isVideoLayer) && isVideoExportAvailable()) {
      onProgress?.({ done: 0, total: 1, current: 1, video: true });
      return await exportVideoSlide(
        doc,
        images,
        layers,
        index,
        `${base} ${index + 1}`,
        (f) => onProgress?.({ done: f, total: 1, current: 1, video: true }),
        dir,
      );
    }
    const image =
      target.kind === 'strip'
        ? await renderStrip(doc, images)
        : await renderSlide(doc, images, index);
    if (!image) throw new Error('Could not render the image.');
    const file = writeExport(image, dir, target.kind === 'strip' ? `${base} panorama` : `${base} ${index + 1}`);
    image.dispose();
    onProgress?.({ done: 1, total: 1, current: 1, video: false });
    return file.uri;
  } finally {
    full.releaseAll();
  }
}

/**
 * Splits the slide into still layers (rendered here as transparent PNGs) and
 * video layers (decoded and composited natively, frame by frame), in z-order.
 * A video layer's shadow goes in the still below it and its border in the
 * still above it.
 */
async function exportVideoSlide(
  doc: Doc,
  images: ImageMap,
  layers: Layer[],
  index: number,
  name: string,
  onProgress: (fraction: number) => void,
  outDir: Directory = Paths.cache,
) {
  const { height } = canvasSize(doc);
  const parts: (SlideImagePart | SlideVideoPart)[] = [];
  const temp: File[] = [];
  let group: Layer[] = [];
  let groupParts: Record<string, LayerPart> = {};
  let first = true;

  const flush = async () => {
    if (group.length === 0 && !first) return;
    const image = await drawAsImage(
      <Group transform={[{ translateX: -index * SLIDE_WIDTH }]}>
        <DocRenderer doc={doc} images={images} layers={group} parts={groupParts} noBackground={!first} />
      </Group>,
      { width: SLIDE_WIDTH, height },
    );
    if (!image) throw new Error(`Could not render slide ${index + 1}.`);
    const file = new File(Paths.cache, `${name}-${parts.length}.png`);
    if (file.exists) file.delete();
    file.write(image.encodeToBytes(ImageFormat.PNG));
    image.dispose();
    temp.push(file);
    parts.push({ type: 'image', uri: file.uri });
    group = [];
    groupParts = {};
    first = false;
  };

  for (const l of layers) {
    if (!isVideoLayer(l)) {
      group.push(l);
      continue;
    }
    group.push(l);
    groupParts[l.id] = 'under';
    await flush();
    const clip = l.video!;
    const cos = Math.cos(l.rotation) * l.scale;
    const sin = Math.sin(l.rotation) * l.scale;
    const r = photoImageRect(l);
    const shape = l.frame ?? 'rect';
    // Card frames (polaroid, taped, film, stamp) clip the video to their
    // window; the card itself is in the still parts around it.
    const card = isCardFrame(shape);
    parts.push({
      type: 'video',
      uri: assetUri(doc.id, l.src),
      start: clip.start,
      length: clip.length,
      matrix: [cos, sin, -sin, cos, l.x - index * SLIDE_WIDTH, l.y],
      frameWidth: l.w,
      frameHeight: l.h,
      // Same clip as DocRenderer.
      cornerRadius: card ? Math.min(l.radius, 6) : l.radius,
      clip: shape === 'circle' ? 'ellipse' : shape === 'arch' ? 'arch' : 'roundedRect',
      frameRect: card ? r.inner : null,
      drawRect: { x: r.x, y: r.y, width: r.width, height: r.height },
      opacity: l.opacity,
      colorMatrix: adjustMatrix(l.adjust),
    });
    group = [l];
    groupParts = { [l.id]: 'over' };
  }
  await flush();

  const videos = layers.filter(isVideoLayer);
  const duration = Math.min(60, Math.max(...videos.map((v) => v.video!.length)));
  // Sound comes from the biggest unmuted clip on the slide.
  const voiced = videos
    .filter((v) => !v.video!.muted)
    .sort((a, b) => b.w * b.h * b.scale ** 2 - a.w * a.h * a.scale ** 2)[0];

  const output = new File(outDir, `${name}.mp4`);
  if (output.exists) output.delete();
  try {
    return await exportSlideVideo(
      {
        width: SLIDE_WIDTH,
        height,
        fps: 30,
        duration,
        parts,
        audio: voiced ? { uri: assetUri(doc.id, voiced.src), start: voiced.video!.start, volume: 1 } : null,
        outputUri: output.uri,
      },
      onProgress,
    );
  } finally {
    temp.forEach((f) => f.exists && f.delete());
  }
}

const REEL = { width: 1080, height: 1920 };

/**
 * A silent video that swipes through the carousel, slide by slide, the way
 * it plays on Instagram. `reel` frames it in 9:16 over a blurred backdrop
 * with page dots; `swipe` is the post's own size.
 */
async function exportSwipeVideo(
  doc: Doc,
  mode: 'swipe' | 'reel',
  output: File,
  onProgress?: (p: ExportProgress) => void,
): Promise<File> {
  if (!isVideoExportAvailable()) throw new Error('Swipe videos need the Seam app build (Expo Go can’t encode video).');
  const { height } = canvasSize(doc);
  const n = doc.slideCount;
  const reel = mode === 'reel';
  const out = reel ? REEL : { width: SLIDE_WIDTH, height: even(height) };
  const winW = reel ? 952 : SLIDE_WIDTH;
  const winH = Math.round((height * winW) / SLIDE_WIDTH);
  const window = reel
    ? { x: (out.width - winW) / 2, y: Math.max(48, Math.round((out.height - winH) / 2 - 40)), width: winW, height: winH }
    : { x: 0, y: 0, width: winW, height: winH };
  const status = (done: number, label: string) => onProgress?.({ done, total: 1, current: 1, video: true, label });
  const name = output.name.replace(/\.mp4$/, '');

  const slides = Array.from({ length: n }, (_, i) => layersOnSlide(doc.layers, i));
  const full = new FullImages(doc.id, slides);
  const temp: File[] = [];
  let first: SkImage | null = null;
  try {
    for (let i = 0; i < n; i++) {
      status((i / n) * 0.3, `Rendering slide ${i + 1} of ${n}`);
      const image = await renderSlide(doc, await full.forSlide(slides[i]), i, winW);
      if (!image) throw new Error(`Could not render slide ${i + 1}.`);
      temp.push(writeTemp(image, `${name}-${i}.jpg`));
      if (i === 0 && reel) first = image;
      else image.dispose();
      full.releaseAfter(i);
      await nextFrame();
    }

    let backgroundImage: string | null = null;
    if (reel && first) {
      const bg = await renderBackdrop(first);
      if (bg) {
        const file = writeTemp(bg, `${name}-bg.jpg`);
        bg.dispose();
        temp.push(file);
        backgroundImage = file.uri;
      }
    }

    if (output.exists) output.delete();
    status(0.3, 'Encoding swipe video');
    await exportPanVideo(
      {
        slides: temp.slice(0, n).map((f) => f.uri),
        width: out.width,
        height: out.height,
        window,
        background: reel ? '#0A0A0A' : solidHex(doc),
        backgroundImage,
        cornerRadius: reel ? 26 : 0,
        fps: 30,
        hold: 1.5,
        move: 0.55,
        dots: reel && n > 1
          ? { y: window.y + winH + 46, color: '#FFFFFF59', activeColor: '#FFFFFF', size: 13, gap: 11 }
          : null,
        outputUri: output.uri,
      },
      (f) => status(0.3 + f * 0.7, 'Encoding swipe video'),
    );
    return output;
  } catch (e) {
    if (output.exists) output.delete();
    throw e;
  } finally {
    first?.dispose();
    full.releaseAll();
    temp.forEach((f) => f.exists && f.delete());
  }
}

/** First slide, blown up to fill the reel frame, blurred and dimmed. */
function renderBackdrop(image: SkImage) {
  const { width, height } = REEL;
  const k = Math.max(width / image.width(), height / image.height()) * 1.15;
  const w = image.width() * k;
  const h = image.height() * k;
  return drawAsImage(
    <Group>
      <Image image={image} x={(width - w) / 2} y={(height - h) / 2} width={w} height={h} fit="fill">
        <Blur blur={70} mode="clamp" />
      </Image>
      <Rect x={0} y={0} width={width} height={height} color="#0000008C" />
    </Group>,
    REEL,
  );
}

const even = (v: number) => Math.round(v / 2) * 2;

/** The background as an opaque #RRGGBB (gradients use their first stop, textures their tint). */
function solidHex(doc: Doc) {
  const c = doc.background.kind === 'solid' ? doc.background.color : doc.background.colors[0];
  return /^#[0-9a-f]{6}/i.test(c) ? c.slice(0, 7) : '#000000';
}

export async function updateThumbnail(doc: Doc) {
  const images = await preloadImages(doc.id, doc.layers);
  // A grid puzzle's thumbnail is the whole grid, sharp enough to cut into tiles for the planner.
  const image = isGrid(doc) ? await renderStrip(doc, images, 1080) : await renderSlide(doc, images, 0, 360);
  if (image) {
    writeThumb(doc.id, image.encodeToBytes(ImageFormat.JPEG, 80));
    image.dispose();
  }
}
