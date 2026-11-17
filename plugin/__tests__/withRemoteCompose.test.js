/**
 * The Expo config plugin's contract: an Expo app gets exactly what the native side needs —
 * Kotlin >= 2.3, an iOS target >= 15.1, the ProMotion plist key — and nothing the app already
 * set higher is ever lowered.
 */
const {
  applyKotlinVersion,
  applyIosDeploymentTarget,
  applyInfoPlist,
  MIN_KOTLIN,
} = require('../withRemoteCompose');

const kotlin = (props) =>
  props.find((p) => p.type === 'property' && p.key === 'android.kotlinVersion')
    ?.value;

describe('Kotlin version', () => {
  it('is set when the project does not choose one', () => {
    expect(kotlin(applyKotlinVersion([], MIN_KOTLIN))).toBe(MIN_KOTLIN);
  });

  it('is raised from a version that cannot read rc-players', () => {
    const props = [
      { type: 'property', key: 'android.kotlinVersion', value: '2.2.0' },
    ];
    expect(kotlin(applyKotlinVersion(props, MIN_KOTLIN))).toBe(MIN_KOTLIN);
  });

  it('is never lowered', () => {
    const props = [
      { type: 'property', key: 'android.kotlinVersion', value: '2.4.21' },
    ];
    expect(kotlin(applyKotlinVersion(props, MIN_KOTLIN))).toBe('2.4.21');
  });

  it('keeps every other property', () => {
    const props = [
      { type: 'comment', value: 'keep me' },
      { type: 'property', key: 'org.gradle.jvmargs', value: '-Xmx4g' },
    ];
    expect(applyKotlinVersion(props, MIN_KOTLIN)).toEqual(
      expect.arrayContaining(props)
    );
  });
});

describe('iOS deployment target', () => {
  it('raises a configured target below the floor', () => {
    expect(
      applyIosDeploymentTarget({ 'ios.deploymentTarget': '13.4' }, '15.1')
    ).toEqual({
      'ios.deploymentTarget': '15.1',
    });
  });

  it('leaves a higher configured target alone', () => {
    expect(
      applyIosDeploymentTarget({ 'ios.deploymentTarget': '16.4' }, '15.1')
    ).toEqual({
      'ios.deploymentTarget': '16.4',
    });
  });

  it("does not set one when the app relies on Expo's default", () => {
    expect(
      applyIosDeploymentTarget({ 'expo.jsEngine': 'hermes' }, '15.1')
    ).toEqual({
      'expo.jsEngine': 'hermes',
    });
  });
});

it('enables full-rate ProMotion rendering and keeps other plist keys', () => {
  expect(applyInfoPlist({ CFBundleName: 'App' })).toEqual({
    CFBundleName: 'App',
    CADisableMinimumFrameDurationOnPhone: true,
  });
});

it('is a valid Expo config plugin', () => {
  const plugin = require('../../app.plugin');
  const config = plugin({ name: 'app', slug: 'app' });
  expect(config.mods?.ios?.infoPlist).toBeDefined();
  expect(config.mods?.android?.gradleProperties).toBeDefined();
});
