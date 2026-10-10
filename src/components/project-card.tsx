import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import type { ProjectSummary } from '@/lib/projects';
import { tileCount } from '@/lib/types';
import { C, R, T } from '@/theme';

import { ActionMenu, type MenuItem } from './action-menu';
import { Icon, PressableScale } from './ui';

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
          <Text style={styles.badgeText}>{tileCount(doc)}</Text>
        </View>
      </View>
      <Text style={styles.name} numberOfLines={1}>
        {doc.name}
      </Text>
      <Text style={styles.meta}>
        {doc.grid != null ? `Grid 3×${doc.grid}` : doc.aspect} · {timeAgo(doc.updatedAt)}
      </Text>
    </PressableScale>
  );
}

/**
 * Home's take on a project: a wide cover with its slide count, the name in
 * the display face and a ••• menu beside it.
 */
export function ShelfProjectCard({
  project,
  width,
  onPress,
  actions,
}: {
  project: ProjectSummary;
  width: number;
  onPress: () => void;
  actions: MenuItem[];
}) {
  const { doc, thumb } = project;
  return (
    <View style={{ width }}>
      <PressableScale
        onPress={onPress}
        scaleTo={0.97}
        accessibilityRole="button"
        accessibilityLabel={`Open ${doc.name}`}
        style={[styles.shelfThumb, { height: Math.round(width * 0.8) }]}>
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
        <View style={styles.shelfBadge}>
          <Icon name={{ ios: 'photo', android: 'image' }} size={12} color={C.text} />
          <Text style={styles.shelfBadgeText}>{tileCount(doc)}</Text>
        </View>
      </PressableScale>
      <View style={styles.shelfRow}>
        <Text style={styles.shelfName} numberOfLines={1}>
          {doc.name}
        </Text>
        <ActionMenu label={`More for ${doc.name}`} items={actions}>
          <View style={styles.more}>
            <Icon name={{ ios: 'ellipsis', android: 'more_horiz' }} size={16} color={C.textDim} />
          </View>
        </ActionMenu>
      </View>
      <Text style={styles.meta}>
        {doc.grid != null ? `Grid 3×${doc.grid}` : doc.aspect} · {timeAgo(doc.updatedAt)}
      </Text>
    </View>
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
  shelfThumb: {
    borderRadius: R.lg - 4,
    overflow: 'hidden',
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#F2EFE91F',
  },
  shelfBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#0A0A0AB3',
    borderRadius: R.pill,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  shelfBadgeText: { ...T.semibold, color: C.text, fontSize: 12 },
  shelfRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 6 },
  shelfName: { ...T.display, fontSize: 21, flex: 1 },
  more: { width: 30, height: 26, alignItems: 'center', justifyContent: 'center', marginRight: -6 },
  meta: { ...T.medium, color: C.textDim, fontSize: 12, marginTop: 2 },
});
