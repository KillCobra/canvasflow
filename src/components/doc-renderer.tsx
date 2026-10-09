import {
  BlendColor,
  ColorMatrix,
  DashPathEffect,
  FilterMode,
  Group,
  Image,
  LinearGradient,
  MipmapMode,
  Morphology,
  Oval,
  Paint,
  Paragraph,
  Path,
  Rect,
  RoundedRect,
  Shadow,
  type SkImage,
  type SkPath,
  type SkRect,
  Skia,
  TextPath,
  type Transforms3d,
  rrect,
  useVideo,
  vec,
} from '@shopify/react-native-skia';
import type { ReactNode } from 'react';
import { type SharedValue, useAnimatedReaction, useDerivedValue, useSharedValue } from 'react-native-reanimated';

import { type Matrix20, adjustMatrix } from '@/lib/adjust';
import { type GroupDelta, applyGroupDelta, archCap, frameInner, photoImageRect } from '@/lib/geometry';
import type { ImageMap } from '@/lib/images';
import { assetUri } from '@/lib/projects';
import { buildParagraph, curveLayout, highlightBars, isCurved, outlinePx, textPad } from '@/lib/text';
import {
  type Background,
  type Crop,
  type Doc,
  type FrameShape,
  type Layer,
  type PhotoLayer,
  type TextLayer,
  canvasSize,
} from '@/lib/types';

// Pure Skia rendering of a document in canvas coordinates. Used by the
// editor, the swipe preview, thumbnails and the per-slide export, so what
// you see is exactly what gets saved.

const SAMPLING = { filter: FilterMode.Linear, mipmap: MipmapMode.Linear };

/**
 * For video export: draw only part of a layer. 'under' = just its shadow
 * (goes below the video), 'over' = just its border (goes above).
 */
export type LayerPart = 'under' | 'over';

type Props = {
  doc: Doc;
  images: ImageMap;
  /** Only draw these layers (export skips layers off the slide). Defaults to all. */
  layers?: Layer[];
  /** Layer whose transform is driven live by a gesture. */
  liveId?: string | null;
  liveTransform?: SharedValue<Transforms3d>;
  /** Live crop for `liveId` while repositioning a photo inside its frame. */
  liveCrop?: SharedValue<Crop> | null;
  /** Play video layers (editor, preview). Otherwise their poster frame is drawn. */
  playVideo?: boolean;
  /** Play unmuted clips with sound (preview only). */
  sound?: boolean;
  noBackground?: boolean;
  parts?: Record<string, LayerPart>;
  /** Multi-selection being dragged: these layers follow `groupDelta` live. */
  groupIds?: string[];
  groupDelta?: SharedValue<GroupDelta>;
  /** Document version; a group delta from an older version is ignored. */
  stamp?: number;
};

export function DocRenderer({
  doc,
  images,
  layers = doc.layers,
  liveId,
  liveTransform,
  liveCrop,
  playVideo = false,
  sound = false,
  noBackground = false,
  parts,
  groupIds,
  groupDelta,
  stamp = 0,
}: Props) {
  const { width, height } = canvasSize(doc);
  return (
    <Group>
      {!noBackground && <BackgroundFill background={doc.background} width={width} height={height} />}
      {layers.map((layer) => {
        if (layer.hidden) return null;
        const live = layer.id === liveId;
        if (groupDelta && groupIds?.includes(layer.id)) {
          return (
            <GroupLiveNode
              key={layer.id}
              docId={doc.id}
              layer={layer}
              image={layer.type === 'photo' ? images[layer.src] : undefined}
              delta={groupDelta}
              stamp={stamp}
              playVideo={playVideo}
            />
          );
        }
        return (
          <LayerNode
            key={layer.id}
            docId={doc.id}
            layer={layer}
            image={layer.type === 'photo' ? images[layer.src] : undefined}
            transform={live ? liveTransform : undefined}
            crop={live ? liveCrop : undefined}
            playVideo={playVideo}
            sound={sound}
            part={parts?.[layer.id]}
          />
        );
      })}
    </Group>
  );
}

