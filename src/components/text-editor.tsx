import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { contrastInk } from '@/lib/color';
import { allFonts, fontInfo, importFont, useFontsVersion } from '@/lib/fonts';
import type { TextLayer } from '@/lib/types';
import { C, PALETTE, R, T } from '@/theme';

import { Chip, HScroll, IconButton, Swatch } from './ui';

export type TextValues = Pick<TextLayer, 'text' | 'font' | 'color' | 'align' | 'fill'>;

const ALIGN_ICON = {
  left: { ios: 'text.alignleft', android: 'format_align_left' },
  center: { ios: 'text.aligncenter', android: 'format_align_center' },
  right: { ios: 'text.alignright', android: 'format_align_right' },
} as const;
const NEXT_ALIGN = { left: 'center', center: 'right', right: 'left' } as const;

export function TextEditor({
  initial,
  canvasColor,
  onDone,
  onCancel,
}: {
  initial: TextValues;
  /** Background the text will sit on, so the preview reads true. */
  canvasColor: string;
  onDone: (values: TextValues) => void;
  onCancel: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [values, setValues] = useState(initial);
  // In pill mode the swatch picks the pill color and the ink follows it.
  const accentColor = values.fill ?? values.color;
  const set = (patch: Partial<TextValues>) => setValues((v) => ({ ...v, ...patch }));

  const pickColor = (color: string) =>
    values.fill ? set({ fill: color, color: contrastInk(color) }) : set({ color });

  const togglePill = () =>
    values.fill
      ? set({ fill: null, color: contrastInk(canvasColor) })
      : set({ fill: values.color, color: contrastInk(values.color) });

  useFontsVersion();
  const font = fontInfo(values.font);
  const addFont = async () => {
    try {
      const id = await importFont();
      if (id) set({ font: id });
    } catch (e) {
      Alert.alert('Could not add font', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, paddingTop: insets.top }}>
        <View style={styles.header}>
          <Pressable onPress={onCancel} hitSlop={10}>
            <Text style={styles.headerText}>Cancel</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <IconButton
              label="Alignment"
              icon={ALIGN_ICON[values.align]}
              tone="filled"
              onPress={() => set({ align: NEXT_ALIGN[values.align] })}
            />
            <IconButton
              label="Background pill"
              icon={{ ios: values.fill ? 'a.square.fill' : 'a.square', android: 'format_color_fill' }}
              tone={values.fill ? 'accent' : 'filled'}
              onPress={togglePill}
            />
          </View>
          <Pressable
            onPress={() => onDone({ ...values, text: values.text.trim() })}
            hitSlop={10}>
            <Text style={[styles.headerText, styles.done]}>Done</Text>
          </Pressable>
        </View>

        <View style={styles.inputWrap}>
          <View style={[styles.canvasCard, { backgroundColor: canvasColor }]}>
            <TextInput
              autoFocus
              multiline
              value={values.text}
              onChangeText={(text) => set({ text })}
              placeholder="Type something"
              placeholderTextColor={`${values.color}66`}
              selectionColor={C.accent}
              style={[
                styles.input,
                {
                  fontFamily: font.rn,
                  textAlign: values.align,
                  color: values.color,
                  backgroundColor: values.fill ?? 'transparent',
                },
              ]}
            />
          </View>
        </View>

        <View style={{ gap: 12, paddingBottom: 12 }}>
          <HScroll>
            {allFonts().map(({ id, info }) => (
              <Chip
                key={id}
                selected={values.font === id}
                onPress={() => set({ font: id })}
                label={
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: info.rn,
                      color: values.font === id ? C.bg : C.text,
                      fontSize: 15,
                      maxWidth: 140,
                    }}>
                    {info.label}
                  </Text>
                }
              />
            ))}
            <Chip
              onPress={addFont}
              label={<Text style={{ ...T.medium, color: C.accent, fontSize: 14 }}>+ Font</Text>}
            />
          </HScroll>
          <HScroll gap={2}>
            {PALETTE.map((c) => (
              <Swatch key={c} color={c} size={28} selected={accentColor === c} onPress={() => pickColor(c)} />
            ))}
          </HScroll>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: C.bg, zIndex: 10 },
  canvasCard: { borderRadius: R.lg, paddingVertical: 28, paddingHorizontal: 8 },
  header: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
  },
  headerText: { ...T.medium, fontSize: 16 },
  done: { ...T.semibold, color: C.accent },
  inputWrap: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  input: {
    fontSize: 36,
    lineHeight: 44,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: R.md,
    overflow: 'hidden',
  },
});
