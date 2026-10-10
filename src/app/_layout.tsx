import { useFonts as useCanvasFonts } from '@shopify/react-native-skia';
import { useFonts } from 'expo-font';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { configureReanimatedLogger } from 'react-native-reanimated';

import { CANVAS_FONT_FILES, UI_FONT_FILES, loadCustomFonts, setCanvasFonts } from '@/lib/fonts';
import { refreshRemoteTemplates } from '@/lib/templates';
import { C } from '@/theme';

SplashScreen.preventAutoHideAsync();

// Skia reads animated props during render on purpose, which strict mode flags.
configureReanimatedLogger({ strict: false });

const theme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: C.bg, card: C.bg, primary: C.accent },
};

export default function RootLayout() {
  const [uiReady] = useFonts(UI_FONT_FILES);
  const canvasFonts = useCanvasFonts(CANVAS_FONT_FILES);
  // Hold the splash until both the UI fonts and the canvas fonts are in, so
  // nothing renders (or measures text) with a fallback face.
  const ready = uiReady && canvasFonts != null;
  if (canvasFonts) setCanvasFonts(canvasFonts);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync();
  }, [ready]);
  // Fonts imported from Files register into the same provider once it exists.
  useEffect(() => {
    if (canvasFonts) loadCustomFonts();
  }, [canvasFonts]);
  useEffect(() => {
    if (ready) refreshRemoteTemplates();
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: C.bg }}>
      <ThemeProvider value={theme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: C.bg } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="editor/[id]" options={{ gestureEnabled: false }} />
          <Stack.Screen name="preview" options={{ presentation: 'modal' }} />
          <Stack.Screen name="templates" options={{ presentation: 'modal' }} />
          <Stack.Screen name="template/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="import" options={{ presentation: 'modal' }} />
          <Stack.Screen name="brand-kit" />
          <Stack.Screen name="whats-new" />
          <Stack.Screen name="settings" />
          <Stack.Screen name="acknowledgements/index" />
          <Stack.Screen name="acknowledgements/software" />
          <Stack.Screen name="acknowledgements/licence" />
          <Stack.Screen name="onboarding" options={{ presentation: 'fullScreenModal', gestureEnabled: false }} />
        </Stack>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}