export function layerTransform(l: Pick<Layer, 'x' | 'y' | 'rotation' | 'scale'>): Transforms3d {
  return [{ translateX: l.x }, { translateY: l.y }, { rotate: l.rotation }, { scale: l.scale }];
}

/** One layer. Props only change when this layer does, so the compiler can skip the rest. */
function LayerNode({
  docId,
  layer,
  image,
  transform,
  crop,
  playVideo,
  sound,
  part,
}: {
  docId: string;
  layer: Layer;
  image?: SkImage;
  transform?: SharedValue<Transforms3d>;
  crop?: SharedValue<Crop> | null;
  playVideo: boolean;
  sound: boolean;
  part?: LayerPart;
}) {
  return (
    <Group transform={transform ?? layerTransform(layer)} opacity={layer.opacity}>
      {layer.type === 'photo' ? (
        <Photo
          docId={docId}
          layer={layer}
          image={image}
          liveCrop={crop ?? null}
          playVideo={playVideo}
          sound={sound}
          part={part}
        />
      ) : (
        <LayerContent layer={layer} />
      )}
    </Group>
  );
}

/** The transform of a layer while its multi-selection is being moved. */
export function useGroupTransform(layer: Layer, delta: SharedValue<GroupDelta>, stamp?: number) {
  // Worklet closure; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const { x, y, scale, rotation } = layer;
  return useDerivedValue<Transforms3d>(() => {
    const d = delta.get();
    // After the move is committed the layer's own x/y already include it.
    if (stamp !== undefined && d.stamp !== stamp) {
      return [{ translateX: x }, { translateY: y }, { rotate: rotation }, { scale }];
    }
    const t = applyGroupDelta({ x, y, scale, rotation }, d);
    return [{ translateX: t.x }, { translateY: t.y }, { rotate: t.rotation }, { scale: t.scale }];
  });
}

function GroupLiveNode({
  docId,
  layer,
  image,
  delta,
  stamp,
  playVideo,
}: {
  docId: string;
  layer: Layer;
  image?: SkImage;
  delta: SharedValue<GroupDelta>;
  stamp: number;
  playVideo: boolean;
}) {
  'use no memo';
  const transform = useGroupTransform(layer, delta, stamp);
  return (
    <LayerNode
      docId={docId}
      layer={layer}
      image={image}
      transform={transform}
      playVideo={playVideo}
      sound={false}
    />
  );
}

function BackgroundFill({
  background,
  width,
  height,
}: {
  background: Background;
  width: number;
  height: number;
}) {
  if (background.kind === 'solid') {
    return <Rect x={0} y={0} width={width} height={height} color={background.color} />;
  }
  // CSS-style gradient line: runs along the true angle and is just long
  // enough for the corners to hit the end colors, across the whole canvas so
  // it flows seamlessly between slides.
  const cx = width / 2;
  const cy = height / 2;
  const cos = Math.cos(background.angle);
  const sin = Math.sin(background.angle);
  const half = (Math.abs(width * cos) + Math.abs(height * sin)) / 2;
  return (
    <Rect x={0} y={0} width={width} height={height}>
      <LinearGradient
        start={vec(cx - cos * half, cy - sin * half)}
        end={vec(cx + cos * half, cy + sin * half)}
        colors={background.colors}
      />
    </Rect>
  );
}

