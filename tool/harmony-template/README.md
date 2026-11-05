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
- 鸿蒙化三方库：`@react-native-oh-tpl/*` 的版本普遍落后于本工程的
  `reanimated 4.x / screens 4.x / gesture-handler 2.x`，尤其 **`expo-sqlite` 没有鸿蒙版**
  （本 App 的诗词库全靠它）。要在鸿蒙上跑通完整功能，得先解决 `expo-sqlite` 的替代实现。
