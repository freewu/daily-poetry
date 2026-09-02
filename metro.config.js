// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundled SQLite asset (assets/poetry.db) opened via expo-sqlite assetSource
config.resolver.assetExts.push('db');

module.exports = config;