function Photo({
  docId,
  layer,
  image,
  liveCrop,
  playVideo,
  sound,
  part,
}: {
  docId: string;
  layer: PhotoLayer;
  image?: SkImage;
  liveCrop: SharedValue<Crop> | null;
  playVideo: boolean;
  sound: boolean;
  part?: LayerPart;
}) {
  const { w, h } = layer;
  const x = -w / 2;
  const y = -h / 2;
  const b = layer.border;
  const shape = layer.frame ?? 'rect';
  const inner = frameInner(layer);
  const matrix = adjustMatrix(layer.adjust);
  const showBody = part == null;
  const showUnder = part == null || part === 'under';
  const showBorder = part == null || part === 'over';
  const outer = framePath(shape, { x, y, width: w, height: h }, layer.radius);
  // A polaroid's image sits in a square-cornered window inside the card.
  const clip =
    shape === 'polaroid' ? framePath('rect', inner, Math.min(layer.radius, 6)) : outer;

  if (layer.cutout && layer.src) return image ? <CutoutSticker layer={layer} image={image} matrix={matrix} /> : null;

  let body;
  if (!layer.src) body = <SlotPlaceholder rect={inner} />;
  else if (layer.video && playVideo) {
    body = (
      <VideoImage
        uri={assetUri(docId, layer.src)}
        layer={layer}
        crop={liveCrop}
        matrix={matrix}
        volume={sound && !layer.video.muted ? 1 : 0}
      />
    );
  } else if (!image) body = <Rect {...inner} color="#8E8B8522" />;
  else if (liveCrop) body = <LiveCroppedImage layer={layer} image={image} crop={liveCrop} matrix={matrix} />;
  else body = <StaticCroppedImage layer={layer} image={image} matrix={matrix} />;

  return (
    <Group>
      {showUnder && layer.shadow && layer.src && (
        <Path path={outer} color="#000">
          <Shadow dx={0} dy={Math.min(w, h) * 0.025} blur={Math.min(w, h) * 0.05} color="#0000008C" shadowOnly />
        </Path>
      )}
      {showUnder && shape === 'polaroid' && <Path path={outer} color={layer.borderColor || '#FFFFFF'} />}
      {showBody && <Group clip={clip}>{body}</Group>}
      {showBorder && b > 0 && (
        <Path
          path={framePath(
            shape,
            { x: x + b / 2, y: y + b / 2, width: w - b, height: h - b },
            Math.max(0, layer.radius - b / 2),
          )}
          style="stroke"
          strokeWidth={b}
          color={shape === 'polaroid' ? '#00000014' : layer.borderColor}
        />
      )}
    </Group>
  );
}

/**
 * A lifted subject. Its outline and shadow follow the subject's edge (from
 * the PNG's alpha) rather than the layer box.
 */
function CutoutSticker({ layer, image, matrix }: { layer: PhotoLayer; image: SkImage; matrix: Matrix20 | null }) {
  const r = photoImageRect(layer);
  const m = Math.min(layer.w, layer.h);
  const draw = (paint?: ReactNode) => (
    <Image image={image} x={r.x} y={r.y} width={r.width} height={r.height} fit="fill" sampling={SAMPLING}>
      {paint}
    </Image>
  );
  const sticker = (
    <Group>
      {layer.border > 0 && (
        <OutlineLayer radius={layer.border}>{draw(<BlendColor color={layer.borderColor} mode="srcIn" />)}</OutlineLayer>
      )}
      {draw(matrix && <ColorMatrix matrix={matrix} />)}
    </Group>
  );
  if (!layer.shadow) return sticker;
  return (
    <Group
      layer={
        <Paint>
          <Shadow dx={0} dy={m * 0.02} blur={m * 0.035} color="#00000073" />
        </Paint>
      }>
      {sticker}
    </Group>
  );
}

/** Outline of a frame shape around `r`. */
export function framePath(shape: FrameShape, r: SkRect, radius: number): SkPath {
  const b = Skia.PathBuilder.Make();
  if (shape === 'circle') return b.addOval(r).build();
  if (shape === 'arch') {
    const cap = archCap(r.width, r.height);
    return b
      .moveTo(r.x, r.y + r.height)
      .lineTo(r.x, r.y + cap)
      .arcToOval({ x: r.x, y: r.y, width: r.width, height: cap * 2 }, 180, 180, false)
      .lineTo(r.x + r.width, r.y + r.height)
      .close()
      .build();
  }
  const rr = shape === 'polaroid' ? Math.min(radius, 10) : radius;
  return b.addRRect(rrect(r, rr, rr)).build();
}

