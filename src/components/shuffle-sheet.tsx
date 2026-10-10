import { Canvas, Group, rect, rrect } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useBrandColors, useBrandFonts, useBrandProfile } from '@/lib/brand';
import type { ImageMap } from '@/lib/images';
import { shuffleVariants } from '@/lib/shuffle';
import { type Doc, canvasSize } from '@/lib/types';
import { C, R, T } from '@/theme';

import { DocRenderer } from './doc-renderer';
import { Icon, PressableScale } from './ui';

/** The open carousel in six other colourways and type pairings; tap one, then apply it. */
export function ShuffleSheet({
  doc,
  images,
  onApply,
  onClose,
}: {
  doc: Doc;
  images: ImageMap;
  onApply: (doc: Doc) => void;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const colors = useBrandColors();
  const fonts = useBrandFonts();
  const profile = useBrandProfile();
  const [seed, setSeed] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);

  const variants = shuffleVariants(doc, { colors, fonts, profile }, seed);
  const chosen = variants.find((v) => v.key === picked);
  const { width: W, height: H } = canvasSize(doc);
  const cardW = screenW - 36;
  const k = Math.min(cardW / W, 150 / H);

  const again = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setSeed((s) => s + 1);
    setPicked(null);
  };

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View
        entering={SlideInDown.springify().damping(22).stiffness(220)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8, maxHeight: screenH * 0.86 }]}>
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>Shuffle style</Text>
          <Pressable onPress={again} hitSlop={10} style={styles.again}>
            <Icon name={{ ios: 'shuffle', android: 'shuffle' }} size={16} color={C.accent} />
            <Text style={styles.link}>Shuffle</Text>
          </Pressable>
        </View>
        <Text style={styles.subtitle}>Same layout, new colours and type. Your photos stay as they are.</Text>

        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 6 }} showsVerticalScrollIndicator={false}>
          {variants.map((v) => {
            const on = v.key === picked;
            return (
              <Pressable
                key={v.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setPicked(v.key);
                }}
                style={[styles.card, on && styles.cardOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={v.label}>
                <View style={[styles.preview, { height: H * k + 16 }]}>
                  <Canvas style={{ width: W * k, height: H * k }}>
                    <Group clip={rrect(rect(0, 0, W * k, H * k), 8, 8)}>
                      <Group transform={[{ scale: k }]}>
                        <DocRenderer doc={v.doc} images={images} />
                      </Group>
                    </Group>
                  </Canvas>
                </View>
                <View style={styles.cardFooter}>
                  <Text style={[styles.cardLabel, on && { color: C.text }]} numberOfLines={1}>
                    {v.label}
                  </Text>
                  {on && <Icon name={{ ios: 'checkmark.circle.fill', android: 'check_circle' }} size={18} color={C.accent} />}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>

        <PressableScale
          onPress={() => {
            if (!chosen) return;
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onApply(chosen.doc);
          }}
          disabled={!chosen}
          style={[styles.cta, !chosen && { opacity: 0.4 }]}>
          <Text style={styles.ctaText}>{chosen ? 'Use this style' : 'Pick a style'}</Text>
        </PressableScale>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#000000A6', zIndex: 20 },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 18,
    paddingTop: 10,
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  title: { ...T.display, fontSize: 32 },
  subtitle: { ...T.body, color: C.textDim, fontSize: 13, marginTop: -6, paddingHorizontal: 2 },
  again: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  link: { ...T.medium, color: C.accent, fontSize: 15 },
  card: { borderRadius: R.md, backgroundColor: C.surfaceHi, borderWidth: 1.5, borderColor: 'transparent', overflow: 'hidden' },
  cardOn: { borderColor: C.accent },
  preview: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, height: 38 },
  cardLabel: { ...T.medium, color: C.textDim, fontSize: 13, flex: 1 },
  cta: { height: 54, borderRadius: R.pill, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...T.semibold, color: C.bg, fontSize: 16 },
});
