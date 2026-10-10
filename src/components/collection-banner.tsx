import { Canvas, Group, LinearGradient, Rect, vec } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSamplePreview } from '@/lib/samples';
import { COLLECTIONS, type Collection, type Template, inCollection, templateHeight } from '@/lib/templates';
import { SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

import { DocRenderer } from './doc-renderer';
import { Skeleton } from './skeleton';
import { Eyebrow, PressableScale } from './ui';

const GAP = 12;

/** Editorial collections as swipeable banners, each drawn from its cover template. */
export function CollectionCarousel({ templates, width }: { templates: Template[]; width: number }) {
  const [page, setPage] = useState(0);
  const cardW = width - 40;
  const cardH = Math.round(cardW * 0.56);
  const items = COLLECTIONS.flatMap((collection) => {
    const members = templates.filter((t) => inCollection(t, collection));
    const cover = templates.find((t) => t.id === collection.cover) ?? members[0];
    return cover ? [{ collection, cover, count: members.length }] : [];
  });
  if (!items.length) return null;

  return (
    <View style={{ gap: 12 }}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardW + GAP}
        decelerationRate="fast"
        style={{ marginHorizontal: -20 }}
        contentContainerStyle={{ paddingHorizontal: 20, gap: GAP }}
        onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / (cardW + GAP)))}>
        {items.map(({ collection, cover, count }) => (
          <PressableScale
            key={collection.id}
            scaleTo={0.98}
            accessibilityRole="button"
            accessibilityLabel={`${collection.title}, ${count} templates`}
            onPress={() => router.push({ pathname: '/templates', params: { collection: collection.id } })}>
            <Banner collection={collection} cover={cover} count={count} width={cardW} height={cardH} />
          </PressableScale>
        ))}
      </ScrollView>
      {items.length > 1 && (
        <View style={styles.dots}>
          {items.map((item, i) => (
            <View key={item.collection.id} style={[styles.dot, i === page && styles.dotOn]} />
          ))}
        </View>
      )}
    </View>
  );
}

function Banner({
  collection,
  cover,
  count,
  width,
  height,
}: {
  collection: Collection;
  cover: Template;
  count: number;
  width: number;
  height: number;
}) {
  const { doc, images, ready } = useSamplePreview(cover);
  // The strip fills the banner's height from its first slide (where the
  // template's title sits), running off the right edge like a carousel.
  const k = height / templateHeight(cover);
  const dx = Math.max(0, (width - cover.slideCount * SLIDE_WIDTH * k) / 2);
  return (
    <View style={[styles.banner, { width, height }]}>
      {ready ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Group transform={[{ translateX: dx }, { scale: k }]}>
            <DocRenderer doc={doc} images={images} />
          </Group>
          <Rect x={0} y={0} width={width} height={height}>
            <LinearGradient
              start={vec(0, height * 0.2)}
              end={vec(0, height)}
              colors={['#0A0A0A00', '#0A0A0A99', '#0A0A0AF2']}
              positions={[0, 0.5, 1]}
            />
          </Rect>
        </Canvas>
      ) : (
        <Skeleton style={StyleSheet.absoluteFill} />
      )}
      <View style={styles.count}>
        <Text style={styles.countText}>{count} templates</Text>
      </View>
      <View style={styles.text}>
        <Eyebrow style={{ color: C.accent }}>Collection</Eyebrow>
        <Text style={styles.title}>{collection.title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {collection.subtitle}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: R.lg,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  count: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#0A0A0AB3',
    borderRadius: R.pill,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  countText: { ...T.semibold, fontSize: 11 },
  text: { position: 'absolute', left: 18, right: 18, bottom: 16, gap: 2 },
  title: { ...T.display, fontSize: 32, lineHeight: 36, marginTop: 4 },
  subtitle: { ...T.body, color: '#F2EFE9B3', fontSize: 13 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.line },
  dotOn: { width: 18, backgroundColor: C.text },
});
