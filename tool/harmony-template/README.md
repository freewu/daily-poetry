# 鸿蒙壳工程模板（RNOH）

`harmony/` 是**生成物**（`.gitignore` 里），由 `just harmony-setup` 用
`tool/harmony-render.mjs` 把本目录渲染出来：`__XXX__` 占位符替换成 app.json / 本机 SDK
的实际值，图标从 `assets/images/icon.png` 拷进去。

```bash
just harmony-doctor   # 先看 DevEco / SDK / hdc / ohpm / hvigor 齐不齐
just harmony-setup    # 生成 harmony/ + 装 RNOH 依赖（npm 侧 + ohpm 侧）
just harmony          # 编译 Debug HAP → 装设备 → 起 Metro
just hap              # Release HAP → dist/
```

## 占位符

| 占位符 | 来源 |
| --- | --- |
| `__BUNDLE_NAME__` | `app.json` 的 `android.package`（没有就用 `com.example.<slug>`） |
| `__APP_LABEL__` | `app.json` 的 `name`（每日诗词） |
| `__APP_KEY__` | 固定 `main`（expo-router 注册的组件名） |
| `__VERSION_NAME__` / `__VERSION_CODE__` | `app.json` 的 `version` / `android.versionCode` |
| `__RNOH_VERSION__` | 跟 RN 大版本对齐的 `@react-native-oh/react-native-harmony` 版本 |
| `__COMPATIBLE_SDK__` | 本机 DevEco 装的 SDK，如 `5.0.0(12)` / `6.0.0(20)` |
| `__HVIGOR_MODEL_VERSION__` | 同上取大版本，如 `5.0.0` / `6.0.0` |

已存在的文件**不会被覆盖**（`--force` 才重来），所以在 DevEco 里配好的签名、
改过的 `module.json5` 不会被 `just harmony-setup` 冲掉。

## 接入面（升级 RNOH 时要动的地方）

- `entry/src/main/ets/pages/Index.ets` —— `RNApp` 的 `rnInstanceConfig` / bundle 来源
  （Metro → 沙箱文件 → rawfile，三级 fallback）。
- `entry/src/main/ets/RNPackagesFactory.ets` —— 三方 TurboModule / Fabric 组件注册（现在空）。
- `entry/src/main/cpp/PackageProvider.cpp` + `CMakeLists.txt` —— 三方库的 C++ 包（现在空）。
- `entry/src/main/module.json5` —— 权限（`INTERNET` 必须有，否则调试白屏）、Ability 声明。
- `entry/oh-package.json5` —— `@rnoh/react-native-openharmony` 的版本，**必须**跟 npm 侧
  `react-native-harmony` 完全一致（har 里的 ArkTS/C++ 与 JS 侧是一对）。

## 没做的部分

- 签名：`build-profile.json5` 故意留空 `signingConfigs`，出的是 unsigned HAP（模拟器可装）。
  真机请在 DevEco 里勾自动签名（需登录华为账号），DevEco 会自己把配置写进这个文件。
- **Expo 模块没有鸿蒙实现（真正的墙）**：`expo-modules-core` 的**原生**侧负责在启动时把
  `globalThis.expo`（`EventEmitter` / `NativeModule` / `SharedObject` / `modules` …）装进 JS 运行时，
  鸿蒙上没有这份原生实现，于是模块求值的第一步就炸：

  ```
  W RNOH_CPP: TurboModuleFactory.cpp:257> Turbo Module 'ExpoModulesCore' not found.
  E RNOH_JS:  [TypeError: Cannot read property 'EventEmitter' of undefined]
  ```

  出错点是 `node_modules/expo-modules-core/src/EventEmitter.ts:22`
  （`export const EventEmitter = globalThis.expo.EventEmitter`）。把 dev bundle 拉下来数过：
  `globalThis.expo.*` 一共被读 **21 次、赋值 0 次** —— 没有任何 JS 会去建它。

  连带 `expo-sqlite`（60MB 诗词库全靠它）/ `expo-image` / `expo-font` / `expo-media-library`
  / `expo-sharing` / `expo-speech` / `expo-splash-screen` / `expo-router` 全部落空。

  **社区有现成端口**：`@expo-harmony/*`（<https://github.com/renbaoshuo/expo-harmony>，140★，
  2026-10 还在更新），上面这些模块 + `metro-config` / `prebuild-config` / `config-plugins` /
  `cli` / `template` 全都有。但它只到 **Expo SDK 55**（`55.0.31-harmony.3`），peer 钉死：

  | 包 | 端口要求 | 本工程 |
  | --- | --- | --- |
  | `expo` | `55.0.31` | `~57.0.19` |
  | `expo-modules-core` | `55.0.26` | `~57.x` |
  | `@react-native-oh/react-native-harmony` | `0.84.1` | `0.86.1` |
  | `@react-native-ohos/react-native-reanimated` | `4.0.2` | `reanimated 4.5.1` |
  | `@react-native-ohos/react-native-gesture-handler` | `2.30.2` | `2.32.0` |
  | `@react-native-ohos/react-native-worklets` | `1.0.1` | — |

  所以要在鸿蒙上真跑，得二选一：**整个工程降到 SDK 55 / RN 0.84 / RNOH 0.84.1**（Android / iOS
  也要跟着回归），或者把 `@expo-harmony` 往 56/57 迁（上游没做）。光靠 patch Metro 配置、
  写 `globalThis.expo` 桩是走不远的 —— 桩只挪得动报错的位置，`expo-sqlite` 仍然没有实现。
