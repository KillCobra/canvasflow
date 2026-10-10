import { Canvas, Group, Line, vec } from '@shopify/react-native-skia';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DocRenderer } from '@/components/doc-renderer';
import { Eyebrow, Icon, IconButton, PressableScale } from '@/components/ui';
import { saveProject } from '@/lib/projects';
import { decodeTemplate, projectFromTemplate } from '@/lib/template-link';
import { ASPECTS, SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

/** Opened from a template link (seam://import?t=...): preview it, then start a project from it. */
export default function ImportScreen() {
  const insets = useSafeAreaInsets();
  const { width, height: screenH } = useWindowDimensions();
  const params = useLocalSearchParams<{ t?: string | string[] }>();
  const raw = Array.isArray(params.t) ? params.t[0] : params.t;
  // Decoding mints layer ids, so do it once per link.
  const template = useMemo(() => (raw ? decodeTemplate(raw) : null), [raw]);

  // Opened cold from a link there's nothing underneath, so land on Home.
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  const use = () => {
    if (!template) return;
    const doc = projectFromTemplate(template);
    saveProject(doc, { create: true });
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    close();
    router.push(`/editor/${doc.id}`);
  };

  const header = (
    <View style={styles.header}>
      <Text style={styles.title}>Template</Text>
      <IconButton label="Close" icon={{ ios: 'xmark', android: 'close' }} onPress={close} />
    </View>
  );

  if (!template) {
    return (
      <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
        {header}
        <View style={styles.center}>
          <Icon name={{ ios: 'link.badge.plus', android: 'link_off' }} size={34} color={C.textDim} />
          <Text style={styles.heading}>This link doesn’t open</Text>
          <Text style={styles.body}>
            It may have been cut short when it was copied. Ask for the template link again.
          </Text>
        </View>
        <PressableScale onPress={close} style={[styles.button, styles.buttonQuiet]}>
          <Text style={[styles.buttonText, { color: C.text }]}>Close</Text>
        </PressableScale>
      </View>
    );
  }

  const H = ASPECTS[template.aspect].height;
  const W = template.slideCount * SLIDE_WIDTH;
  const k = Math.min((width - 40) / W, (screenH * 0.36) / H);
  const slots = template.layers.filter((l) => l.type === 'photo').length;

  return (
    <View style={[styles.screen, { paddingBottom: insets.bottom + 16 }]}>
      {header}
      <View style={styles.center}>
        <Animated.View entering={FadeInDown.duration(420)} style={[styles.strip, { width: W * k, height: H * k }]}>
          <Canvas style={{ width: W * k, height: H * k }}>
            <Group transform={[{ scale: k }]}>
              <DocRenderer doc={template} images={{}} />
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
        <Animated.View entering={FadeInDown.delay(80).duration(420)} style={{ alignItems: 'center', gap: 8 }}>
          <Eyebrow>Shared with you</Eyebrow>
          <Text style={styles.heading} numberOfLines={2}>
            {template.name}
          </Text>
          <Text style={styles.meta}>
            {template.slideCount} {template.slideCount === 1 ? 'slide' : 'slides'} · {template.aspect}
            {slots ? ` · ${slots} photo ${slots === 1 ? 'frame' : 'frames'}` : ''}
          </Text>
          <Text style={styles.body}>Photos aren’t included. Fill the empty frames with your own.</Text>
        </Animated.View>
      </View>
      <PressableScale onPress={use} style={styles.button}>
        <Icon name={{ ios: 'plus', android: 'add' }} size={16} color={C.bg} />
        <Text style={styles.buttonText}>Use template</Text>
      </PressableScale>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 18,
    paddingBottom: 12,
    marginRight: -10,
  },
  title: { ...T.display, fontSize: 36 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 26 },
  strip: {
    borderRadius: R.sm,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
  },
  heading: { ...T.display, fontSize: 30, textAlign: 'center' },
  meta: { ...T.medium, color: C.textDim, fontSize: 13 },
  body: { ...T.body, color: C.textDim, fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 300 },
  button: {
    height: 52,
    borderRadius: R.pill,
    backgroundColor: C.text,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  buttonQuiet: { backgroundColor: C.surfaceHi },
  buttonText: { ...T.semibold, color: C.bg, fontSize: 15 },
});
