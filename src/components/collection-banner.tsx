import { Canvas, Group } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useSamplePreview } from '@/lib/samples';
import { COLLECTIONS, type Collection, type Template, inCollection, templateHeight } from '@/lib/templates';
import { SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

import { DocRenderer } from './doc-renderer';
import { Skeleton } from './skeleton';
import { Icon, PressableScale } from './ui';

const GAP = 12;

/** Editorial collections as swipeable banners, each drawn from its cover template. */
export function CollectionCarousel({ templates, width }: { templates: Template[]; width: number }) {
  const [page, setPage] = useState(0);
  const cardW = width - 40;
  const cardH = Math.round(cardW * 0.6);
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
    <View style={{ width, gap: 12 }}>
      <View style={[styles.banner, { width, height }]}>
        {ready ? (
          <Canvas style={StyleSheet.absoluteFill}>
            <Group transform={[{ translateX: dx }, { scale: k }]}>
              <DocRenderer doc={doc} images={images} />
            </Group>
          </Canvas>
        ) : (
          <Skeleton style={StyleSheet.absoluteFill} />
        )}
        <View style={styles.count}>
          <Icon name={{ ios: 'square.stack.3d.up', android: 'layers' }} size={13} color={C.text} />
          <Text style={styles.countText}>{count} templates</Text>
        </View>
      </View>
      <View style={styles.text}>
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#0A0A0AD9',
    borderRadius: R.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  countText: { ...T.semibold, fontSize: 12 },
  text: { gap: 2, paddingHorizontal: 2 },
  title: { ...T.display, fontSize: 24, lineHeight: 28 },
  subtitle: { ...T.body, color: C.textDim, fontSize: 13 },
  dots: { flexDirection: 'row', gap: 6, justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.line },
  dotOn: { width: 18, backgroundColor: C.text },
});