/** Empty template slot: a soft tile with a dashed edge and a plus, sized to the frame. */
function SlotPlaceholder({ rect: r }: { rect: SkRect }) {
  const m = Math.min(r.width, r.height);
  const arm = m * 0.07;
  const stroke = Math.max(4, m * 0.008);
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  return (
    <Group>
      <Rect {...r} color="#8E8B8530" />
      <Rect
        x={r.x + stroke}
        y={r.y + stroke}
        width={r.width - stroke * 2}
        height={r.height - stroke * 2}
        color="#8E8B85AA"
        style="stroke"
        strokeWidth={stroke}>
        <DashPathEffect intervals={[stroke * 5, stroke * 4]} />
      </Rect>
      <Rect x={cx - arm} y={cy - stroke / 2} width={arm * 2} height={stroke} color="#8E8B85" />
      <Rect x={cx - stroke / 2} y={cy - arm} width={stroke} height={arm * 2} color="#8E8B85" />
    </Group>
  );
}

function StaticCroppedImage({ layer, image, matrix }: { layer: PhotoLayer; image: SkImage; matrix: Matrix20 | null }) {
  const r = photoImageRect(layer);
  return (
    <Image image={image} x={r.x} y={r.y} width={r.width} height={r.height} fit="fill" sampling={SAMPLING}>
      {matrix && <ColorMatrix matrix={matrix} />}
    </Image>
  );
}

/** Image rect for a crop, recomputed on the UI thread when the crop is live. */
function useCropBox(layer: PhotoLayer, crop: SharedValue<Crop> | null) {
  const { aspect } = layer;
  const inner = frameInner(layer);
  const { width: w, height: h } = inner;
  const cx = inner.x + w / 2;
  const cy = inner.y + h / 2;
  const fixed = layer.crop ?? { x: 0, y: 0, zoom: 1 };
  return useDerivedValue(() => {
    const c = crop ? crop.get() : fixed;
    const cover = aspect > w / h ? { iw: h * aspect, ih: h } : { iw: w, ih: w / aspect };
    const iw = cover.iw * c.zoom;
    const ih = cover.ih * c.zoom;
    return { x: cx - iw / 2 + (c.x * (iw - w)) / 2, y: cy - ih / 2 + (c.y * (ih - h)) / 2, iw, ih };
  });
}

/** Image rect driven on the UI thread while the user pans/zooms inside the frame. */
export function LiveCroppedImage({
  layer,
  image,
  crop,
  matrix = null,
}: {
  layer: PhotoLayer;
  image: SkImage;
  crop: SharedValue<Crop>;
  matrix?: Matrix20 | null;
}) {
  const box = useCropBox(layer, crop);
  const ix = useDerivedValue(() => box.get().x);
  const iy = useDerivedValue(() => box.get().y);
  const iw = useDerivedValue(() => box.get().iw);
  const ih = useDerivedValue(() => box.get().ih);
  return (
    <Image image={image} x={ix} y={iy} width={iw} height={ih} fit="fill" sampling={SAMPLING}>
      {matrix && <ColorMatrix matrix={matrix} />}
    </Image>
  );
}

/**
 * A playing, muted, looping video clipped to its trim range. Frames from the
 * decoder may be in the file's storage orientation, so they're rotated into
 * the (display-oriented) crop box here.
 */
