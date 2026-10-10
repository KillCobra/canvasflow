import { Canvas, Group, Line, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { toggleFavorite, useFavorites } from '@/lib/favorites';
import { layersOnSlide } from '@/lib/geometry';
import { saveProject } from '@/lib/projects';
import { useSamplePreview } from '@/lib/samples';
import { type Template, instantiate, templateHeight } from '@/lib/templates';
import { SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

import { DocRenderer } from './doc-renderer';
import { Skeleton } from './skeleton';
import { Icon, PressableScale } from './ui';

/** On-screen size of a template strip that fits `height` x `maxWidth`. */
export function stripSize(template: Template, height: number, maxWidth = Infinity) {
  const H = templateHeight(template);
  const W = template.slideCount * SLIDE_WIDTH;
  const k = Math.min(height / H, maxWidth / W);
  return { width: W * k, height: H * k, k };
}

/**
 * The whole template strip, scaled to `height`, with hairline seams. Slots
 * show sample photos (shimmering until they're drawn) unless `empty`.
 */
export function TemplateStrip({
  template,
  height: maxHeight,
  maxWidth = Infinity,
  empty = false,
}: {
  template: Template;
  height: number;
  maxWidth?: number;
  empty?: boolean;
}) {
  const { doc, images, ready } = useSamplePreview(template, empty);
  const { width, height, k } = stripSize(template, maxHeight, maxWidth);
  const H = templateHeight(template);
  if (!ready) return <Skeleton style={[styles.strip, { width, height }]} />;
  return (
    <Animated.View entering={FadeIn.duration(250)} style={[styles.strip, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Group transform={[{ scale: k }]}>
          <DocRenderer doc={doc} images={images} />
          {Array.from({ length: template.slideCount - 1 }, (_, i) => (
            <Line
              key={i}
              p1={vec((i + 1) * SLIDE_WIDTH, 0)}
              p2={vec((i + 1) * SLIDE_WIDTH, H)}
              color="#0A0A0A99"
              strokeWidth={1.5 / k}
            />
          ))}
        </Group>
      </Canvas>
    </Animated.View>
  );
}

/** One slide of the sample-filled preview, `width` wide (the detail screen's pager). */
export function TemplateSlide({ template, index, width }: { template: Template; index: number; width: number }) {
  const { doc, images, ready } = useSamplePreview(template);
  const k = width / SLIDE_WIDTH;
  const height = templateHeight(template) * k;
  if (!ready) return <Skeleton style={[styles.slide, { width, height }]} />;
  return (
    <View style={[styles.slide, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Group transform={[{ scale: k }, { translateX: -index * SLIDE_WIDTH }]}>
          <DocRenderer doc={doc} images={images} layers={layersOnSlide(doc.layers, index, SLIDE_WIDTH)} />
        </Group>
      </Canvas>
    </View>
  );
}

/**
 * Creates a project from the template and opens it. The project gets the
 * template's empty slots, never the preview's sample photos.
 */
export function startFromTemplate(template: Template, { replace = false } = {}) {
  const doc = instantiate(template);
  saveProject(doc, { create: true });
  if (replace) router.replace(`/editor/${doc.id}`);
  else router.push(`/editor/${doc.id}`);
}

/** Opens the template's detail screen. */
export function openTemplate(template: Template) {
  router.push({ pathname: '/template/[id]', params: { id: template.id } });
}

/** Heart toggle for a template. */
export function FavoriteButton({ id, size = 18 }: { id: string; size?: number }) {
  const on = useFavorites().includes(id);
  return (
    <PressableScale
      scaleTo={0.8}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={on ? 'Remove from favorites' : 'Add to favorites'}
      accessibilityState={{ selected: on }}
      onPress={() => {
        Haptics.selectionAsync();
        toggleFavorite(id);
      }}>
      <Icon
        name={on ? { ios: 'heart.fill', android: 'favorite' } : { ios: 'heart', android: 'favorite' }}
        size={size}
        color={on ? C.accent : C.textDim}
      />
    </PressableScale>
  );
}

export function TemplateCard({
  template,
  height = 150,
  maxWidth,
  onPress,
}: {
  template: Template;
  height?: number;
  maxWidth?: number;
  /** Defaults to opening the detail screen. */
  onPress?: () => void;
}) {
  const { width } = stripSize(template, height, maxWidth);
  return (
    <PressableScale onPress={onPress ?? (() => openTemplate(template))} scaleTo={0.97} style={[styles.card, { width }]}>
      <View>
        <TemplateStrip template={template} height={height} maxWidth={maxWidth} />
        {template.isNew && (
          <View style={styles.newBadge}>
            <Text style={styles.newText}>NEW</Text>
          </View>
        )}
      </View>
      <View style={styles.meta}>
        <Text style={styles.name} numberOfLines={1}>
          {template.name}
        </Text>
        <Text style={styles.detail}>
          {template.slideCount} slides · {template.aspect}
        </Text>
        <View style={{ flex: 1 }} />
        <FavoriteButton id={template.id} />
      </View>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  strip: {
    borderRadius: R.sm,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  slide: { borderRadius: R.md, overflow: 'hidden', backgroundColor: C.surface },
  card: { gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { ...T.display, fontSize: 21, flexShrink: 1 },
  detail: { ...T.medium, color: C.textDim, fontSize: 12, marginTop: 3 },
  newBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: C.accent,
    borderRadius: R.pill,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  newText: { ...T.bold, color: C.accentInk, fontSize: 9, letterSpacing: 1 },
});
