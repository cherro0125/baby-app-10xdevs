// Local Expo config plugin: native iOS fixes that the Expo 56 template lacks.
//
// 1. UIScene lifecycle — iOS 27 terminates apps linked against the iOS 27 SDK
//    that don't adopt UIScene (crash in
//    _UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption).
//    Adds a SceneDelegate to AppDelegate.swift and a scene manifest to Info.plist.
// 2. Pod deployment targets — Xcode 27 rejects pods targeting iOS < 15
//    (GoogleSignIn, AppAuth, GTMSessionFetcher, PromisesObjC resource bundles).
//
// Remove once Expo's template adopts UIScene and the pods raise their targets.
const { withAppDelegate, withInfoPlist, withPodfile } = require('expo/config-plugins');

const MIN_POD_DEPLOYMENT_TARGET = '15.0';

const WINDOW_SETUP = `#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: launchOptions)
#endif
`;

const SCENE_WINDOW_SETUP = `    // iOS 27 requires UIScene lifecycle; window is created in SceneDelegate.
    self.launchOptions = launchOptions
`;

const FACTORY_PROPERTY = `  var reactNativeFactory: RCTReactNativeFactory?
`;

const SCENE_DELEGATE = `class SceneDelegate: UIResponder, UIWindowSceneDelegate {
  var window: UIWindow?

  func scene(
    _ scene: UIScene,
    willConnectTo session: UISceneSession,
    options connectionOptions: UIScene.ConnectionOptions
  ) {
    guard let windowScene = scene as? UIWindowScene,
          let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }

    let window = UIWindow(windowScene: windowScene)
    self.window = window
    appDelegate.window = window
    appDelegate.reactNativeFactory?.startReactNative(
      withModuleName: "main",
      in: window,
      launchOptions: appDelegate.launchOptions)
    window.makeKeyAndVisible()

    if !connectionOptions.urlContexts.isEmpty {
      self.scene(scene, openURLContexts: connectionOptions.urlContexts)
    }
    if let activity = connectionOptions.userActivities.first {
      self.scene(scene, continue: activity)
    }
  }

  // Forward deep links (incl. the Google Sign-In redirect) to AppDelegate subscribers.
  func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    for context in URLContexts {
      var options: [UIApplication.OpenURLOptionsKey: Any] = [:]
      options[.sourceApplication] = context.options.sourceApplication
      options[.annotation] = context.options.annotation
      _ = appDelegate.application(UIApplication.shared, open: context.url, options: options)
    }
  }

  func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
    guard let appDelegate = UIApplication.shared.delegate as? AppDelegate else { return }
    _ = appDelegate.application(UIApplication.shared, continue: userActivity, restorationHandler: { _ in })
  }
}

`;

const PODFILE_ANCHOR = `      :ccache_enabled => ccache_enabled?(podfile_properties),
    )
`;

const PODFILE_HOOK = `    installer.pods_project.targets.each do |t|
      t.build_configurations.each do |c|
        if c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'].to_f < ${MIN_POD_DEPLOYMENT_TARGET}
          c.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '${MIN_POD_DEPLOYMENT_TARGET}'
        end
      end
    end
`;

function replaceOnce(contents, search, replacement, file) {
  if (!contents.includes(search)) {
    throw new Error(`[with-ios27-fixes] Anchor not found in ${file}; the Expo template changed — update the plugin.`);
  }
  return contents.replace(search, replacement);
}

function withSceneDelegate(config) {
  return withAppDelegate(config, (config) => {
    if (config.modResults.language !== 'swift') {
      throw new Error('[with-ios27-fixes] Expected a Swift AppDelegate.');
    }
    let contents = config.modResults.contents;
    if (contents.includes('class SceneDelegate')) return config;

    contents = replaceOnce(contents, WINDOW_SETUP, SCENE_WINDOW_SETUP, 'AppDelegate.swift');
    contents = replaceOnce(
      contents,
      FACTORY_PROPERTY,
      `${FACTORY_PROPERTY}  var launchOptions: [UIApplication.LaunchOptionsKey: Any]?\n`,
      'AppDelegate.swift',
    );
    contents = replaceOnce(
      contents,
      'class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {',
      `${SCENE_DELEGATE}class ReactNativeDelegate: ExpoReactNativeFactoryDelegate {`,
      'AppDelegate.swift',
    );
    config.modResults.contents = contents;
    return config;
  });
}

function withSceneManifest(config) {
  return withInfoPlist(config, (config) => {
    config.modResults.UIApplicationSceneManifest = {
      UIApplicationSupportsMultipleScenes: false,
      UISceneConfigurations: {
        UIWindowSceneSessionRoleApplication: [
          {
            UISceneConfigurationName: 'Default',
            UISceneDelegateClassName: '$(PRODUCT_MODULE_NAME).SceneDelegate',
          },
        ],
      },
    };
    return config;
  });
}

function withPodDeploymentTargets(config) {
  return withPodfile(config, (config) => {
    const contents = config.modResults.contents;
    if (contents.includes(PODFILE_HOOK)) return config;
    config.modResults.contents = replaceOnce(contents, PODFILE_ANCHOR, PODFILE_ANCHOR + PODFILE_HOOK, 'Podfile');
    return config;
  });
}

module.exports = function withIos27Fixes(config) {
  config = withSceneDelegate(config);
  config = withSceneManifest(config);
  config = withPodDeploymentTargets(config);
  return config;
};
