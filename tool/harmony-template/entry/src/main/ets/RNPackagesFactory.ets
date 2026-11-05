import { RNPackage, RNPackageContext } from '@rnoh/react-native-openharmony/ts';

// 三方原生模块（TurboModule / Fabric Component）的注册点。
//
// 目前每日诗词在鸿蒙侧只用到 RN 核心能力（View / Text / ScrollView / Image / Animated…），
// 没有需要手动 link 的鸿蒙化三方库，所以返回空数组。
//
// 以后接 `@react-native-oh-tpl/*`（react-native-screens、reanimated 之类）时：
//   1. ohpm i 那个库；2. 这里 push 它的 package，例如
//      `new RNScreensPackage(ctx)`；3. 若库里还有 C++ 包，还要在
//      entry/src/main/cpp/CMakeLists.txt 里 add_subdirectory + target_link_libraries。
export function createRNPackages(_ctx: RNPackageContext): RNPackage[] {
  return [];
}
