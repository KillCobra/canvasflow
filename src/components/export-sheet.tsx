import { Canvas, Group, Path, Skia } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Platform, Pressable, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  type ExportMode,
  type ExportProgress,
  type ExportResult,
  type ShareTarget,
  exportForShare,
  exportToPhotos,
} from '@/lib/export';
import { layersOnSlide } from '@/lib/geometry';
import { useSkImages } from '@/lib/images';
import { templateLink } from '@/lib/template-link';
import { ASPECTS, type Doc, SLIDE_WIDTH, canvasSize, isGrid, tileCount, tileRect } from '@/lib/types';
import { C, R, T } from '@/theme';

import { isVideoExportAvailable } from '../../modules/seam-video-export';

import { DocRenderer } from './doc-renderer';
import { Eyebrow, Icon, type IconName, PressableScale } from './ui';

type App = 'instagram' | 'tiktok';

type State =
  | { step: 'choose' }
  | { step: 'share' }
  | { step: 'saving'; progress: ExportProgress }
  | { step: 'saved'; result: ExportResult; mode: ExportMode; app?: App }
  | { step: 'error'; message: string };

/**
 * Apps to hand off to after saving. openURL (unlike canOpenURL) needs no
 * LSApplicationQueriesSchemes entry, so each scheme is just tried in turn
 * and the website is the last resort.
 */
const APPS: Record<App, { label: string; urls: string[]; web: string }> = {
  instagram: { label: 'Instagram', urls: ['instagram://library'], web: 'https://www.instagram.com/' },
  tiktok: { label: 'TikTok', urls: ['tiktok://', 'snssdk1233://'], web: 'https://www.tiktok.com/' },
};

async function openApp(app: App) {
  for (const url of APPS[app].urls) {
    try {
      await Linking.openURL(url);
      return;
    } catch {
      // Not installed (or no such scheme): try the next.
    }
  }
  Linking.openURL(APPS[app].web).catch(() => {});
}

