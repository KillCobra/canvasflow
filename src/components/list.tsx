import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { C, R, T } from '@/theme';

import { Eyebrow, Icon, type IconName } from './ui';

/** A titled group of rows on a rounded card, iOS Settings style. */
export function Section({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 10 }}>
      {title && <Eyebrow style={{ paddingHorizontal: 4 }}>{title}</Eyebrow>}
      <View style={styles.card}>{children}</View>
      {footer && <Text style={styles.footer}>{footer}</Text>}
    </View>
  );
}

/** One row: icon, title (and detail), then a value, a control or a chevron. */
export function Row({
  icon,
  tint = C.text,
  title,
  detail,
  value,
  right,
  badge,
  danger,
  onPress,
  last,
}: {
  icon?: IconName;
  tint?: string;
  title: string;
  detail?: string;
  value?: string;
  right?: ReactNode;
  badge?: string;
  danger?: boolean;
  onPress?: () => void;
  /** Drops the divider under the final row. */
  last?: boolean;
}) {
  const color = danger ? '#E5484D' : C.text;
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: '#FFFFFF0A' }]}>
      {icon && (
        <View style={styles.icon}>
          <Icon name={icon} size={17} color={danger ? color : tint} />
        </View>
      )}
      <View style={[styles.body, !last && styles.divider]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.title, { color }]} numberOfLines={1}>
            {title}
          </Text>
          {detail && (
            <Text style={styles.detail} numberOfLines={2}>
              {detail}
            </Text>
          )}
        </View>
        {badge && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{badge}</Text>
          </View>
        )}
        {value && <Text style={styles.value}>{value}</Text>}
        {right}
        {onPress && !right && <Icon name={{ ios: 'chevron.right', android: 'chevron_right' }} size={13} color={C.textFaint} />}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: C.surface,
    borderRadius: R.lg,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.lineSoft,
  },
  footer: { ...T.body, color: C.textFaint, fontSize: 12, lineHeight: 17, paddingHorizontal: 6 },
  row: { flexDirection: 'row', alignItems: 'center', paddingLeft: 14 },
  icon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: C.surfaceHi,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  body: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 54, paddingVertical: 10, paddingRight: 14 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  title: { ...T.medium, fontSize: 15 },
  detail: { ...T.body, color: C.textDim, fontSize: 12, lineHeight: 16 },
  value: { ...T.medium, color: C.textDim, fontSize: 14 },
  badge: { backgroundColor: C.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badgeText: { ...T.semibold, color: C.accentInk, fontSize: 11 },
});
