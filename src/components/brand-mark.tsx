import { Canvas, Group, Path, RoundedRect, Skia, rect, rrect } from '@shopify/react-native-skia';
import { useEffect } from 'react';
import { Easing, useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { C } from '@/theme';

/**
 * The Seam mark: three slide-shaped panels with one horizon running across
 * them. The horizon drifts slowly, like a photo sliding through the carousel.
 */
export function BrandMark({ width = 84 }: { width?: number }) {
  // Worklet-driven path; see EditorCanvas for why this opts out of the compiler.
  'use no memo';
  const gap = width * 0.045;
  const pw = (width - gap * 2) / 3;
  const ph = pw * 1.25;
  const r = pw * 0.16;
  const phase = useSharedValue(0);

  useEffect(() => {
    phase.set(withRepeat(withTiming(1, { duration: 5200, easing: Easing.inOut(Easing.sin) }), -1, true));
  }, [phase]);

  const clipBuilder = Skia.PathBuilder.Make();
  for (let i = 0; i < 3; i++) clipBuilder.addRRect(rrect(rect(i * (pw + gap), 0, pw, ph), r, r));
  const clip = clipBuilder.build();

  const horizon = useDerivedValue(() => {
    const t = phase.get();
    const y0 = ph * (0.86 - t * 0.06);
    const y1 = ph * (0.5 + t * 0.08);
    const y2 = ph * (0.26 + t * 0.06);
    return Skia.PathBuilder.Make()
      .moveTo(0, y0)
      .cubicTo(width * 0.33, y0 + ph * 0.02, width * 0.45, y1, width * 0.62, y1 - ph * 0.12)
      .cubicTo(width * 0.78, y2 + ph * 0.04, width * 0.9, y2, width, y2)
      .lineTo(width, ph)
      .lineTo(0, ph)
      .close()
      .build();
  });

  return (
    <Canvas style={{ width, height: ph }}>
      <Group clip={clip}>
        {[0, 1, 2].map((i) => (
          <RoundedRect key={i} x={i * (pw + gap)} y={0} width={pw} height={ph} r={r} color={C.text} />
        ))}
        <Path path={horizon} color={C.accent} />
      </Group>
    </Canvas>
  );
}
