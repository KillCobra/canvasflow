// Adopts the UIScene life cycle on iOS. iOS 27 asserts at launch
// (EXC_BREAKPOINT in _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption)
// for apps built with the iOS 27 SDK that don't, and the SDK 57 template
// still creates its window in the app delegate.
//
// Expo ships the scene delegate (EXExpoAppSceneDelegate); this wires it up:
// - Info.plist: a scene manifest that names it as the window scene delegate.
// - AppDelegate: conforms to ExpoReactNativeFactoryProvider and leaves creating
//   the window and starting React Native to the scene delegate.
const { withAppDelegate, withInfoPlist } = require('expo/config-plugins');

const SCENE_DELEGATE = 'EXExpoAppSceneDelegate';

const WINDOW_SETUP = /\n#if os\(iOS\) \|\| os\(tvOS\)\n\s*window = UIWindow\(frame: UIScreen\.main\.bounds\)\n\s*factory\.startReactNative\([\s\S]*?\)\n#endif\n/;

function withSceneManifest(config) {
  return withInfoPlist(config, (cfg) => {
    cfg.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default Configuration',
            UISceneDelegateClassName: SCENE_DELEGATE,
          },
        ],
      },
    };
    return cfg;
  });
}

function withSceneAppDelegate(config) {
  return withAppDelegate(config, (cfg) => {
    if (cfg.modResults.language !== 'swift') {
      throw new Error('with-scene-lifecycle: expected a Swift AppDelegate.');
    }
    let src = cfg.modResults.contents;
    if (src.includes('ExpoReactNativeFactoryProvider')) return cfg;

    const declaration = 'class AppDelegate: ExpoAppDelegate {';
    if (!src.includes(declaration) || !WINDOW_SETUP.test(src)) {
      throw new Error(
        'with-scene-lifecycle: AppDelegate.swift no longer matches the SDK 57 template; update the plugin.',
      );
    }
    src = src.replace(declaration, 'class AppDelegate: ExpoAppDelegate, ExpoReactNativeFactoryProvider {');
    src = src.replace(
      WINDOW_SETUP,
      '\n    // EXExpoAppSceneDelegate creates the window and starts React Native once the scene connects.\n',
    );
    cfg.modResults.contents = src;
    return cfg;
  });
}

module.exports = (config) => withSceneAppDelegate(withSceneManifest(config));
