project(rnapp)
cmake_minimum_required(VERSION 3.5)
set(CMAKE_SKIP_BUILD_RPATH TRUE)
set(RNOH_APP_DIR "${CMAKE_CURRENT_SOURCE_DIR}")

# ohpm install 把 har 解到 entry/oh_modules（cpp 在 entry/src/main/cpp，所以要退三级）
set(OH_MODULE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../../oh_modules")
set(RNOH_CPP_DIR "${OH_MODULE_DIR}/@rnoh/react-native-openharmony/src/main/cpp")

set(LOG_VERBOSITY_LEVEL 1)
set(WITH_HITRACE_SYSTRACE 1) # 让 har 里的 CMakeLists 也认这个开关
add_compile_definitions(WITH_HITRACE_SYSTRACE)
set(CMAKE_CXX_FLAGS "-fstack-protector-strong -Wl,-z,relro,-z,now,-z,noexecstack -s -fPIE -pie")

# 多 ABI（arm64-v8a + x86_64）时 hvigor 只给第一个 ABI 生成 summary.cmake（里面就一句
# find_package(ffrt)），第二个 ABI 于是找不到 ffrt::ffrt_cpp，configure 直接报
#   Target "reactnative" links to: ffrt::ffrt_cpp but the target was not found.
# 这里自己按 hvigor 传进来的 CMAKE_FIND_ROOT_PATH 找一次（目录名随架构变）。
if(NOT TARGET ffrt::ffrt_cpp)
  if(OHOS_ARCH STREQUAL "x86_64")
    set(_ffrt_triple "x86_64-linux-ohos")
  else()
    set(_ffrt_triple "aarch64-linux-ohos")
  endif()
  foreach(_root ${CMAKE_FIND_ROOT_PATH})
    if(EXISTS "${_root}/lib/${_ffrt_triple}/cmake/ffrt/ffrtConfig.cmake")
      set(ffrt_DIR "${_root}/lib/${_ffrt_triple}/cmake/ffrt")
      find_package(ffrt REQUIRED CONFIG)
      break()
    endif()
  endforeach()
endif()

add_subdirectory("${RNOH_CPP_DIR}" ./rn)

add_library(rnoh_app SHARED
    "./PackageProvider.cpp"
    "${RNOH_CPP_DIR}/RNOHAppNapiBridge.cpp"
)
target_link_libraries(rnoh_app PUBLIC rnoh)
