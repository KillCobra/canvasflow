import { Host } from '@expo/ui';
import { Button, Divider, Menu, RNHostView, Toggle } from '@expo/ui/swift-ui';
import { disabled as disable } from '@expo/ui/swift-ui/modifiers';
import { Fragment } from 'react';
import { View } from 'react-native';

import type { ActionMenuProps, MenuItem } from './action-menu';
import type { IconName } from './ui';

export type { MenuItem } from './action-menu';

const symbol = (icon?: IconName) => (icon == null ? undefined : typeof icon === 'string' ? icon : icon.ios);

function Item({ item }: { item: MenuItem }) {
  const modifiers = item.disabled ? [disable(true)] : undefined;
  if (item.items) {
    return (
      <Menu label={item.label} systemImage={symbol(item.icon)} modifiers={modifiers}>
        {item.items.map((sub) => (
          <Item key={sub.label} item={sub} />
        ))}
      </Menu>
    );
  }
  if (item.toggle) {
    return (
      <Toggle
        isOn={!!item.checked}
        label={item.label}
        systemImage={symbol(item.icon)}
        onIsOnChange={() => item.onPress?.()}
        modifiers={modifiers}
      />
    );
  }
  return (
    <Button
      label={item.label}
      // Choices show a checkmark in place of their icon, like a native picker.
      systemImage={item.checked ? 'checkmark' : symbol(item.icon)}
      role={item.destructive ? 'destructive' : undefined}
      onPress={item.onPress}
      modifiers={modifiers}
    />
  );
}

/** Native SwiftUI menu that opens on tap, with the trigger drawn by React Native. */
export function ActionMenu({ label, items, children, disabled }: ActionMenuProps) {
  if (disabled) {
    return (
      <View accessibilityLabel={label} style={{ opacity: 0.28 }}>
        {children}
      </View>
    );
  }
  return (
    <Host matchContents>
      <Menu
        label={
          <RNHostView matchContents>
            <View accessibilityRole="button" accessibilityLabel={label}>
              {children}
            </View>
          </RNHostView>
        }>
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.separator && <Divider />}
            <Item item={item} />
          </Fragment>
        ))}
      </Menu>
    </Host>
  );
}
