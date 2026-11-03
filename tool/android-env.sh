#!/bin/sh
# 探测 Android 工具链，供 justfile / tool/android.sh / Maestro 使用。
#
#   . tool/android-env.sh          # 在本 shell 里导出下面这些变量
#   sh tool/android-env.sh doctor  # 人读自检，缺什么就说怎么补
#
# 导出：
#   ANDROID_HOME / ANDROID_SDK_ROOT  SDK 根目录（WSL 里是 /mnt/c/... 形式）
#   ADB                              可用的 adb 命令（WSL 里是 Linux 客户端）
#   ADB_SERVER_SOCKET                WSL 里复用 Windows 侧 adb server 的地址
#   EMULATOR                         模拟器可执行文件（WSL 里是 Windows 的 emulator.exe）
#   AVD                              默认 AVD 名字（可在 justfile 里覆盖）
#
# 为什么 WSL 里要用 Linux 版 adb：设备是 Windows 模拟器，但 `adb install`
# 要把本地文件推给设备，Windows 的 adb.exe 读不了 /mnt/e/... 这类路径。
# Linux 客户端 + `ADB_SERVER_SOCKET` 连 Windows 的 adb server 就没这个问题，
# 前提是 WSL 的 localhost 与 Windows 打通（WSL 2 镜像网络模式下默认如此）。

on_windows() {
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) return 0 ;;
    *) return 1 ;;
  esac
}

on_wsl() {
  grep -qi microsoft /proc/version 2>/dev/null
}

# WSL 里要把 /mnt/c/... 换成 C:\... 才交给 Windows 程序
to_windows_path() {
  if command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$1"
  else
    printf '%s' "$1"
  fi
}

# ---------------------------------------------------------------- SDK
detect_sdk() {
  for dir in "${ANDROID_HOME:-}" "${ANDROID_SDK_ROOT:-}"; do
    [ -n "$dir" ] && [ -d "$dir" ] && { printf '%s' "$dir"; return 0; }
  done
  for dir in \
    "$HOME/Android/Sdk" \
    "$HOME/Library/Android/sdk" \
    /mnt/c/Users/*/AppData/Local/Android/Sdk; do
    [ -d "$dir" ] && { printf '%s' "$dir"; return 0; }
  done
  return 1
}

# ---------------------------------------------------------------- adb
# 只认「能在本机运行的」adb：Windows 的 adb.exe 在 WSL 里跑得起来，但装包会
# 因为路径不通而失败，所以 WSL 下优先找 Linux 客户端（见文件头说明）。
detect_adb() {
  for bin in "${ADB:-}" \
    "$HOME/.local/share/android-platform-tools/platform-tools/adb" \
    /usr/bin/adb /usr/local/bin/adb; do
    [ -n "$bin" ] && [ -x "$bin" ] && { printf '%s' "$bin"; return 0; }
  done
  command -v adb >/dev/null 2>&1 && { command -v adb; return 0; }
  if ! on_wsl; then
    for bin in "${ANDROID_HOME:-}/platform-tools/adb" "${ANDROID_SDK_ROOT:-}/platform-tools/adb"; do
      [ -n "$bin" ] && [ -x "$bin" ] && { printf '%s' "$bin"; return 0; }
    done
  fi
  return 1
}

# Windows 侧的 adb server 是否在监听（WSL 镜像网络下 127.0.0.1 是共享的）
windows_adb_server() {
  on_wsl || return 1
  for bin in /mnt/c/Users/*/AppData/Local/Android/Sdk/platform-tools/adb.exe; do
    [ -x "$bin" ] || continue
    "$bin" devices >/dev/null 2>&1 && { printf 'tcp:127.0.0.1:5037'; return 0; }
  done
  return 1
}

