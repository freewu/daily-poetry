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

if [ "${1:-}" = "doctor" ]; then
  ok() { printf '  ✓ %s\n' "$*"; }
  bad() { printf '  ✗ %s\n' "$*"; }
  echo "环境：$(uname -s) $(uname -r)$(on_wsl && echo ' (WSL)')"
  [ -n "$ANDROID_HOME" ] && ok "ANDROID_HOME=$ANDROID_HOME" \
    || bad "没找到 Android SDK（设置 ANDROID_HOME，或装 Android Studio）"
  [ -n "$ADB" ] && ok "adb=$ADB" || bad "没找到 adb（见 just android-setup）"
  [ -n "${ADB_SERVER_SOCKET:-}" ] && ok "复用 Windows adb server：$ADB_SERVER_SOCKET"
  [ -n "$EMULATOR" ] && ok "emulator=$EMULATOR" || bad "没找到 emulator"
  [ -n "$AVD" ] && ok "默认 AVD=$AVD" || bad "没有可用 AVD（avdmanager create avd 建一个）"
  if [ -n "$ADB" ]; then
    devs="$("$ADB" devices | awk 'NR>1 && $2=="device" { print $1 }')"
    [ -n "$devs" ] && ok "在线设备：$(echo "$devs" | tr '\n' ' ')" \
      || bad "没有在线设备（先 just emulator，或插上真机并允许 USB 调试）"
  fi
fi
