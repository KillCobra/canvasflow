import { Canvas, Group, Line, type SkImage, Skia, rect, rrect, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocRenderer } from '@/components/doc-renderer';
import { IconButton } from '@/components/ui';
import type { ImageMap } from '@/lib/images';
import { type PickedPhoto, buildFromPhotos, fillPreview, flowPreview, suggestTemplates } from '@/lib/photos-first';
import { type Template, useTemplates } from '@/lib/templates';
import { type Doc, SLIDE_WIDTH, canvasSize } from '@/lib/types';
import { C, R, T } from '@/theme';

import { detectFaces, isVisionAvailable } from '../../modules/seam-vision';

const MAX_PHOTOS = 12;

/**
 * Start from photos: pick them, see templates that fit them (filled with your
 * own photos, faces kept off the seams), tap one to build the carousel.
 */
export default function PhotosFirstScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const templates = useTemplates();
  const [photos, setPhotos] = useState<PickedPhoto[] | null>(null);
  const [images, setImages] = useState<ImageMap>({});
  const [building, setBuilding] = useState<string | null>(null);

  // Pick on arrival; leave again if nothing was picked.
  useEffect(() => {
    let alive = true;
    const made: SkImage[] = [];
    (async () => {
      // iOS can't present the picker while this screen is still sliding in.
      await new Promise((r) => setTimeout(r, 550));
      if (!alive) return;
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        orderedSelection: true,
        selectionLimit: MAX_PHOTOS,
        quality: 1,
      });
      if (!alive) return;
      if (result.canceled || !result.assets.length) {
        router.back();
        return;
      }
      const picked: PickedPhoto[] = [];
      const map: ImageMap = {};
      for (const [i, a] of result.assets.entries()) {
        // A small copy to preview with (and to look for faces in).
        const context = ImageManipulator.manipulate(a.uri);
        context.resize(a.width >= a.height ? { width: 640 } : { height: 640 });
        const rendered = await context.renderAsync();
        const thumb = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.8 });
        rendered.release();
        context.release();
        const image = Skia.Image.MakeImageFromEncoded(await Skia.Data.fromURI(thumb.uri));
        const key = `pick:${i}`;
        if (image) {
          map[key] = image;
          made.push(image);
        }
        let faces;
        if (isVisionAvailable()) faces = await detectFaces(thumb.uri).catch(() => undefined);
        picked.push({ uri: a.uri, width: a.width, height: a.height, key, faces });
      }
      if (!alive) return;
      setImages(map);
      setPhotos(picked);
    })().catch((e) => {
      Alert.alert('Could not open those photos', e instanceof Error ? e.message : String(e));
      router.back();
    });
    return () => {
      alive = false;
      made.forEach((img) => img.dispose());
    };
  }, []);

  const build = async (choice: { kind: 'template'; template: Template } | { kind: 'flow' }) => {
    if (!photos || building) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setBuilding('Adding your photos…');
    try {
      const id = await buildFromPhotos(choice, photos, (done, total) =>
        setBuilding(done < total ? `Adding photo ${done + 1} of ${total}…` : 'Opening…'),
      );
      router.replace(`/editor/${id}`);
    } catch (e) {
      setBuilding(null);
      Alert.alert('Could not build the carousel', e instanceof Error ? e.message : String(e));
    }
  };

  if (!photos) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={C.text} />
        <Text style={styles.wait}>Looking at your photos…</Text>
      </View>
    );
  }

  const suggestions = suggestTemplates(templates, photos);
  const cardW = width - 40;

  return (
    <View style={[styles.screen, { paddingTop: 8 }]}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Your photos</Text>
          <Text style={styles.subtitle}>
            {photos.length} {photos.length === 1 ? 'photo' : 'photos'} · pick a look
          </Text>
        </View>
        <IconButton label="Close" icon={{ ios: 'xmark', android: 'close' }} onPress={() => router.back()} />
      </View>

      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 40, gap: 22 }}>
        <Suggestion
          title="Seamless flow"
          detail="Your photos run edge to edge across the slides"
          doc={flowPreview(photos)}
          images={images}
          width={cardW}
          onPress={() => build({ kind: 'flow' })}
        />
        <Text style={styles.eyebrow}>Templates that fit</Text>
        {suggestions.map((t) => {
          const slots = t.doc ? t.doc.layers.filter((l) => l.type === 'photo').length : t.items.filter((i) => i.kind === 'slot').length;
          const detail =
            slots === photos.length
              ? `${slots} frames · one for each photo`
              : slots > photos.length
                ? `${slots} frames · ${slots - photos.length} left to fill`
                : `${slots} frames · ${photos.length - slots} more on extra slides`;
          return (
            <Suggestion
              key={t.id}
              title={t.name}
              detail={detail}
              doc={fillPreview(t, photos)}
              images={images}
              width={cardW}
              onPress={() => build({ kind: 'template', template: t })}
            />
          );
        })}
      </ScrollView>

      {building && (
        <View style={[StyleSheet.absoluteFill, styles.building]}>
          <ActivityIndicator color={C.text} size="large" />
          <Text style={styles.wait}>{building}</Text>
        </View>
      )}
    </View>
  );
}

function Suggestion({
  title,
  detail,
  doc,
  images,
  width,
  onPress,
}: {
  title: string;
  detail: string;
  doc: Doc;
  images: ImageMap;
  width: number;
  onPress: () => void;
}) {
  const { width: W, height: H } = canvasSize(doc);
  const k = Math.min(width / W, 170 / H);
  const w = W * k;
  const h = H * k;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [{ gap: 8 }, pressed && { opacity: 0.7 }]} accessibilityRole="button" accessibilityLabel={title}>
      <View style={[styles.preview, { height: h + 20 }]}>
        <Canvas style={{ width: w, height: h }}>
          <Group clip={rrect(rect(0, 0, w, h), 10, 10)}>
            <Group transform={[{ scale: k }]}>
              <DocRenderer doc={doc} images={images} />
            </Group>
            {Array.from({ length: doc.slideCount - 1 }, (_, i) => (
              <Line key={i} p1={vec((i + 1) * SLIDE_WIDTH * k, 0)} p2={vec((i + 1) * SLIDE_WIDTH * k, h)} color="#00000033" strokeWidth={1} />
            ))}
          </Group>
        </Canvas>
      </View>
      <View style={styles.cardText}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardDetail}>{detail}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', paddingLeft: 20, paddingRight: 10, paddingVertical: 10 },
  title: { ...T.display, fontSize: 34 },
  subtitle: { ...T.body, color: C.textDim, fontSize: 14 },
  eyebrow: { ...T.semibold, color: C.textDim, fontSize: 12, letterSpacing: 1.4, textTransform: 'uppercase', marginTop: 4 },
  preview: { alignItems: 'center', justifyContent: 'center', borderRadius: R.md, backgroundColor: C.surface },
  cardText: { gap: 2, paddingHorizontal: 2 },
  cardTitle: { ...T.display, fontSize: 22 },
  cardDetail: { ...T.body, color: C.textDim, fontSize: 13 },
  wait: { ...T.body, color: C.textDim, fontSize: 14 },
  building: { backgroundColor: '#0A0A0AE6', alignItems: 'center', justifyContent: 'center', gap: 14, zIndex: 10 },
});
