import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

// Version and runtime details for the profile and Settings.

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export const BUILD =
  (Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : String(Constants.expoConfig?.android?.versionCode ?? '')) ||
  '1';

/**
 * Running inside the Expo Go sandbox (as opposed to a development or production
 * build of the app itself). Expo Go only bundles its stock native modules, so
 * Seam's own ones are absent there. Use the execution environment rather than
 * probing a native module, since Seam's native modules are iOS-only and would
 * otherwise make every Android build look like Expo Go.
 */
export const IN_EXPO_GO = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const RUNTIME = `${IN_EXPO_GO ? 'Expo Go' : 'Seam app'}${__DEV__ ? ' · development' : ''}`;

export const SDK = Constants.expoConfig?.sdkVersion ?? '';
