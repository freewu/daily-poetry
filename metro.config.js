// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundled SQLite asset (assets/poetry.db) opened via expo-sqlite assetSource
config.resolver.assetExts.push('db');
// expo-sqlite web worker (wa-sqlite) imports *.wasm — SDK 57 default list omits it
config.resolver.assetExts.push('wasm');

module.exports = config;
