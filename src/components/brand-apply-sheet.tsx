import { Canvas, Group, RoundedRect, rect, rrect } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { switchBrandKit, useBrandColors, useBrandFonts, useBrandKits, useBrandProfile } from '@/lib/brand';
import { type ApplyOptions, type BrandKit, applyBrand, variantCount } from '@/lib/brand-apply';
import { fontInfo } from '@/lib/fonts';
import type { ImageMap } from '@/lib/images';
import { type Doc, canvasSize } from '@/lib/types';
import { C, R, T } from '@/theme';

import { DocRenderer } from './doc-renderer';
import { Chip, HScroll, Icon, PressableScale } from './ui';

const HANDLE_TOKENS = /@(yourname|yourhandle|handle|username)\b/i;

/**
 * Recolours the open carousel with the brand kit: a live preview, a few
 * looks to pick from, and switches for colours, fonts and the handle.
 */
export function BrandApplySheet({
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
  const { width: screenW } = useWindowDimensions();
  const colors = useBrandColors();
  const fonts = useBrandFonts();
  const profile = useBrandProfile();
  const kits = useBrandKits();
  const kit: BrandKit = { colors, fonts, profile };
  const hasHandle = !!profile.handle && doc.layers.some((l) => l.type === 'text' && HANDLE_TOKENS.test(l.text));
  const [opts, setOpts] = useState<ApplyOptions>({
    colors: colors.length > 0,
    fonts: fonts.length > 0,
    details: true,
    variant: 0,
  });
  const looks = variantCount(kit);
  const empty = !colors.length && !fonts.length;

  const result = applyBrand(doc, kit, { ...opts, details: opts.details && hasHandle });
  const { width: W, height: H } = canvasSize(doc);
  const maxW = screenW - 36;
  const k = Math.min(maxW / W, 240 / H);
  const pw = W * k;
  const ph = H * k;

  const set = (patch: Partial<ApplyOptions>) => {
    Haptics.selectionAsync();
    setOpts((o) => ({ ...o, ...patch }));
  };

  const apply = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onApply(result.doc);
  };

  return (
    <Animated.View entering={FadeIn.duration(180)} exiting={FadeOut.duration(160)} style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
      <Animated.View
        entering={SlideInDown.springify().damping(22).stiffness(220)}
        exiting={SlideOutDown.duration(200)}
        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <View style={styles.grabber} />
        <View style={styles.titleRow}>
          <Text style={styles.title}>Apply brand kit</Text>
          <Pressable
            onPress={() => {
              onClose();
              router.push('/brand-kit');
            }}
            hitSlop={10}>
            <Text style={styles.link}>Edit kit</Text>
          </Pressable>
        </View>

        {kits.kits.length > 1 && (
          <View style={{ marginHorizontal: -18 }}>
            <HScroll>
              <View style={{ width: 10 }} />
              {kits.kits.map((k) => (
                <Chip
                  key={k.id}
                  label={k.name}
                  selected={k.id === kits.active}
                  onPress={() => {
                    Haptics.selectionAsync();
                    switchBrandKit(k.id);
                    setOpts((o) => ({ ...o, variant: 0 }));
                  }}
                  style={{ height: 32 }}
                />
              ))}
              <View style={{ width: 10 }} />
            </HScroll>
          </View>
        )}

        {empty ? (
          <View style={styles.empty}>
            <Icon name={{ ios: 'paintpalette', android: 'palette' }} size={28} color={C.accent} />
            <Text style={styles.emptyTitle}>Your brand kit is empty</Text>
            <Text style={styles.emptyText}>Add your colours and fonts once, then restyle any carousel with them in one tap.</Text>
            <PressableScale
              onPress={() => {
                onClose();
                router.push('/brand-kit');
              }}
              style={[styles.cta, { alignSelf: 'stretch' }]}>
              <Text style={styles.ctaText}>Set up brand kit</Text>
            </PressableScale>
          </View>
        ) : (
          <ScrollView style={{ maxHeight: 560 }} contentContainerStyle={{ gap: 16 }} showsVerticalScrollIndicator={false}>
            <View style={[styles.preview, { height: ph + 20 }]}>
              <Canvas style={{ width: pw, height: ph }}>
                <Group clip={rrect(rect(0, 0, pw, ph), 10, 10)}>
                  <Group transform={[{ scale: k }]}>
                    <DocRenderer doc={result.doc} images={images} />
                  </Group>
                </Group>
                <RoundedRect x={0.5} y={0.5} width={pw - 1} height={ph - 1} r={10} color="#FFFFFF22" style="stroke" strokeWidth={1} />
              </Canvas>
            </View>

            {opts.colors && looks > 1 && (
              <View style={styles.looks}>
                {Array.from({ length: looks }, (_, v) => {
                  const swaps = applyBrand(doc, kit, { colors: true, fonts: false, details: false, variant: v }).swaps;
                  const on = v === opts.variant;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => set({ variant: v })}
                      style={[styles.look, on && styles.lookOn]}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={`Look ${v + 1}`}>
                      <View style={styles.lookSwatches}>
                        {(swaps.length ? swaps : [{ to: C.surfaceHi }]).slice(0, 4).map((s, i) => (
                          <View key={i} style={[styles.lookChip, { backgroundColor: s.to }]} />
                        ))}
                      </View>
                      <Text style={[styles.lookText, on && { color: C.text }]}>Look {v + 1}</Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <View style={styles.card}>
              <Toggle
                title="Colours"
                detail={colors.length ? `${colors.length} in your kit` : 'Add colours to your kit'}
                value={opts.colors}
                disabled={!colors.length}
                onChange={(v) => set({ colors: v })}
              />
              <Toggle
                title="Fonts"
                detail={
                  fonts.length
                    ? `${fontInfo(fonts[0]).label} for headings${fonts[1] ? `, ${fontInfo(fonts[1]).label} for text` : ''}`
                    : 'Add fonts to your kit'
                }
                value={opts.fonts}
                disabled={!fonts.length}
                onChange={(v) => set({ fonts: v })}
              />
              <Toggle
                title="Handle"
                detail={
                  hasHandle ? `@yourname becomes @${profile.handle}` : profile.handle ? 'No @yourname in this carousel' : 'Add your handle to the kit'
                }
                value={opts.details && hasHandle}
                disabled={!hasHandle}
                onChange={(v) => set({ details: v })}
                last
              />
            </View>

            <PressableScale onPress={apply} disabled={result.changed === 0} style={[styles.cta, result.changed === 0 && { opacity: 0.4 }]}>
              <Text style={styles.ctaText}>{result.changed === 0 ? 'Already on brand' : 'Apply'}</Text>
            </PressableScale>
            <Text style={styles.note}>One step: undo puts everything back.</Text>
          </ScrollView>
        )}
      </Animated.View>
    </Animated.View>
  );
}

function Toggle({
  title,
  detail,
  value,
  disabled,
  onChange,
  last,
}: {
  title: string;
  detail: string;
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
  last?: boolean;
}) {
  return (
    <View style={[styles.toggle, !last && styles.divider, disabled && { opacity: 0.45 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.toggleTitle}>{title}</Text>
        <Text style={styles.toggleDetail} numberOfLines={1}>
          {detail}
        </Text>
      </View>
      <Switch value={value} disabled={disabled} onValueChange={onChange} trackColor={{ true: C.accent, false: C.surfaceHi }} />
    </View>
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
    gap: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: C.line, marginBottom: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', paddingHorizontal: 2 },
  title: { ...T.display, fontSize: 32 },
  link: { ...T.medium, color: C.accent, fontSize: 15 },
  preview: { alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg, borderRadius: R.md },
  looks: { flexDirection: 'row', gap: 10 },
  look: {
    flex: 1,
    gap: 8,
    padding: 8,
    borderRadius: R.md,
    backgroundColor: C.surfaceHi,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
  },
  lookOn: { borderColor: C.accent },
  lookSwatches: { flexDirection: 'row', gap: 3, alignSelf: 'stretch' },
  lookChip: { flex: 1, height: 22, borderRadius: 5, borderWidth: StyleSheet.hairlineWidth, borderColor: '#FFFFFF26' },
  lookText: { ...T.medium, color: C.textDim, fontSize: 12 },
  card: { backgroundColor: C.surfaceHi, borderRadius: R.lg, overflow: 'hidden' },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, minHeight: 60, paddingVertical: 8 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  toggleTitle: { ...T.medium, fontSize: 15 },
  toggleDetail: { ...T.body, color: C.textDim, fontSize: 12 },
  cta: { height: 54, borderRadius: R.pill, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  ctaText: { ...T.semibold, color: C.bg, fontSize: 16 },
  note: { ...T.body, color: C.textFaint, fontSize: 12, textAlign: 'center' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 18 },
  emptyTitle: { ...T.display, fontSize: 26 },
  emptyText: { ...T.body, color: C.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 12, marginBottom: 6 },
});
