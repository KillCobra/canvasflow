import { Host } from '@expo/ui';
import { ColorPicker } from '@expo/ui/swift-ui';
import { View } from 'react-native';

/** System colour picker (the iOS colour well), for colours outside the palette. */
export function ColorWell({ value, onChange }: { value: string | null; onChange: (hex: string) => void }) {
  return (
    <View style={{ width: 42, height: 42, alignItems: 'center', justifyContent: 'center' }}>
      <Host matchContents colorScheme="dark">
        <ColorPicker selection={value} onSelectionChange={(hex) => onChange(normalize(hex))} />
      </Host>
    </View>
  );
}

/** The picker reports #RRGGBBAA; the canvas and palette use #RRGGBB. */
function normalize(hex: string) {
  const h = hex.startsWith('#') ? hex : `#${hex}`;
  return h.length === 9 ? h.slice(0, 7).toUpperCase() : h.toUpperCase();
}
