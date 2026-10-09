import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { getThumbnailAsync } from 'expo-video-thumbnails';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { assetUri } from '@/lib/projects';
import type { VideoClip } from '@/lib/types';
import { C, R, T } from '@/theme';

import { IconButton } from './ui';

const FRAMES = 8;
const STRIP_H = 46;
const HANDLE = 14;
const MIN_LEN = 0.5;
const MAX_LEN = 60;

// Filmstrip frames per video file, kept for the session.
const strips = new Map<string, Promise<string[]>>();

function filmstrip(uri: string, duration: number) {
  let job = strips.get(uri);
  if (!job) {
    job = Promise.all(
      Array.from({ length: FRAMES }, (_, i) =>
        getThumbnailAsync(uri, { time: Math.round(((i + 0.5) / FRAMES) * duration * 1000), quality: 0.4 })
          .then((t) => t.uri)
          .catch(() => ''),
      ),
    );
    strips.set(uri, job);
  }
  return job;
}

/**
 * Trim a clip on a filmstrip: drag the left handle to set the start, the
 * right one to set the end, or the middle to slide the whole window.
 */
export function VideoTrimmer({
  docId,
  src,
  clip,
  onChange,
}: {
  docId: string;
  src: string;
  clip: VideoClip;
  onChange: (clip: VideoClip) => void;
}) {
  // Gesture worklets; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const uri = assetUri(docId, src);
  const D = Math.max(0.1, clip.duration);
  const [frames, setFrames] = useState<string[]>([]);
  // Live times while a handle is held; otherwise the clip's own values.
  const [dragging, setDragging] = useState<{ start: number; length: number } | null>(null);
  const labels = dragging ?? { start: clip.start, length: clip.length };
  const width = useSharedValue(1);
  const start = useSharedValue(clip.start);
  const end = useSharedValue(Math.min(D, clip.start + clip.length));
  const grab = useSharedValue({ start: 0, end: 0 });

  useEffect(() => {
    let alive = true;
    filmstrip(uri, D).then((f) => alive && setFrames(f));
    return () => {
      alive = false;
    };
  }, [uri, D]);

  // Follow outside changes (undo).
  useEffect(() => {
    start.set(clip.start);
    end.set(Math.min(D, clip.start + clip.length));
  }, [clip.start, clip.length, D, start, end]);

  const tick = () => Haptics.selectionAsync();
  const emit = (s: number, e: number) => {
    setDragging(null);
    onChange({ ...clip, start: s, length: e - s });
  };

  const handle = (side: 'start' | 'end' | 'both') =>
    Gesture.Pan()
      .minDistance(0)
      .onBegin(() => {
        grab.set({ start: start.get(), end: end.get() });
        scheduleOnRN(tick);
      })
      .onUpdate((e) => {
        const dt = (e.translationX / width.get()) * D;
        const g = grab.get();
        if (side === 'start') {
          start.set(Math.max(0, Math.max(g.end - MAX_LEN, Math.min(g.end - MIN_LEN, g.start + dt))));
        } else if (side === 'end') {
          end.set(Math.min(D, Math.min(g.start + MAX_LEN, Math.max(g.start + MIN_LEN, g.end + dt))));
        } else {
          const len = g.end - g.start;
          const s = Math.max(0, Math.min(D - len, g.start + dt));
          start.set(s);
          end.set(s + len);
        }
        scheduleOnRN(setDragging, { start: start.get(), length: end.get() - start.get() });
      })
      .onFinalize(() => {
        scheduleOnRN(emit, start.get(), end.get());
      });

  const window = useAnimatedStyle(() => ({
    left: (start.get() / D) * width.get(),
    width: ((end.get() - start.get()) / D) * width.get(),
  }));
  const leftShade = useAnimatedStyle(() => ({ width: (start.get() / D) * width.get() }));
  const rightShade = useAnimatedStyle(() => ({ width: (1 - end.get() / D) * width.get() }));

  const fmt = (s: number) => `${s.toFixed(1)}s`;

  return (
    <View style={styles.wrap}>
      <View style={{ flex: 1, gap: 6 }}>
        <View
          style={styles.strip}
          onLayout={(e) => {
            width.set(e.nativeEvent.layout.width);
          }}>
          <View style={styles.frames}>
            {Array.from({ length: FRAMES }, (_, i) => (
              <View key={i} style={styles.frame}>
                {frames[i] ? <Image source={{ uri: frames[i] }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
              </View>
            ))}
          </View>
          <Animated.View style={[styles.shade, { left: 0 }, leftShade]} pointerEvents="none" />
          <Animated.View style={[styles.shade, { right: 0 }, rightShade]} pointerEvents="none" />
          <Animated.View style={[styles.window, window]}>
            <GestureDetector gesture={handle('both')}>
              <View style={styles.middle} />
            </GestureDetector>
            <GestureDetector gesture={handle('start')}>
              <View style={[styles.handle, { left: -HANDLE / 2 }]}>
                <View style={styles.grip} />
              </View>
            </GestureDetector>
            <GestureDetector gesture={handle('end')}>
              <View style={[styles.handle, { right: -HANDLE / 2 }]}>
                <View style={styles.grip} />
              </View>
            </GestureDetector>
          </Animated.View>
        </View>
        <View style={styles.times}>
          <Text style={styles.time}>Start {fmt(labels.start)}</Text>
          <Text style={[styles.time, { color: C.text }]}>{fmt(labels.length)}</Text>
          <Text style={styles.time}>of {fmt(D)}</Text>
        </View>
      </View>
      <IconButton
        label={clip.muted ? 'Unmute' : 'Mute'}
        tone={clip.muted ? 'filled' : 'accent'}
        icon={clip.muted ? { ios: 'speaker.slash.fill', android: 'volume_off' } : { ios: 'speaker.wave.2.fill', android: 'volume_up' }}
        onPress={() => onChange({ ...clip, muted: !clip.muted })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 22, paddingRight: 10 },
  strip: { height: STRIP_H, borderRadius: R.sm, backgroundColor: C.surfaceHi },
  frames: { ...StyleSheet.absoluteFill, flexDirection: 'row', borderRadius: R.sm, overflow: 'hidden' },
  frame: { flex: 1, backgroundColor: C.surface, borderRightWidth: StyleSheet.hairlineWidth, borderColor: C.bg },
  shade: { position: 'absolute', top: 0, bottom: 0, backgroundColor: '#000000A6' },
  window: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    borderWidth: 2.5,
    borderColor: C.accent,
    borderRadius: 8,
  },
  middle: { flex: 1 },
  handle: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    width: HANDLE,
    borderRadius: 5,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grip: { width: 2, height: 16, borderRadius: 1, backgroundColor: C.accentInk },
  times: { flexDirection: 'row', justifyContent: 'space-between' },
  time: { ...T.medium, color: C.textDim, fontSize: 11, fontVariant: ['tabular-nums'] },
});
