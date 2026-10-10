import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FavoriteButton,
  TemplateSlide,
  TemplateStrip,
  startFromTemplate,
  stripSize,
} from '@/components/template-thumb';
import { IconButton, PressableScale } from '@/components/ui';
import { templateHeight, useTemplates } from '@/lib/templates';
import { ASPECTS, SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

/** One template up close: swipe its slides, see the whole strip, then use it. */
export default function TemplateDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const template = useTemplates().find((t) => t.id === id);
  const [page, setPage] = useState(0);
  const pager = useRef<FlatList<number>>(null);

  if (!template) {
    return (
      <View style={[styles.screen, styles.missing]}>
        <Text style={styles.missingText}>This template isn’t available any more.</Text>
        <PressableScale onPress={() => router.back()} style={styles.secondary}>
          <Text style={styles.secondaryText}>Close</Text>
        </PressableScale>
      </View>
    );
  }

  const H = templateHeight(template);
  // Big enough to judge, small enough to leave room for the strip and details.
  const slideW = Math.min(width - 56, (screenH * 0.4 * SLIDE_WIDTH) / H);
  const pages = Array.from({ length: template.slideCount }, (_, i) => i);
  const strip = stripSize(template, 84, width - 40);
  const segment = strip.width / template.slideCount;

  const go = (i: number) => {
    pager.current?.scrollToIndex({ index: i, animated: true });
    setPage(i);
  };

  const use = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Close the detail (and the catalog under it, if any) before opening the editor.
    if (router.canDismiss()) router.dismissAll();
    startFromTemplate(template);
  };

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <IconButton label="Close" icon={{ ios: 'xmark', android: 'close' }} onPress={() => router.back()} />
        <View style={styles.heart}>
          <FavoriteButton id={template.id} size={21} />
        </View>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 110 }}>
        <FlatList
          ref={pager}
          data={pages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => String(i)}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item: i }) => (
            <View style={[styles.page, { width }]}>
              <View style={styles.slideShadow}>
                <TemplateSlide template={template} index={i} width={slideW} />
              </View>
            </View>
          )}
        />

        {template.slideCount > 1 && (
          <View style={styles.dots}>
            {pages.map((i) => (
              <View key={i} style={[styles.dot, i === page && styles.dotOn]} />
            ))}
          </View>
        )}

        <View style={styles.body}>
          {/* The whole strip; the frame marks the slide above, tap to jump. */}
          <View style={{ alignSelf: 'center' }}>
            <TemplateStrip template={template} height={84} maxWidth={width - 40} />
            <View style={StyleSheet.absoluteFill}>
              <View style={styles.segments}>
                {pages.map((i) => (
                  <Pressable
                    key={i}
                    onPress={() => go(i)}
                    accessibilityLabel={`Slide ${i + 1}`}
                    style={[styles.segment, { width: segment }, i === page && styles.segmentOn]}
                  />
                ))}
              </View>
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <View style={styles.titleRow}>
              <Text style={styles.name}>{template.name}</Text>
              {template.isNew && (
                <View style={styles.newBadge}>
                  <Text style={styles.newText}>NEW</Text>
                </View>
              )}
            </View>
            <Text style={styles.meta}>
              {template.slideCount} slides · {template.aspect} {ASPECTS[template.aspect].label} · {template.category}
            </Text>
          </View>

          {!!template.tags?.length && (
            <View style={styles.tags}>
              {template.tags.map((tag) => (
                <View key={tag} style={styles.tag}>
                  <Text style={styles.tagText}>{tag}</Text>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.note}>
            Sample photos are just for the preview. Your carousel starts with empty frames, ready for your own.
          </Text>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        <PressableScale onPress={use} style={styles.cta}>
          <Text style={styles.ctaText}>Use template</Text>
        </PressableScale>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  heart: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  page: { alignItems: 'center', paddingVertical: 8 },
  slideShadow: {
    borderRadius: R.md,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center', marginTop: 14 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.line },
  dotOn: { width: 18, backgroundColor: C.text },
  body: { paddingHorizontal: 20, paddingTop: 26, gap: 22 },
  segments: { flexDirection: 'row', flex: 1 },
  segment: { height: '100%', borderRadius: 6, borderWidth: 2, borderColor: 'transparent' },
  segmentOn: { borderColor: C.accent },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  name: { ...T.display, fontSize: 38, lineHeight: 42, flexShrink: 1 },
  meta: { ...T.medium, color: C.textDim, fontSize: 13 },
  newBadge: { backgroundColor: C.accent, borderRadius: R.pill, paddingHorizontal: 8, paddingVertical: 3 },
  newText: { ...T.bold, color: C.accentInk, fontSize: 10, letterSpacing: 1 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: {
    paddingHorizontal: 11,
    height: 28,
    borderRadius: R.pill,
    justifyContent: 'center',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  tagText: { ...T.medium, color: C.textDim, fontSize: 12 },
  note: { ...T.body, color: C.textFaint, fontSize: 13, lineHeight: 19 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: '#0A0A0AF2',
  },
  cta: { height: 54, borderRadius: R.pill, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...T.semibold, color: C.bg, fontSize: 16 },
  missing: { alignItems: 'center', justifyContent: 'center', gap: 18, padding: 32 },
  missingText: { ...T.display, fontSize: 24, textAlign: 'center' },
  secondary: { height: 46, paddingHorizontal: 26, borderRadius: R.pill, backgroundColor: C.surfaceHi, justifyContent: 'center' },
  secondaryText: { ...T.semibold, fontSize: 15 },
});
