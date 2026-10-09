import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
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

import { type ExportMode, type ExportProgress, type ExportResult, exportToPhotos } from '@/lib/export';
import { ASPECTS, type Doc, SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

import { isVideoExportAvailable } from '../../modules/seam-video-export';

import { Eyebrow, Icon, type IconName, PressableScale } from './ui';

type State =
  | { step: 'choose' }
  | { step: 'saving'; progress: ExportProgress }
  | { step: 'saved'; result: ExportResult; mode: ExportMode }
  | { step: 'error'; message: string };

export function ExportSheet({ doc, onClose }: { doc: Doc; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<State>({ step: 'choose' });
  const H = ASPECTS[doc.aspect].height;
  const videoSlides = countVideoSlides(doc);
  const canEncode = isVideoExportAvailable();

  const run = async (mode: ExportMode) => {
    const total = mode === 'slides' ? doc.slideCount : 1;
    setState({ step: 'saving', progress: { done: 0, total, current: 1, video: false } });
    try {
      const result = await exportToPhotos(doc, mode, (progress) => setState({ step: 'saving', progress }));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setState({ step: 'saved', result, mode });
    } catch (e) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setState({ step: 'error', message: e instanceof Error ? e.message : String(e) });
    }
  };

  const busy = state.step === 'saving';

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <Pressable style={{ flex: 1 }} onPress={busy ? undefined : onClose} />
      <Animated.View
        entering={SlideInDown.springify().damping(22).stiffness(220)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.grabber} />

        {state.step === 'choose' && (
          <View style={{ gap: 12 }}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Export</Text>
              <Text style={styles.meta}>
                {doc.slideCount} slides · {SLIDE_WIDTH}×{H}
              </Text>
            </View>
            <Option
              icon={{ ios: 'rectangle.split.3x1', android: 'view_carousel' }}
              title="Carousel"
              detail={
                videoSlides > 0
                  ? canEncode
                    ? `Saved in swipe order · ${videoSlides} as video`
                    : 'Saved in swipe order · video slides as stills'
                  : 'Saved in swipe order, ready for Instagram'
              }
              onPress={() => run('slides')}
              primary
            />
            <Option
              icon={{ ios: 'pano', android: 'panorama' }}
              title="Panorama"
              detail="The whole canvas as one wide image"
              onPress={() => run('strip')}
            />
            <View style={styles.pair}>
              <Option
                compact
                icon={{ ios: 'hand.draw', android: 'swipe' }}
                title="Swipe video"
                detail="Post size"
                disabled={!canEncode || doc.slideCount < 2}
                onPress={() => run('swipe')}
              />
              <Option
                compact
                icon={{ ios: 'play.rectangle', android: 'movie' }}
                title="Reel 9:16"
                detail="Reels · TikTok"
                disabled={!canEncode || doc.slideCount < 2}
                onPress={() => run('reel')}
              />
            </View>
            {!canEncode && (
              <Text style={styles.note}>
                Video export needs the Seam app build. In Expo Go, swipe videos are off and video slides save as a still.
              </Text>
            )}
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
            <Option
              icon={{ ios: 'camera', android: 'photo_camera' }}
              title="Open Instagram"
              detail={state.mode === 'reel' ? 'Share it as a Reel' : state.mode === 'swipe' ? 'Post it as a video' : 'Pick them in order for a new post'}
              primary
              onPress={() =>
                Linking.openURL('instagram://library').catch(() => Linking.openURL('https://instagram.com'))
              }
            />
            <Pressable onPress={onClose} hitSlop={8}>
              <Text style={styles.link}>Done</Text>
            </Pressable>
          </View>
        )}

        {state.step === 'error' && (
          <View style={styles.center}>
            <Text style={[styles.title, { textAlign: 'center' }]}>Export failed</Text>
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

function savedLine(r: ExportResult) {
  const parts = [`${r.saved} ${r.saved === 1 ? 'file' : 'files'}`];
  if (r.videos) parts.push(`${r.videos} video`);
  if (r.stills) parts.push(r.stills === 1 ? '1 video slide as a still' : `${r.stills} video slides as stills`);
  return parts.join(' · ');
}

function countVideoSlides(doc: Doc) {
  const slides = new Set<number>();
  for (const l of doc.layers) {
    if (l.type !== 'photo' || !l.video || !l.src) continue;
    const half = (Math.max(l.w, l.h) * l.scale) / 2;
    const a = Math.max(0, Math.floor((l.x - half) / SLIDE_WIDTH));
    const b = Math.min(doc.slideCount - 1, Math.floor((l.x + half) / SLIDE_WIDTH));
    for (let i = a; i <= b; i++) slides.add(i);
  }
  return slides.size;
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
      style={[styles.option, primary && styles.optionPrimary, compact && { gap: 10 }, disabled && { opacity: 0.4 }]}>
      <View style={[styles.optionIcon, primary && { backgroundColor: '#16120B14' }]}>
        <Icon name={icon} size={22} color={primary ? C.accentInk : C.text} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.optionTitle, primary && { color: C.accentInk }]}>{title}</Text>
        <Text style={[styles.optionDetail, primary && { color: '#16120BAA' }]}>{detail}</Text>
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
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 14,
    borderRadius: R.lg,
    backgroundColor: C.surfaceHi,
  },
  optionPrimary: { backgroundColor: C.accent },
  optionIcon: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionTitle: { ...T.semibold, fontSize: 16 },
  optionDetail: { ...T.body, color: C.textDim, fontSize: 13, marginTop: 2 },
  ringLabel: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  percent: { ...T.display, fontSize: 30, fontVariant: ['tabular-nums'] },
  link: { ...T.semibold, color: C.accent, fontSize: 16, textAlign: 'center', paddingVertical: 6 },
});
