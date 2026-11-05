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

add_subdirectory("${RNOH_CPP_DIR}" ./rn)

add_library(rnoh_app SHARED
    "./PackageProvider.cpp"
    "${RNOH_CPP_DIR}/RNOHAppNapiBridge.cpp"
)
target_link_libraries(rnoh_app PUBLIC rnoh)
