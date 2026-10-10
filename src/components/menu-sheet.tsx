import { useState } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { C, R, T } from '@/theme';

import { Icon, type IconName, PressableScale } from './ui';

export type MenuRow = {
  label: string;
  icon?: IconName;
  checked?: boolean;
  destructive?: boolean;
  onPress: () => void;
};

/**
 * A bottom sheet of actions, for platforms without a native context menu
 * (Android's Alert only fits three buttons).
 */
export function MenuSheet({
  visible,
  title,
  rows,
  onClose,
}: {
  visible: boolean;
  title: string;
  rows: MenuRow[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Close" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 12 }]}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {rows.map((row) => (
          <Pressable
            key={row.label}
            onPress={row.onPress}
            accessibilityRole="button"
            accessibilityState={{ selected: row.checked }}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: C.surfaceHi }]}>
            {row.icon && <Icon name={row.icon} size={19} color={row.destructive ? C.danger : C.textDim} />}
            <Text style={[styles.label, row.destructive && { color: C.danger }]}>{row.label}</Text>
            {row.checked && <Icon name={{ ios: 'checkmark', android: 'check' }} size={17} color={C.accent} />}
          </Pressable>
        ))}
      </View>
    </Modal>
  );
}

type PromptOptions = {
  /** Shown as the message on iOS and the empty-field hint elsewhere. */
  placeholder?: string;
  /** Lets an empty answer through (to clear a value). */
  allowEmpty?: boolean;
};

type Ask = { title: string; initial: string; done: (name: string) => void } & PromptOptions;

/**
 * Asks for a name: the system prompt on iOS, a small sheet elsewhere
 * (Alert.prompt is iOS-only). Render `element` once in the screen.
 */
export function useNamePrompt() {
  const [ask, setAsk] = useState<Ask | null>(null);
  const prompt = (title: string, initial: string, done: (name: string) => void, options: PromptOptions = {}) => {
    if (Platform.OS === 'ios') {
      Alert.prompt(
        title,
        options.placeholder,
        (value) => {
          if (value.trim() || options.allowEmpty) done(value.trim());
        },
        'plain-text',
        initial,
      );
    } else {
      setAsk({ title, initial, done, ...options });
    }
  };
  const element = ask ? <NameSheet ask={ask} onClose={() => setAsk(null)} /> : null;
  return [prompt, element] as const;
}

function NameSheet({ ask, onClose }: { ask: Ask; onClose: () => void }) {
  const [value, setValue] = useState(ask.initial);
  const submit = () => {
    if (value.trim() || ask.allowEmpty) ask.done(value.trim());
    onClose();
  };
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.scrim} onPress={onClose} accessibilityLabel="Cancel" />
      <View style={styles.dialog}>
        <Text style={styles.title}>{ask.title}</Text>
        <TextInput
          value={value}
          onChangeText={setValue}
          onSubmitEditing={submit}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          placeholder={ask.placeholder ?? 'Name'}
          placeholderTextColor={C.textFaint}
          style={styles.input}
        />
        <PressableScale onPress={submit} style={styles.done}>
          <Text style={styles.doneText}>Done</Text>
        </PressableScale>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: '#000000A6' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface,
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
    paddingTop: 18,
    paddingHorizontal: 8,
  },
  title: { ...T.display, fontSize: 24, paddingHorizontal: 14, marginBottom: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, height: 52, paddingHorizontal: 14, borderRadius: R.md },
  label: { ...T.medium, fontSize: 16, flex: 1 },
  dialog: {
    position: 'absolute',
    left: 24,
    right: 24,
    top: '30%',
    backgroundColor: C.surface,
    borderRadius: R.lg,
    padding: 18,
    gap: 14,
  },
  input: {
    ...T.medium,
    fontSize: 16,
    height: 48,
    borderRadius: R.md,
    backgroundColor: C.surfaceHi,
    paddingHorizontal: 14,
  },
  done: { height: 46, borderRadius: R.pill, backgroundColor: C.text, alignItems: 'center', justifyContent: 'center' },
  doneText: { ...T.semibold, color: C.bg, fontSize: 15 },
});
