// @ts-check
const {
  createRunOncePlugin,
  withGradleProperties,
  withInfoPlist,
  withPodfileProperties,
} = require('expo/config-plugins');

const pkg = require('../package.json');

/**
 * Lowest versions the native side needs:
 * - Kotlin 2.3: rc-players is compiled with Kotlin 2.4, which a 2.2 compiler cannot read.
 * - iOS 15.1: the rc-players Swift overlay and XCFramework floor used by the podspec.
 */
const MIN_KOTLIN = '2.3.21';
const MIN_IOS = '15.1';

/** @param {string | undefined} a @param {string} b */
function isLower(a, b) {
  if (!a) return true;
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

/**
 * @typedef {{ kotlinVersion?: string; iosDeploymentTarget?: string }} Options
 * @type {import('expo/config-plugins').ConfigPlugin<Options | void>}
 */
const withRemoteCompose = (config, options) => {
  const kotlinVersion = options?.kotlinVersion ?? MIN_KOTLIN;
  const iosTarget = options?.iosDeploymentTarget ?? MIN_IOS;

  // iOS: let Compose drive ProMotion displays at full rate (the player warns without it).
  config = withInfoPlist(config, (c) => {
    c.modResults.CADisableMinimumFrameDurationOnPhone = true;
    return c;
  });

  // Raise an explicitly configured target that is too low. When none is set, Expo's template
  // default (16.4 in SDK 58) applies, which is already above the floor: never lower it.
  config = withPodfileProperties(config, (c) => {
    const current = c.modResults['ios.deploymentTarget'];
    if (typeof current === 'string' && isLower(current, iosTarget)) {
      c.modResults['ios.deploymentTarget'] = iosTarget;
    }
    return c;
  });

  // Android: without `android.kotlinVersion` Expo falls back to React Native's Kotlin (2.2),
  // which cannot read rc-players' metadata, so set it when absent and raise it when too old.
  config = withGradleProperties(config, (c) => {
    const entry = c.modResults.find(
      (item) => item.type === 'property' && item.key === 'android.kotlinVersion'
    );
    if (entry && entry.type === 'property') {
      if (isLower(entry.value, kotlinVersion)) entry.value = kotlinVersion;
    } else {
      c.modResults.push({
        type: 'property',
        key: 'android.kotlinVersion',
        value: kotlinVersion,
      });
    }
    return c;
  });

  return config;
};

module.exports = createRunOncePlugin(withRemoteCompose, pkg.name, pkg.version);
module.exports.isLower = isLower;
