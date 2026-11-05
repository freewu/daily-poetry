#include "RNOH/PackageProvider.h"

using namespace rnoh;

// C++ 侧的三方包注册点。鸿蒙化三方库如果带 native 代码，要在这里 push 它的 Package，
// 并在 CMakeLists.txt 里 add_subdirectory + target_link_libraries。
// 目前只跑 RN 核心，所以返回空。
std::vector<std::shared_ptr<Package>> PackageProvider::getPackages(
    Package::Context ctx) {
  return {};
}
