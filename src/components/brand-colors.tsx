import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';

import { addBrandColor, normalizeHex, removeBrandColor, useBrandColors } from '@/lib/brand';
import { C, R, T } from '@/theme';

import { Icon, PressableScale } from './ui';

/**
 * The brand palette at the start of a colour row: a "+" that saves the
 * current colour, then the saved swatches (long-press one to remove it).
 * Returns siblings, so put it straight inside an HScroll and its gap applies.
 */
export function BrandColors({
  current,
  onPick,
  size = 28,
}: {
  /** The colour the row is editing; "+" saves it. */
  current: string | null | undefined;
  onPick: (color: string) => void;
  size?: number;
}) {
  const brand = useBrandColors();
  const hex = current ? normalizeHex(current) : null;
  const canSave = !!hex && !brand.includes(hex);
  const save = () => {
    if (!hex) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    addBrandColor(hex);
  };
  const ring = size + 10;

  return (
    <>
      {brand.length === 0 ? (
        // First run: spell out what the button is for.
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Save colour to brand palette"
          disabled={!canSave}
          onPress={save}
          style={[styles.first, { height: size + 4 }, !canSave && styles.off]}>
          <Icon name={{ ios: 'plus', android: 'add' }} size={12} color={C.accent} />
          <Text style={styles.firstText}>Brand</Text>
        </PressableScale>
      ) : (
        <PressableScale
          accessibilityRole="button"
          accessibilityLabel="Save colour to brand palette"
          disabled={!canSave}
          scaleTo={0.9}
          onPress={save}
          style={[styles.ring, { width: ring, height: ring }]}>
          <View style={[styles.add, { width: size, height: size, borderRadius: size / 2 }, !canSave && styles.off]}>
            <Icon name={{ ios: 'plus', android: 'add' }} size={Math.round(size * 0.45)} color={C.text} />
          </View>
        </PressableScale>
      )}
      {brand.map((c) => (
        <PressableScale
          key={c}
          accessibilityRole="button"
          accessibilityLabel={`Brand colour ${c}`}
          accessibilityHint="Long press to remove it from your palette"
          scaleTo={0.9}
          delayLongPress={450}
          onPress={() => {
            Haptics.selectionAsync();
            onPick(c);
          }}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            removeBrandColor(c);
          }}
          style={[styles.ring, { width: ring, height: ring, borderColor: hex === c ? C.text : 'transparent' }]}>
          <View style={[styles.dot, { width: size, height: size, borderRadius: size / 2, backgroundColor: c }]} />
        </PressableScale>
      ))}
      <View style={[styles.divider, { height: size }]} />
    </>
  );
}

const styles = StyleSheet.create({
  ring: { borderWidth: 1.5, borderColor: 'transparent', borderRadius: R.pill, alignItems: 'center', justifyContent: 'center' },
  dot: { borderWidth: StyleSheet.hairlineWidth, borderColor: '#ffffff26' },
  add: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.textDim,
  },
  first: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    borderRadius: R.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: C.textFaint,
    marginRight: 2,
  },
  firstText: { ...T.medium, color: C.accent, fontSize: 12 },
  off: { opacity: 0.35 },
  divider: { width: StyleSheet.hairlineWidth, backgroundColor: C.line, marginHorizontal: 4 },
});
