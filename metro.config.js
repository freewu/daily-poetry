// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundled SQLite asset (assets/poetry.db) opened via expo-sqlite assetSource
config.resolver.assetExts.push('db');
// expo-sqlite web worker (wa-sqlite) imports *.wasm — SDK 57 default list omits it
config.resolver.assetExts.push('wasm');

// 鸿蒙（RNOH）：只有 `just harmony*` / `just hap` 会带 RNOH_METRO=1 起 Metro，
// 别的平台（just start / expo export / Android / iOS / Web）完全不受影响。
//
// 之所以写在这里而不是单独一个 metro.config.harmony.js：`npx react-native start`
// 只认项目根目录的 metro.config.js，没有传 Metro 配置的入口，只能靠环境变量切。
//
// RNOH 的解析规则做三件事：harmony 平台下 require('react-native') 改指
// react-native-harmony（鸿蒙侧的 RN 实现）、assetRegistryPath 换成 harmony 版、
// 把装了鸿蒙移植包的库（package.json 里带 harmony.alias 的）自动重定向过去。
if (process.env.RNOH_METRO === '1') {
  const { createHarmonyMetroConfig } = require('react-native-harmony/metro.config');
  const harmony = createHarmonyMetroConfig({
    // package.json 里是 `"react-native-harmony": "npm:@react-native-oh/react-native-harmony@x.y.z"`，
    // 模块名就是这个 alias（just harmony-setup 用 --no-save 装，不进锁文件）。
    reactNativeHarmonyPackageName: 'react-native-harmony',
  });

  config.resolver.resolveRequest = harmony.resolver.resolveRequest;
  config.transformer.assetRegistryPath = harmony.transformer.assetRegistryPath;
  config.serializer = { ...config.serializer, ...harmony.serializer };
  config.resolver.platforms = [...(config.resolver.platforms ?? ['ios', 'android']), 'harmony'];
}

module.exports = config;