function VideoImage({
  uri,
  layer,
  crop,
  matrix,
  volume,
}: {
  uri: string;
  layer: PhotoLayer;
  crop: SharedValue<Crop> | null;
  matrix: Matrix20 | null;
  volume: number;
}) {
  // Worklet closures; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const clip = layer.video!;
  const seek = useSharedValue<number | null>(clip.start * 1000);
  const { currentFrame, currentTime, rotation } = useVideo(uri, { looping: true, volume, seek });
  const startMs = clip.start * 1000;
  const endMs = (clip.start + clip.length) * 1000;

  useAnimatedReaction(
    () => currentTime.get(),
    (t) => {
      if (t > endMs || t < startMs - 250) seek.set(startMs);
    },
  );

  const box = useCropBox(layer, crop);
  const turned = rotation === 90 || rotation === 270;
  const transform = useDerivedValue<Transforms3d>(() => {
    const b = box.get();
    return [{ translateX: b.x + b.iw / 2 }, { translateY: b.y + b.ih / 2 }, { rotate: (rotation * Math.PI) / 180 }];
  });
  const ix = useDerivedValue(() => (turned ? -box.get().ih / 2 : -box.get().iw / 2));
  const iy = useDerivedValue(() => (turned ? -box.get().iw / 2 : -box.get().ih / 2));
  const iw = useDerivedValue(() => (turned ? box.get().ih : box.get().iw));
  const ih = useDerivedValue(() => (turned ? box.get().iw : box.get().ih));

  return (
    <Group transform={transform}>
      <Image image={currentFrame} x={ix} y={iy} width={iw} height={ih} fit="fill">
        {matrix && <ColorMatrix matrix={matrix} />}
      </Image>
    </Group>
  );
}

function LayerContent({ layer }: { layer: Exclude<Layer, PhotoLayer> }) {
  const { w, h } = layer;
  const x = -w / 2;
  const y = -h / 2;

  if (layer.type === 'text') return <TextContent layer={layer} />;
  if (layer.shape === 'circle') {
    return <Oval x={x} y={y} width={w} height={h} color={layer.color} />;
  }
  return <RoundedRect x={x} y={y} width={w} height={h} r={layer.radius} color={layer.color} />;
}

/** Dilates whatever is drawn inside, for text outlines. */
function OutlineLayer({ radius, children }: { radius: number; children: ReactNode }) {
  return (
    <Group
      layer={
        <Paint>
          <Morphology operator="dilate" radius={radius} />
        </Paint>
      }>
      {children}
    </Group>
  );
}

function TextContent({ layer }: { layer: TextLayer }) {
  const { w, h } = layer;
  const x = -w / 2;
  const y = -h / 2;
  const pad = textPad(layer);
  const stroke = outlinePx(layer);
  const outlineColor = layer.outline?.color ?? '#000000';

  if (isCurved(layer)) {
    const c = curveLayout(layer);
    return (
      <Group>
        {layer.fill && (
          <RoundedRect x={x} y={y} width={w} height={h} r={Math.min(36, h / 2)} color={layer.fill} />
        )}
        {stroke > 0 && (
          <OutlineLayer radius={stroke}>
            <TextPath path={c.path} font={c.font} text={c.text} color={outlineColor} />
          </OutlineLayer>
        )}
        <TextPath path={c.path} font={c.font} text={c.text} color={layer.color}>
          {layer.shadow && <Shadow dx={0} dy={layer.size * 0.05} blur={layer.size * 0.08} color="#00000073" />}
        </TextPath>
      </Group>
    );
  }

  const width = w - pad * 2;
  const paragraph = buildParagraph(layer, width);
  const highlight = layer.fill && layer.fillStyle === 'highlight';
  return (
    <Group>
      {layer.fill && !highlight && (
        <RoundedRect x={x} y={y} width={w} height={h} r={Math.min(36, h / 2)} color={layer.fill} />
      )}
      {highlight &&
        highlightBars(paragraph, layer.size).map((bar, i) => (
          <RoundedRect
            key={i}
            x={x + pad + bar.x}
            y={y + pad + bar.y}
            width={bar.width}
            height={bar.height}
            r={bar.r}
            color={layer.fill!}
          />
        ))}
      {stroke > 0 && (
        <OutlineLayer radius={stroke}>
          <Paragraph paragraph={buildParagraph(layer, width, outlineColor)} x={x + pad} y={y + pad} width={width} />
        </OutlineLayer>
      )}
      <Paragraph paragraph={paragraph} x={x + pad} y={y + pad} width={width} />
    </Group>
  );
}
