import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { ProjectSummary } from '@/lib/projects';
import { C, R, T } from '@/theme';

import { PressableScale } from './ui';

/** A carousel's cover (its first slide), slide count, name and age. */
export function ProjectCard({
  project,
  width,
  onPress,
}: {
  project: ProjectSummary;
  width: number;
  onPress: () => void;
}) {
  const { doc, thumb } = project;
  return (
    <PressableScale onPress={onPress} scaleTo={0.97} style={{ width }}>
      <View style={[styles.thumb, { height: width * 1.25 }]}>
        {thumb ? (
          <Image
            source={{ uri: thumb }}
            cachePolicy="none"
            recyclingKey={`${doc.id}-${doc.updatedAt}`}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: C.surfaceHi }]} />
        )}
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{doc.slideCount}</Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {doc.name}
      </Text>
      <Text style={styles.meta}>
        {doc.aspect} · {timeAgo(doc.updatedAt)}
      </Text>
    </PressableScale>
  );
}

export function timeAgo(t: number) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const styles = StyleSheet.create({
  thumb: {
    borderRadius: R.md,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  badge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: '#0A0A0AB3',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 2,
  },
  badgeText: { ...T.semibold, color: C.text, fontSize: 11 },
  name: { ...T.display, fontSize: 18, marginTop: 10 },
  meta: { ...T.medium, color: C.textDim, fontSize: 12, marginTop: 2 },
});