- 鸿蒙化三方库：`@react-native-oh-tpl/*` 的版本普遍落后于本工程的
  `reanimated 4.x / screens 4.x / gesture-handler 2.x`；`react-native-screens` 4.x 的
  native-tabs 只发了 `.android/.ios`（`./TabsHost` / `./TabsScreen` 解析不到），
  `metro.config.js` 里暂时回退到它的 `.web` 版（expo-router 的底部 tab 走 JS 实现，够用）。

## 构建期的几个坑（都已在模板 / 脚本里绕过）

- **模板里的 `.json` 必须是严格 JSON**：restool 不认 JSON5（尾逗号 / `//` 注释都会报
  `Error Code 11203002`，且不说是哪个文件）。`harmony-render.mjs` 现在会在写盘前 `JSON.parse`
  一遍，坏了直接指出是哪个模板。
- **`abiFilters` 必须带上 `x86_64`**：DevEco 的模拟器是 x86_64 镜像，只编 `arm64-v8a` 时装上去
  秒退，hilog 只有一句 `F RNOH_ARK: Couldn't create bindings between ETS and CPP.
  libRNOHApp is undefined.`（HAP 里没有这个 ABI 的 `.so`，`libRNOHApp` 加载不到）。
- **多 ABI 时 ffrt 找不到**：hvigor 只给**第一个** ABI 生成 `summary.cmake`（里面就一句
  `find_package(ffrt)`），第二个 ABI 的 configure 会报
  `Target "reactnative" links to: ffrt::ffrt_cpp but the target was not found.`。
  `entry/src/main/cpp/CMakeLists.txt` 里按 `CMAKE_FIND_ROOT_PATH` 自己找一次。
- **RNOH 0.86.1 用了 API 26 的符号**：`WebSocketTurboModule.ts` 里
  `deviceInfo.sdkApiVersion >= 26` 那一支引用了 `webSocket.WebSocketOpenInfo` / `'openInfo'`，
  API 21 的 SDK 里没有，ArkTS 连走不到的分支也要类型检查 → 编译失败。`just harmony` 的
  `patch_rnoh_sdk_compat()` 会把那一支删掉（幂等，`ohpm install` 后重打）。
- **Metro 不能被原生构建目录搞死**：CMake 在 `harmony/entry/.cxx/**` 里反复建 / 删
  `CMakeScratch` 目录，`metro-file-map` 的 fallback watcher 撞上 ENOENT 直接退出（表现是
  装上去白屏）。`metro.config.js` 把 `harmony/**` 的构建产物加进了 `resolver.blockList`。
- **`bundle-harmony --dev true` 走不通**：它把 `sourceMap` / `sourceMapUrl` 传成同一个文件，
  metro-source-map 断言 `Unexpected module with full source map found` 直接抛。Debug 不要用它，
  直接起 Metro（`just harmony-start` / `just harmony`）即可；Release 的 `--dev false` 正常。
- **别用 `npx` 起 RN CLI**：本机 WSL 里 `npx` 会把 `RNOH_METRO=1` 丢掉（metro.config.js
  读到 `undefined`，鸿蒙解析规则整段不生效）。脚本里用 `node_modules/.bin/react-native`。
- **`'vp2px' has been deprecated` 是 RNOH 自己的代码，可以不管**：编译期只有四处，全在 har 里
  （`RNViewBase.ets:113-115` 的 transform 矩阵 + `RNSurface.ets:285` 的 `pixelRatio: vp2px(1)`），
  本工程自己的 `.ets` 一个都没用。`vp2px` 从 API 18 起标弃用，替代品是 `UIContext.vp2px()`
  （要组件上下文）或 `display.getDefaultDisplaySync().densityPixels`；但这是第三方代码、
  而且现在 App 根本渲染不了（见上条），改完无法验证 —— **别去打这个补丁**，等上游 RNOH 自己换。