# ---------------------------------------------------------------- emulator
detect_emulator() {
  if on_wsl; then
    for bin in /mnt/c/Users/*/AppData/Local/Android/Sdk/emulator/emulator.exe; do
      [ -f "$bin" ] && { printf '%s' "$bin"; return 0; }
    done
  fi
  for bin in "${ANDROID_HOME:-}/emulator/emulator" "${ANDROID_SDK_ROOT:-}/emulator/emulator"; do
    [ -x "$bin" ] && { printf '%s' "$bin"; return 0; }
  done
  command -v emulator >/dev/null 2>&1 && { command -v emulator; return 0; }
  return 1
}

detect_avd() {
  [ -n "${AVD:-}" ] && { printf '%s' "$AVD"; return 0; }
  emu="${EMULATOR:-}"
  [ -n "$emu" ] || emu="$(detect_emulator)" || return 1
  avds="$(env -u ANDROID_HOME "$emu" -list-avds 2>/dev/null)"
  [ -n "$avds" ] || avds="$("$emu" -list-avds 2>/dev/null)"
  printf '%s' "$avds" | awk 'NF { print; exit }'
}

command -v wslpath >/dev/null 2>&1 || true

ANDROID_HOME="$(detect_sdk)" || ANDROID_HOME=""
[ -n "$ANDROID_HOME" ] && export ANDROID_HOME
[ -n "$ANDROID_HOME" ] && export ANDROID_SDK_ROOT="$ANDROID_HOME"

ADB="$(detect_adb)" || ADB=""
[ -n "$ADB" ] && export ADB
if on_wsl; then
  sock="$(windows_adb_server)" || sock=""
  [ -n "$sock" ] && { ADB_SERVER_SOCKET="$sock"; export ADB_SERVER_SOCKET; }
fi

EMULATOR="$(detect_emulator)" || EMULATOR=""
[ -n "$EMULATOR" ] && export EMULATOR
AVD="$(detect_avd)" || AVD=""
[ -n "$AVD" ] && export AVD

# ------------------------------------------------- Windows 侧辅助（构建前置检查）
# Gradle / NDK 实际跑在 Windows 上，所以 JDK 与 ccache 都要看 Windows 那一侧。
win_userprofile() {
  if on_wsl; then
    p="$(cmd.exe /c "echo %USERPROFILE%" 2>/dev/null | tr -d '\r')"
    [ -n "$p" ] || return 1
    wslpath -u "$p" 2>/dev/null || return 1
  elif on_windows; then
    printf '%s' "${USERPROFILE:-$HOME}"
  else
    return 1
  fi
}

# Windows 侧 PATH 上的某个可执行文件（WSL 下借 cmd 的 where）
win_which() {
  if on_wsl; then
    cmd.exe /c "where $1" 2>/dev/null | tr -d '\r' | head -1
  else
    command -v "$1" 2>/dev/null
  fi
}

if [ "${1:-}" = "doctor" ]; then
  ok() { printf '  ✓ %s\n' "$*"; }
  bad() { printf '  ✗ %s\n' "$*"; }
  hint() { printf '     %s\n' "$*"; }
  echo "环境：$(uname -s) $(uname -r)$(on_wsl && echo ' (WSL)')"
  [ -n "$ANDROID_HOME" ] && ok "ANDROID_HOME=$ANDROID_HOME" \
    || bad "没找到 Android SDK（设置 ANDROID_HOME，或装 Android Studio）"
  [ -n "$ADB" ] && ok "adb=$ADB" || bad "没找到 adb（见 just android-setup）"
  [ -n "${ADB_SERVER_SOCKET:-}" ] && ok "复用 Windows adb server：$ADB_SERVER_SOCKET"
  [ -n "$EMULATOR" ] && ok "emulator=$EMULATOR" || bad "没找到 emulator"
  [ -n "$AVD" ] && ok "默认 AVD=$AVD" || bad "没有可用 AVD（avdmanager create avd 建一个）"

  # ---- Gradle / JDK 17
  # RN 的 gradle-plugin 用 jvmToolchain(17)，而 Gradle 不会自动扫 IDEA 的 jdks/，
  # 找不到就去 GitHub 自动下载 JDK —— 国内网络基本卡死在 0 字节的 .part 上。
  up="$(win_userprofile)" || up=""
  props="$up/.gradle/gradle.properties"
  jdk17=""
  if ! on_wsl && [ -n "${JAVA_HOME:-}" ]; then
    case "$("$JAVA_HOME/bin/java" -version 2>&1 | head -1)" in
      *'"17.'*) jdk17="$JAVA_HOME" ;;
    esac
  fi
  if [ -z "$jdk17" ] && [ -n "$up" ] && [ -f "$props" ] &&
    grep -qi 'org\.gradle\.java\.installations\.paths.*jdk-17' "$props"; then
    jdk17="$props"
  fi
  if [ -n "$jdk17" ]; then
    ok "Gradle 能解析到 JDK 17（满足 RN gradle-plugin 的 toolchain）"
  else
    bad "Gradle 找不到 JDK 17：会去 GitHub 自动下载，常常卡死 / 失败"
    found=""
    [ -n "$up" ] && found="$(ls -d "$up"/jdks/jdk-17* 2>/dev/null | head -1)"
    if [ -n "$found" ]; then
      esc="$(to_windows_path "$found" | sed 's/\\/\\\\/g')"
      hint "已装：$found（Gradle 不会自动扫 jdks/）"
      hint "在 $props 里加：org.gradle.java.installations.paths=$esc"
      hint "并加：org.gradle.java.installations.auto-download=false（失败时快速报错而不是干等）"
    elif [ -n "$up" ]; then
      hint "装一个 JDK 17，再在 $props 里登记 org.gradle.java.installations.paths"
    fi
  fi

  # ---- ccache
  # RN 的 ReactNative-application.cmake 会自动把 ccache 设成编译器启动器；
  # Cygwin/MSYS 版的 ccache 认不了 C:\...\clang++.exe，NDK 编译会整片失败。
  cc="$(win_which ccache)"
  if [ -z "$cc" ]; then
    ok "PATH 上没有 ccache（NDK 直接调 clang，正常）"
  else
    case "$(printf '%s' "$cc" | tr 'A-Z' 'a-z')" in
      *cygwin* | *msys*)
        bad "ccache 是 Cygwin/MSYS 版，NDK 编译会全部失败：$cc"
        hint "装原生版（choco install ccache），或把这个 ccache.exe 改名禁用"
        ;;
      *) ok "ccache=$cc" ;;
    esac
  fi
  if [ -n "$ADB" ]; then
    devs="$("$ADB" devices | awk 'NR>1 && $2=="device" { print $1 }')"
    [ -n "$devs" ] && ok "在线设备：$(echo "$devs" | tr '\n' ' ')" \
      || bad "没有在线设备（先 just emulator，或插上真机并允许 USB 调试）"
  fi
fi
