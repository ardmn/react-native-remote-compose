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
 * - Kotlin 2.3: rc-players is compiled with Kotlin 2.4; a 2.2 compiler cannot read its metadata
 *   ("can read versions up to 2.3.0"), and React Native's default is 2.2.
 * - iOS 15.1: the podspec's floor.
 */
const MIN_KOTLIN = '2.3.21';
const MIN_IOS = '15.1';

/** Numeric dotted-version comparison; a missing version counts as lower than anything. */
function isLower(/** @type {string | undefined} */ a, /** @type {string} */ b) {
  if (!a) return true;
  const pa = a.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  const pb = b.split(/[.-]/).map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) < (pb[i] ?? 0);
  }
  return false;
}

/**
 * @typedef {{ type: 'property', key: string, value: string } | { type: 'comment', value: string } | { type: 'empty' }} GradleProperty
 */

/**
 * Sets `android.kotlinVersion` when absent (Expo then falls back to React Native's Kotlin 2.2)
 * and raises it when lower than `min`; a newer version is left alone.
 * @param {GradleProperty[]} properties
 * @param {string} min
 * @returns {GradleProperty[]}
 */
function applyKotlinVersion(properties, min) {
  const index = properties.findIndex(
    (p) => p.type === 'property' && p.key === 'android.kotlinVersion'
  );
  if (index === -1)
    return [
      ...properties,
      { type: 'property', key: 'android.kotlinVersion', value: min },
    ];
  const entry = properties[index];
  if (entry && entry.type === 'property' && isLower(entry.value, min)) {
    const next = [...properties];
    next[index] = { ...entry, value: min };
    return next;
  }
  return properties;
}

/**
 * Raises an explicitly configured iOS deployment target that is below `min`. When none is set,
 * Expo's template default (16.4 in SDK 58) applies, which is above the floor: never lower it.
 * @param {Record<string, unknown>} podfileProperties
 * @param {string} min
 */
function applyIosDeploymentTarget(podfileProperties, min) {
  const current = podfileProperties['ios.deploymentTarget'];
  if (typeof current === 'string' && isLower(current, min)) {
    return { ...podfileProperties, 'ios.deploymentTarget': min };
  }
  return podfileProperties;
}

/** Lets Compose drive ProMotion displays at full rate; the player warns without it. */
function applyInfoPlist(/** @type {Record<string, unknown>} */ plist) {
  return { ...plist, CADisableMinimumFrameDurationOnPhone: true };
}

/**
 * @typedef {{ kotlinVersion?: string; iosDeploymentTarget?: string }} Options
 * @type {import('expo/config-plugins').ConfigPlugin<Options | void>}
 */
const withRemoteCompose = (config, options) => {
  const kotlinVersion = options?.kotlinVersion ?? MIN_KOTLIN;
  const iosTarget = options?.iosDeploymentTarget ?? MIN_IOS;

  config = withInfoPlist(config, (c) => {
    c.modResults = /** @type {any} */ (applyInfoPlist(c.modResults));
    return c;
  });
  config = withPodfileProperties(config, (c) => {
    c.modResults = /** @type {any} */ (
      applyIosDeploymentTarget(c.modResults, iosTarget)
    );
    return c;
  });
  config = withGradleProperties(config, (c) => {
    c.modResults = /** @type {any} */ (
      applyKotlinVersion(c.modResults, kotlinVersion)
    );
    return c;
  });
  return config;
};

module.exports = createRunOncePlugin(withRemoteCompose, pkg.name, pkg.version);
module.exports.applyKotlinVersion = applyKotlinVersion;
module.exports.applyIosDeploymentTarget = applyIosDeploymentTarget;
module.exports.applyInfoPlist = applyInfoPlist;
module.exports.MIN_KOTLIN = MIN_KOTLIN;