export function ExportSheet({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ step: 'choose' });
  const [page, setPage] = useState(0);
  const H = ASPECTS[doc.aspect].height;
  const videoSlides = videoSlideSet(doc);
  const canEncode = isVideoExportAvailable();
  const grid = isGrid(doc);
  const canSwipe = canEncode && doc.slideCount >= 2 && !grid;
  const slide = Math.min(page, doc.slideCount - 1);

  const fail = (e: unknown) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    setState({ step: 'error', message: e instanceof Error ? e.message : String(e) });
  };

  /** Saves to Photos, then (for the app buttons) opens the app on its library. */
  const save = async (mode: ExportMode, app?: App) => {
    const total = mode === 'slides' ? doc.slideCount : mode === 'grid' ? tileCount(doc) : 1;
    setState({ step: 'saving', progress: { done: 0, total, current: 1, video: false } });
    try {
      const result = await exportToPhotos(doc, mode, (progress) => setState({ step: 'saving', progress }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState({ step: 'saved', result, mode, app });
      if (app) openApp(app);
    } catch (e) {
      fail(e);
    }
  };

  /** Renders one file and opens the system share sheet with it. */
  const share = async (target: ShareTarget) => {
    setState({
      step: 'saving',
      progress: { done: 0, total: 1, current: 1, video: target.kind === 'swipe', label: 'Preparing to share' },
    });
    try {
      const uri = await exportForShare(doc, target, (progress) =>
        setState({ step: 'saving', progress: { ...progress, label: progress.label ?? 'Preparing to share' } }),
      );
      setState({ step: 'choose' });
      // iOS shares the file itself; Android's share sheet only takes text.
      await Share.share(Platform.OS === 'ios' ? { url: uri } : { message: uri });
    } catch (e) {
      fail(e);
    }
  };

  const shareTemplate = async () => {
    try {
      const url = templateLink(doc);
      await Share.share(Platform.OS === 'ios' ? { url } : { message: url });
    } catch (e) {
      fail(e);
    }
  };

  const busy = state.step === 'saving';
  const choosing = state.step === 'choose' || state.step === 'share';

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <Pressable style={{ flex: 1 }} onPress={busy ? undefined : onClose} />
      <Animated.View
        entering={SlideInDown.springify().damping(22).stiffness(220)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.grabber} />

        {choosing && (
          <View style={{ gap: 14 }}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>{state.step === 'share' ? 'Share' : 'Export'}</Text>
              {state.step === 'share' ? (
                <Pressable onPress={() => setState({ step: 'choose' })} hitSlop={10}>
                  <Text style={[styles.link, { paddingVertical: 0 }]}>Back</Text>
                </Pressable>
              ) : (
                <Text style={styles.meta}>
                  {grid ? `3 × ${doc.grid} grid` : `${doc.slideCount} slides`} · {SLIDE_WIDTH}×{H}
                </Text>
              )}
            </View>
            {grid ? <GridPreview doc={doc} /> : <SlidePager doc={doc} page={slide} onPage={setPage} />}
          </View>
        )}

        {state.step === 'choose' && grid && (
          <View style={{ gap: 14 }}>
            <View style={styles.quickRow}>
              <QuickAction icon={{ ios: 'square.and.arrow.down', android: 'download' }} label="Save" primary onPress={() => save('grid')} />
              <QuickAction icon={{ ios: 'camera', android: 'photo_camera' }} label="Instagram" onPress={() => save('grid', 'instagram')} />
              <QuickAction
                icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }}
                label="Share…"
                onPress={() => share({ kind: 'strip' })}
              />
              <QuickAction icon={{ ios: 'link', android: 'link' }} label="Template" onPress={shareTemplate} />
            </View>
            <Eyebrow style={{ paddingHorizontal: 2 }}>Save as</Eyebrow>
            <View style={styles.pair}>
              <Option
                compact
                icon={{ ios: 'square.grid.3x3', android: 'grid_on' }}
                title="Grid posts"
                detail={`${tileCount(doc)} posts, in order`}
                onPress={() => save('grid')}
              />
              <Option
                compact
                icon={{ ios: 'photo', android: 'image' }}
                title="Full picture"
                detail="One image"
                onPress={() => save('strip')}
              />
            </View>
            <Text style={styles.note}>
              Post them one at a time, starting with number 1 (the bottom-right tile), and the picture lines up on your profile.
            </Text>
          </View>
        )}

        {state.step === 'choose' && !grid && (
          <View style={{ gap: 14 }}>
            <View style={styles.quickRow}>
              <QuickAction
                icon={{ ios: 'square.and.arrow.down', android: 'download' }}
                label="Save"
                primary
                onPress={() => save('slides')}
              />
              <QuickAction
                icon={{ ios: 'camera', android: 'photo_camera' }}
                label="Instagram"
                onPress={() => save('slides', 'instagram')}
              />
              <QuickAction
                icon={{ ios: 'music.note', android: 'music_note' }}
                label="TikTok"
                onPress={() => save('slides', 'tiktok')}
              />
              <QuickAction
                icon={{ ios: 'square.and.arrow.up', android: 'ios_share' }}
                label="Share…"
                onPress={() => setState({ step: 'share' })}
              />
              <QuickAction icon={{ ios: 'link', android: 'link' }} label="Template" onPress={shareTemplate} />
            </View>

            <Eyebrow style={{ paddingHorizontal: 2 }}>Save as</Eyebrow>
            <View style={styles.pair}>
              <Option
                compact
                icon={{ ios: 'rectangle.split.3x1', android: 'view_carousel' }}
                title="Carousel"
                detail={
                  videoSlides.size > 0
                    ? canEncode
                      ? `${videoSlides.size} as video`
                      : 'Video as stills'
                    : 'In swipe order'
                }
                onPress={() => save('slides')}
              />
              <Option
                compact
                icon={{ ios: 'pano', android: 'panorama' }}
                title="Panorama"
                detail="One wide image"
                onPress={() => save('strip')}
              />
            </View>
            <View style={styles.pair}>
              <Option
                compact
                icon={{ ios: 'hand.draw', android: 'swipe' }}
                title="Swipe video"
                detail="Post size"
                disabled={!canSwipe}
                onPress={() => save('swipe')}
              />
              <Option
                compact
                icon={{ ios: 'play.rectangle', android: 'movie' }}
                title="Reel 9:16"
                detail="Reels · TikTok"
                disabled={!canSwipe}
                onPress={() => save('reel')}
              />
            </View>
            {!canEncode && (
              <Text style={styles.note}>
                Video export needs the Seam app build. In Expo Go, swipe videos are off and video slides save as a still.
              </Text>
            )}
          </View>
        )}

        {state.step === 'share' && (
          <View style={{ gap: 10 }}>
            <Option
              icon={{ ios: 'rectangle.portrait', android: 'crop_portrait' }}
              title={`Slide ${slide + 1}`}
              detail={videoSlides.has(slide) && canEncode ? 'This slide, as a video' : 'The slide you’re looking at'}
              onPress={() => share({ kind: 'slide', index: slide })}
            />
            <Option
              icon={{ ios: 'pano', android: 'panorama' }}
              title="Panorama"
              detail="The whole canvas as one wide image"
              onPress={() => share({ kind: 'strip' })}
            />
            <Option
              icon={{ ios: 'hand.draw', android: 'swipe' }}
              title="Swipe video"
              detail={canEncode ? 'Plays through every slide' : 'Needs the Seam app build'}
              disabled={!canSwipe}
              onPress={() => share({ kind: 'swipe' })}
            />
          </View>
        )}

        {state.step === 'saving' && <Progress progress={state.progress} />}

        {state.step === 'saved' && (
          <View style={styles.center}>
            <Animated.View entering={ZoomIn.springify().damping(12)} style={styles.check}>
              <Icon name={{ ios: 'checkmark', android: 'check' }} size={30} color={C.accentInk} />
            </Animated.View>
            <Text style={[styles.title, { textAlign: 'center' }]}>Saved to Photos</Text>
            <Text style={styles.detail}>{savedLine(state.result)}</Text>
            <View style={styles.pair}>
              {(['instagram', 'tiktok'] as const).map((app) => (
                <Option
                  key={app}
                  compact
                  primary={state.app === app || (!state.app && app === 'instagram')}
                  icon={app === 'instagram' ? { ios: 'camera', android: 'photo_camera' } : { ios: 'music.note', android: 'music_note' }}
                  title={APPS[app].label}
                  detail={nextStep(state.mode, app)}
                  onPress={() => openApp(app)}
                />
              ))}
            </View>
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.link}>Done</Text>
            </Pressable>
          </View>
        )}

        {state.step === 'error' && (
          <View style={styles.center}>
            <Text style={[styles.title, { textAlign: 'center' }]}>That didn’t work</Text>
            <Text style={styles.detail}>{state.message}</Text>
            <Pressable onPress={() => setState({ step: 'choose' })} hitSlop={8}>
              <Text style={styles.link}>Try again</Text>
            </Pressable>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function nextStep(mode: ExportMode, app: App) {
  if (mode === 'grid') return app === 'instagram' ? 'Post 1 first, one at a time' : 'Post them in order';
  if (mode === 'reel') return app === 'instagram' ? 'Post as a Reel' : 'Post the video';
  if (mode === 'swipe') return 'Post the video';
  return app === 'instagram' ? 'Pick them in order' : 'Post as photos';
}

function savedLine(r: ExportResult) {
  const parts = [`${r.saved} ${r.saved === 1 ? 'file' : 'files'}`];
  if (r.videos) parts.push(`${r.videos} video`);
  if (r.stills) parts.push(r.stills === 1 ? '1 video slide as a still' : `${r.stills} video slides as stills`);
  return parts.join(' · ');
}

/** Slides with a video clip on them. */
function videoSlideSet(doc: Doc) {
  const slides = new Set<number>();
  for (const l of doc.layers) {
    if (l.type !== 'photo' || !l.video || !l.src) continue;
    const half = (Math.max(l.w, l.h) * l.scale) / 2;
    const a = Math.max(0, Math.floor((l.x - half) / SLIDE_WIDTH));
    const b = Math.min(doc.slideCount - 1, Math.floor((l.x + half) / SLIDE_WIDTH));
    for (let i = a; i <= b; i++) slides.add(i);
  }
  return slides;
}

/**
 * A grid puzzle as it will sit on the profile: the whole picture split into
 * tiles with the profile's thin gaps, each numbered in posting order.
 */
function GridPreview({ doc }: { doc: Doc }) {
  const { width: screenW } = useWindowDimensions();
  const images = useSkImages(doc.id, doc.layers);
  const { width: W, height: CH } = canvasSize(doc);
  const k = Math.min((screenW - 36) / W, 300 / CH);
  const total = tileCount(doc);
  const gap = 3;
  return (
    <View style={{ alignItems: 'center' }}>
      <View style={{ width: W * k, height: CH * k }}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={[{ scale: k }]}>
            <DocRenderer doc={doc} images={images} layers={doc.layers.filter((l) => !l.hidden && (l.type !== 'photo' || !!l.src))} />
          </Group>
        </Canvas>
        {/* Profile gaps between tiles. */}
        {Array.from({ length: doc.slideCount - 1 }, (_, i) => (
          <View key={`c${i}`} style={[styles.gridGap, { left: (i + 1) * SLIDE_WIDTH * k - gap / 2, top: 0, bottom: 0, width: gap }]} />
        ))}
        {Array.from({ length: (doc.grid ?? 1) - 1 }, (_, i) => (
          <View
            key={`r${i}`}
            style={[styles.gridGap, { top: (i + 1) * tileRect(doc, 0).height * k - gap / 2, left: 0, right: 0, height: gap }]}
          />
        ))}
        {Array.from({ length: total }, (_, i) => {
          const t = tileRect(doc, i);
          return (
            <View key={i} style={[styles.postBadge, { left: t.x * k + 6, top: t.y * k + 6 }]}>
              <Text style={styles.postBadgeText}>{total - i}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const PAGE_GAP = 12;

/**
 * Every slide drawn small, one per page with its neighbours peeking in, so
 * the post can be checked one last time. Drawn live from the doc with the
 * editor's cached previews, so it costs nothing to open.
 */
function SlidePager({ doc, page, onPage }: { doc: Doc; page: number; onPage: (page: number) => void }) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const images = useSkImages(doc.id, doc.layers);
  const H = ASPECTS[doc.aspect].height;
  const k = Math.min(((screenW - 36) * 0.72) / SLIDE_WIDTH, Math.min(240, screenH * 0.24) / H);
  const w = SLIDE_WIDTH * k;
  const h = H * k;
  const step = w + PAGE_GAP;
  const visible = doc.layers.filter((l) => !l.hidden);
  const pages = Array.from({ length: doc.slideCount }, (_, i) => i);

  return (
    <View style={{ gap: 12 }}>
      <FlatList
        data={pages}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={step}
        decelerationRate="fast"
        disableIntervalMomentum
        keyExtractor={(i) => String(i)}
        windowSize={5}
        initialNumToRender={3}
        getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
        // Bleeds to the sheet's edges so neighbours peek in from both sides;
        // each item carries the gap after it, so page i sits at i * step.
        style={{ marginHorizontal: -18, flexGrow: 0 }}
        contentContainerStyle={{ paddingLeft: (screenW - w) / 2, paddingRight: (screenW - w) / 2 - PAGE_GAP }}
        scrollEventThrottle={32}
        onScroll={(e) => onPage(Math.max(0, Math.min(doc.slideCount - 1, Math.round(e.nativeEvent.contentOffset.x / step))))}
        extraData={[images, page]}
        renderItem={({ item: i }) => (
          <View style={{ width: step }}>
            <View style={[styles.page, { width: w, height: h }, i !== page && { opacity: 0.55 }]}>
              <Canvas style={{ width: w, height: h }}>
                <Group transform={[{ scale: k }, { translateX: -i * SLIDE_WIDTH }]}>
                  <DocRenderer doc={doc} images={images} layers={layersOnSlide(visible, i, SLIDE_WIDTH, true)} />
                </Group>
              </Canvas>
            </View>
          </View>
        )}
      />
      <View style={styles.pagerFoot}>
        <View style={styles.dots}>
          {pages.map((i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
        <Text style={styles.counter}>
          {page + 1} / {doc.slideCount}
        </Text>
      </View>
    </View>
  );
}

/** Round shortcut with a label under it. */
function QuickAction({
  icon,
  label,
  onPress,
  primary,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  primary?: boolean;
}) {
  // flex lives on a wrapper: on PressableScale it lands on the inner view,
  // whose zero flex-basis collapses the row's height.
  return (
    <View style={{ flex: 1 }}>
      <PressableScale
        accessibilityRole="button"
        accessibilityLabel={label}
        scaleTo={0.92}
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        style={styles.quick}>
        <View style={[styles.quickIcon, primary && { backgroundColor: C.accent }]}>
          <Icon name={icon} size={21} color={primary ? C.accentInk : C.text} />
        </View>
        <Text style={styles.quickLabel} numberOfLines={1}>
          {label}
        </Text>
      </PressableScale>
    </View>
  );
}

const RING = 96;
const STROKE = 6;

/** Progress ring that eases between updates, with the slide being worked on. */
function Progress({ progress }: { progress: ExportProgress }) {
  const fraction = progress.total ? progress.done / progress.total : 0;
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(withTiming(fraction, { duration: 260 }));
  }, [fraction, t]);

  const ring = Skia.PathBuilder.Make()
    .addArc({ x: STROKE / 2, y: STROKE / 2, width: RING - STROKE, height: RING - STROKE }, -90, 359.99)
    .build();
  const end = useDerivedValue(() => Math.max(0.001, t.get()));

  return (
    <View style={styles.center}>
      <View style={{ width: RING, height: RING, alignSelf: 'center' }}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={ring} style="stroke" strokeWidth={STROKE} color={C.line} />
          <Path path={ring} style="stroke" strokeWidth={STROKE} strokeCap="round" color={C.accent} start={0} end={end} />
        </Canvas>
        <View style={styles.ringLabel}>
          <Text style={styles.percent}>{Math.round(fraction * 100)}</Text>
        </View>
      </View>
      <Eyebrow style={{ textAlign: 'center' }}>
        {progress.label ??
          `${progress.video ? 'Encoding video' : 'Rendering'} · slide ${Math.min(progress.current, progress.total)} of ${progress.total}`}
      </Eyebrow>
    </View>
  );
}

function Option({
  icon,
  title,
  detail,
  onPress,
  primary,
  compact,
  disabled,
}: {
  icon: IconName;
  title: string;
  detail: string;
  onPress: () => void;
  primary?: boolean;
  /** Half-width tile without the chevron. */
  compact?: boolean;
  disabled?: boolean;
}) {
  const tile = (
    <PressableScale
      onPress={onPress}
      disabled={disabled}
      scaleTo={0.98}
      style={[styles.option, primary && styles.optionPrimary, compact && styles.optionCompact, disabled && { opacity: 0.4 }]}>
      <View style={[styles.optionIcon, primary && { backgroundColor: '#16120B14' }, compact && styles.optionIconCompact]}>
        <Icon name={icon} size={compact ? 19 : 22} color={primary ? C.accentInk : C.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, primary && { color: C.accentInk }]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[styles.optionDetail, primary && { color: '#16120BAA' }]} numberOfLines={compact ? 1 : 2}>
          {detail}
        </Text>
      </View>
      {!compact && (
        <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={14} color={primary ? C.accentInk : C.textDim} />
      )}
    </PressableScale>
  );
  return compact ? <View style={{ flex: 1 }}>{tile}</View> : tile;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000000A6', zIndex: 20 },
  gridGap: { position: 'absolute', backgroundColor: C.surface },
  postBadge: {
    position: 'absolute',
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#000000B3',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBadgeText: { ...T.semibold, color: '#FFFFFF', fontSize: 11, fontVariant: ['tabular-nums'] },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  title: { ...T.display, fontSize: 32 },
  meta: { ...T.medium, color: C.textDim, fontSize: 12 },
  detail: { ...T.body, color: C.textDim, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  note: { ...T.body, color: C.textDim, fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  pair: { flexDirection: 'row', gap: 10 },
  center: { alignItems: 'stretch', gap: 14, paddingVertical: 10 },
  check: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: C.surfaceHi,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  pagerFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12 },
  dots: { flexDirection: 'row', gap: 5, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 200 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.line },
  dotOn: { backgroundColor: C.accent },
  counter: { ...T.medium, color: C.textDim, fontSize: 12, fontVariant: ['tabular-nums'] },
  quickRow: { flexDirection: 'row', justifyContent: 'space-between' },
  quick: { alignItems: 'center', gap: 7 },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { ...T.medium, color: C.textDim, fontSize: 11, letterSpacing: 0.2 },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: R.lg,
    backgroundColor: C.surfaceHi,
  },
  optionCompact: { gap: 10, padding: 12, borderRadius: R.md + 2 },
  optionPrimary: { backgroundColor: C.accent },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionIconCompact: { width: 38, height: 38, borderRadius: 12 },
  optionTitle: { ...T.semibold, fontSize: 15 },
  optionDetail: { ...T.body, color: C.textDim, fontSize: 12, marginTop: 2 },
  ringLabel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  percent: { ...T.display, fontSize: 30, fontVariant: ['tabular-nums'] },
  link: { ...T.semibold, color: C.accent, fontSize: 16, textAlign: 'center', paddingVertical: 6 },
});
