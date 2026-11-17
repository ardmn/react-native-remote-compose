const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');
const { withMetroConfig } = require('react-native-monorepo-config');

const root = path.resolve(__dirname, '..');

/** @type {import('expo/metro-config').MetroConfig} */
const config = withMetroConfig(getDefaultConfig(__dirname), {
  root,
  dirname: __dirname,
  conditions: ['react-native-remote-compose-source'],
});

// Remote Compose documents are bundled as assets: `require('./screen.rc')`.
config.resolver.assetExts = [...config.resolver.assetExts, 'rc'];

module.exports = config;
