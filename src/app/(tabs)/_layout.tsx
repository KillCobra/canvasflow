import { Tabs } from 'expo-router/js-tabs';

import { Dock } from '@/components/dock';
import { C } from '@/theme';

/** Home, Projects and You, switched by the floating dock. */
export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <Dock {...props} />}
      // No scene animation: the dock's sliding window is the transition, and the
      // cross-fade could race screen re-attachment and leave a tab invisible.
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: C.bg }, animation: 'none' }}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="projects" options={{ title: 'Projects' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}
