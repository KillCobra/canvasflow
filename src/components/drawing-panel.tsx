import { useEditor } from '@/lib/store';
import type { DrawingLayer, Layer } from '@/lib/types';
import { PALETTE } from '@/theme';

import { BrandColors } from './brand-colors';
import { ColorWell } from './color-well';
import { HScroll, Swatch } from './ui';

/** Layer panel tabs for a drawing (opacity and align are the shared ones). */
export const DRAWING_TABS = ['color', 'align', 'opacity'] as const;

/** Recolours every stroke of a drawing at once. */
export function DrawingColors({ layer }: { layer: DrawingLayer }) {
  const updateLayer = useEditor((s) => s.updateLayer);
  // Strokes drawn in several colours have no single "current" swatch.
  const first = layer.strokes[0]?.color ?? null;
  const current = layer.strokes.every((s) => s.color === first) ? first : null;
  const recolor = (color: string, key?: string) =>
    updateLayer(layer.id, { strokes: layer.strokes.map((s) => ({ ...s, color })) } as Partial<Layer>, key);

  return (
    <HScroll gap={2}>
      <ColorWell value={current} onChange={(c) => recolor(c, 'ink')} />
      <BrandColors current={current} onPick={(c) => recolor(c)} />
      {PALETTE.map((c) => (
        <Swatch key={c} color={c} size={28} selected={current === c} onPress={() => recolor(c)} />
      ))}
    </HScroll>
  );
}
