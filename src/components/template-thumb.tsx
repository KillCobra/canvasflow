import { Canvas, Group, Line, vec } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { saveProject } from '@/lib/projects';
import { type Template, instantiate, templateHeight, templatePreview } from '@/lib/templates';
import { SLIDE_WIDTH } from '@/lib/types';
import { C, R, T } from '@/theme';

import { DocRenderer } from './doc-renderer';
import { PressableScale } from './ui';

/** The whole template strip, scaled to `height`, with hairline seams. */
export function TemplateStrip({
  template,
  height: maxHeight,
  maxWidth = Infinity,
}: {
  template: Template;
  height: number;
  maxWidth?: number;
}) {
  const doc = templatePreview(template);
  const H = templateHeight(template);
  const W = template.slideCount * SLIDE_WIDTH;
  const k = Math.min(maxHeight / H, maxWidth / W);
  const width = W * k;
  const height = H * k;
  return (
    <View style={[styles.strip, { width, height }]}>
      <Canvas style={{ width, height }}>
        <Group transform={[{ scale: k }]}>
          <DocRenderer doc={doc} images={{}} />
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
    </View>
  );
}

/** Creates a project from the template and opens it. */
export function startFromTemplate(template: Template, { replace = false } = {}) {
  const doc = instantiate(template);
  saveProject(doc, { create: true });
  if (replace) router.replace(`/editor/${doc.id}`);
  else router.push(`/editor/${doc.id}`);
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
  onPress: () => void;
}) {
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} style={styles.card}>
      <TemplateStrip template={template} height={height} maxWidth={maxWidth} />
      <View style={styles.meta}>
        <Text style={styles.name}>{template.name}</Text>
        <Text style={styles.detail}>
          {template.slideCount} slides · {template.aspect}
        </Text>
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
  card: { gap: 10 },
  meta: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  name: { ...T.display, fontSize: 21 },
  detail: { ...T.medium, color: C.textDim, fontSize: 12 },
});
