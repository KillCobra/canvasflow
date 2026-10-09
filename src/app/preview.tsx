import { Canvas, Group, Image, type SkImage } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, PixelRatio, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocRenderer } from '@/components/doc-renderer';
import { Icon, IconButton } from '@/components/ui';
import { renderSlide } from '@/lib/export';
import { layersOnSlide } from '@/lib/geometry';
import { preloadImages, useSkImages } from '@/lib/images';
import { useEditor } from '@/lib/store';
import { ASPECTS, SLIDE_WIDTH } from '@/lib/types';
import { C, T } from '@/theme';

/** Feed-style mock so you can feel the swipe before exporting. */
export default function PreviewScreen() {
  const doc = useEditor((s) => s.doc);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [page, setPage] = useState(0);
  const [slides, setSlides] = useState<(SkImage | null)[] | null>(null);

  // Render every slide once at screen resolution; paging then just shows images.
  useEffect(() => {
    if (!doc) return;
    let alive = true;
    let rendered: (SkImage | null)[] = [];
    (async () => {
      const images = await preloadImages(doc.id, doc.layers);
      const px = width * PixelRatio.get();
      for (let i = 0; i < doc.slideCount; i++) {
        rendered.push(await renderSlide(doc, images, i, px));
      }
      if (alive) setSlides(rendered);
      else rendered.forEach((img) => img?.dispose());
    })();
    return () => {
      alive = false;
      rendered.forEach((img) => img?.dispose());
      rendered = [];
    };
  }, [doc, width]);

  const live = useSkImages(doc?.id ?? '', doc?.layers ?? []);

  if (!doc) return null;
  const k = width / SLIDE_WIDTH;
  const videoSlides = new Set(
    Array.from({ length: doc.slideCount }, (_, i) => i).filter((i) =>
      layersOnSlide(doc.layers, i, SLIDE_WIDTH, true).some((l) => l.type === 'photo' && !!l.video),
    ),
  );
  const height = ASPECTS[doc.aspect].height * k;
  const pages = Array.from({ length: doc.slideCount }, (_, i) => i);

  return (
    <View style={[styles.screen, { paddingTop: 8, paddingBottom: insets.bottom }]}>
      <View style={styles.header}>
        <IconButton label="Close" icon={{ ios: 'xmark', android: 'close' }} onPress={() => router.back()} />
        <Text style={styles.headerTitle}>Preview</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.postHeader}>
        <View style={styles.avatar} />
        <Text style={styles.handle}>your.account</Text>
        <View style={{ flex: 1 }} />
        <Icon name={{ ios: 'ellipsis', android: 'more_horiz' }} size={18} />
      </View>

      <View style={{ height }}>
        <FlatList
          data={pages}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          keyExtractor={(i) => String(i)}
          windowSize={3}
          initialNumToRender={2}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          onMomentumScrollEnd={(e) => setPage(Math.round(e.nativeEvent.contentOffset.x / width))}
          renderItem={({ item: i }) => {
            const image = slides?.[i];
            // The visible slide plays its video live; the rest show the rendered still.
            if (i === page && videoSlides.has(i)) {
              return (
                <Canvas style={{ width, height }}>
                  <Group transform={[{ scale: k }, { translateX: -i * SLIDE_WIDTH }]}>
                    <DocRenderer
                      doc={doc}
                      images={live}
                      layers={layersOnSlide(doc.layers, i, SLIDE_WIDTH, true)}
                      playVideo
                      sound
                    />
                  </Group>
                </Canvas>
              );
            }
            return image ? (
              <Canvas style={{ width, height }}>
                <Image image={image} x={0} y={0} width={width} height={height} fit="fill" />
              </Canvas>
            ) : (
              <View style={[styles.loading, { width, height }]}>
                <ActivityIndicator color={C.text} />
              </View>
            );
          }}
          extraData={[slides, page]}
        />
        <View style={styles.counter}>
          <Text style={styles.counterText}>
            {page + 1}/{doc.slideCount}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <View style={styles.actionGroup}>
          <Icon name={{ ios: 'heart', android: 'favorite' }} size={24} />
          <Icon name={{ ios: 'bubble.right', android: 'chat_bubble' }} size={22} />
          <Icon name={{ ios: 'paperplane', android: 'send' }} size={22} />
        </View>
        <View style={styles.dots}>
          {pages.map((i) => (
            <View key={i} style={[styles.dot, i === page && { backgroundColor: C.accent }]} />
          ))}
        </View>
        <View style={[styles.actionGroup, { justifyContent: 'flex-end' }]}>
          <Icon name={{ ios: 'bookmark', android: 'bookmark' }} size={22} />
        </View>
      </View>
      <Text style={styles.caption}>Swipe to check every seam before you post.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
  },
  headerTitle: { ...T.display, fontSize: 22 },
  postHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10 },
  avatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.accent },
  handle: { ...T.semibold, fontSize: 14 },
  counter: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: '#000000AA',
    borderRadius: 12,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  counterText: { ...T.semibold, color: '#fff', fontSize: 12 },
  actions: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12 },
  actionGroup: { flex: 1, flexDirection: 'row', gap: 16 },
  dots: { flexDirection: 'row', gap: 4, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 140 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.line },
  loading: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.surface },
  caption: { ...T.displayItalic, color: C.textDim, fontSize: 16, paddingHorizontal: 14 },
});
