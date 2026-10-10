import * as Haptics from 'expo-haptics';
import { Fragment, type ReactNode, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

import { C, R, T } from '@/theme';

import { Icon, type IconName } from './ui';

export type MenuItem = {
  label: string;
  icon?: IconName;
  onPress?: () => void;
  /** An on/off switch (a checkmark row). `checked` is its state. */
  toggle?: boolean;
  /** The selected choice, or a switched-on toggle. */
  checked?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** Draws a separator above this row. */
  separator?: boolean;
  /** Nested choices: a submenu on iOS, an inline group elsewhere. */
  items?: MenuItem[];
};

export type ActionMenuProps = {
  /** Accessibility label for the trigger. */
  label: string;
  items: MenuItem[];
  /** How the trigger looks. Keep it non-interactive: the menu owns the tap. */
  children: ReactNode;
  disabled?: boolean;
};

const ROW = 44;
const WIDTH = 236;

/**
 * Tap-to-open menu anchored to its trigger (the iOS build uses the native
 * SwiftUI menu instead).
 */
export function ActionMenu({ label, items, children, disabled }: ActionMenuProps) {
  const trigger = useRef<View>(null);
  const screen = useWindowDimensions();
  const [anchor, setAnchor] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const close = () => setAnchor(null);

  const rows = items.reduce((n, i) => n + 1 + (i.items?.length ?? 0), 0);
  const height = Math.min(rows * ROW + 12, screen.height * 0.7);
  // Open below the trigger unless that runs off screen; align to the nearer edge.
  const place = anchor && {
    top: anchor.y + anchor.h + 6 + height < screen.height - 24 ? anchor.y + anchor.h + 6 : Math.max(24, anchor.y - height - 6),
    left: Math.max(
      12,
      Math.min(screen.width - WIDTH - 12, anchor.x + anchor.w / 2 > screen.width / 2 ? anchor.x + anchor.w - WIDTH : anchor.x),
    ),
  };

  const run = (item: MenuItem) => {
    close();
    Haptics.selectionAsync();
    item.onPress?.();
  };

  return (
    <>
      <Pressable
        ref={trigger}
        accessibilityRole="button"
        accessibilityLabel={label}
        disabled={disabled}
        hitSlop={6}
        style={{ opacity: disabled ? 0.28 : 1 }}
        onPress={() => trigger.current?.measureInWindow((x, y, w, h) => setAnchor({ x, y, w, h }))}>
        {children}
      </Pressable>
      <Modal visible={!!anchor} transparent animationType="none" onRequestClose={close} statusBarTranslucent>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
        {place && (
          <Animated.View entering={FadeIn.duration(120)} style={[styles.menu, { ...place, maxHeight: height }]}>
            <ScrollView bounces={false}>
              {items.map((item) => (
                <Fragment key={item.label}>
                  {item.separator && <View style={styles.separator} />}
                  {item.items ? (
                    <>
                      <Text style={styles.group}>{item.label}</Text>
                      {item.items.map((sub) => (
                        <Row key={sub.label} item={sub} onPress={() => run(sub)} />
                      ))}
                    </>
                  ) : (
                    <Row item={item} onPress={() => run(item)} />
                  )}
                </Fragment>
              ))}
            </ScrollView>
          </Animated.View>
        )}
      </Modal>
    </>
  );
}

function Row({ item, onPress }: { item: MenuItem; onPress: () => void }) {
  const color = item.destructive ? C.danger : C.text;
  return (
    <Pressable
      accessibilityRole="menuitem"
      disabled={item.disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceHi }, item.disabled && { opacity: 0.35 }]}>
      <View style={styles.icon}>{item.icon && <Icon name={item.icon} size={17} color={color} />}</View>
      <Text style={[styles.label, { color }]} numberOfLines={1}>
        {item.label}
      </Text>
      {item.checked && <Icon name={{ ios: 'checkmark', android: 'check' }} size={15} color={C.accent} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  menu: {
    position: 'absolute',
    width: WIDTH,
    paddingVertical: 6,
    borderRadius: R.md,
    backgroundColor: C.surface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: C.line,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  row: { height: ROW, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14 },
  icon: { width: 22, alignItems: 'center' },
  label: { ...T.medium, flex: 1, fontSize: 15 },
  group: { ...T.semibold, color: C.textDim, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 },
  separator: { height: StyleSheet.hairlineWidth, backgroundColor: C.line, marginVertical: 5 },
});
