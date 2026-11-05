// Learn more: https://docs.expo.dev/guides/customizing-metro/
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Bundled SQLite asset (assets/poetry.db) opened via expo-sqlite assetSource
config.resolver.assetExts.push('db');
// expo-sqlite web worker (wa-sqlite) imports *.wasm — SDK 57 default list omits it
config.resolver.assetExts.push('wasm');

// 鸿蒙原生构建在 harmony/ 下写临时目录（CMake 的 .cxx scratch 是建了又删的），
// Metro 的 fallback watcher 正好 walk 到一半文件没了 —— 直接 ENOENT 把整个 Metro 打死
// （表现：`just harmony` 装完应用起来是空白，metro.log 末尾是 fs.watch ENOENT）。
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  /[\\/]harmony[\\/]entry[\\/]\.cxx[\\/]/,
  /[\\/]harmony[\\/]entry[\\/]build[\\/]/,
  /[\\/]harmony[\\/]build[\\/]/,
  /[\\/]harmony[\\/]\.hvigor[\\/]/,
];

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

  // —— 平台文件的兵底 ——
  // 不少库只发了 .android / .ios / .web，没有 .harmony 也没有 .native。Metro 在 harmony
  // 平台上只会试 .harmony / .native / 无后缀，**不会**退到 .android，于是直接
  // `Unable to resolve module ./TabsHost`。两处已知的：
  //   • react-native-screens 4.x 的原生 tabs（TabsHost / TabsScreen）
  //   • react-native 自己的 devsupport（ReactDevToolsSettingsManager 只有 .android/.ios）
  // 前者本 App 用不到（expo-router 的底部标签栏是 @react-navigation/bottom-tabs 的 JS 版），
  // 换 .web 版（纯 JS、API 一致）；后者是 __DEV__ 下的调试桩，RN 内部的平台分支都写了
  // Platform.OS 判断，拿 .android 那份不影响运行。
  const resolveRequest = harmony.resolver.resolveRequest;
  const RNS_TABS = /react-native-screens[\\/]src[\\/]components[\\/]tabs[\\/]/;
  config.resolver.resolveRequest = (context, moduleName, platform) => {
    if (platform === 'harmony') {
      if (RNS_TABS.test(context.originModulePath ?? '') && /^\.\/Tabs(Host|Screen)$/.test(moduleName)) {
        return resolveRequest(context, `${moduleName}.web`, platform);
      }
      if (/[\\/]node_modules[\\/]react-native[\\/]/.test(context.originModulePath ?? '')) {
        try {
          return resolveRequest(context, moduleName, platform);
        } catch (e) {
          // 只对 RN 内部的相对路径再试一次 .android 变体
          if (!moduleName.startsWith('.')) throw e;
          return resolveRequest(context, `${moduleName}.android`, platform);
        }
      }
    }
    return resolveRequest(context, moduleName, platform);
  };
}

module.exports = config;
