import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isVideoExportAvailable } from '../../modules/seam-video-export';

// Version and runtime details for the profile and Settings.

export const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

export const BUILD =
  (Platform.OS === 'ios' ? Constants.expoConfig?.ios?.buildNumber : String(Constants.expoConfig?.android?.versionCode ?? '')) ||
  '1';

/** The native modules only exist in the Seam app build, not in Expo Go. */
export const IN_EXPO_GO = !isVideoExportAvailable();

export const RUNTIME = `${IN_EXPO_GO ? 'Expo Go' : 'Seam app'}${__DEV__ ? ' · development' : ''}`;

export const SDK = Constants.expoConfig?.sdkVersion ?? '';
