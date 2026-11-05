#!/bin/sh
# 探测 DevEco Studio / HarmonyOS SDK 工具链，供 justfile 与 tool/harmony.sh 使用。
#
#   . tool/harmony-env.sh           # 只导出变量（找不到就留空，不报错）
#   sh tool/harmony-env.sh doctor   # 人读自检（配合 just harmony-doctor）
#
# 导出：
#   DEVECO_HOME         DevEco Studio 安装目录（WSL 里是 /mnt/c/... 形态）
#   DEVECO_SDK_HOME     SDK 根目录（= $DEVECO_HOME/sdk）；hvigor / ohpm 认这个名字
#   HARMONY_SDK         SDK 里实际在用的那个版本目录（$DEVECO_SDK_HOME/default）
#   HARMONY_SDK_VERSION 该 SDK 对应的 compatibleSdkVersion，形如 5.0.0(12)
#   HDC                 hdc（设备 / 端口转发 / 装包）
#   OHPM                ohpm 包管理器（鸿蒙侧的 npm）
#   HVIGORW             DevEco 自带的 hvigorw.js（构建入口，不是工程里的 wrapper）
#   DEVECO_NODE         DevEco 自带的 node（hvigor 要求用它跑）
#   HDC_SERVER_PORT     hdc 服务端口（默认 7035，别跟 adb 的 5037 抢）

on_wsl() {
  grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null
}

on_windows() {
  case "$(uname -s)" in
    MINGW* | MSYS* | CYGWIN*) return 0 ;;
  esac
  return 1
}

# 首个存在的路径
first_dir() {
  for d in "$@"; do
    [ -n "$d" ] && [ -d "$d" ] && {
      printf '%s' "$d"
      return 0
    }
  done
  return 1
}

first_file() {
  for f in "$@"; do
    [ -n "$f" ] && [ -f "$f" ] && {
      printf '%s' "$f"
      return 0
    }
  done
  return 1
}

# ------------------------------------------------------------- DevEco Studio
# DevEco 只有 Windows / macOS 版；WSL 里就借 Windows 装的那份（构建也在 Windows 侧跑）。
detect_deveco() {
  if [ -n "${DEVECO_HOME:-}" ] && [ -d "$DEVECO_HOME" ]; then
    printf '%s' "$DEVECO_HOME"
    return 0
  fi
  if on_wsl; then
    for d in /mnt/[c-z]/"Program Files"/Huawei/"DevEco Studio"* \
      /mnt/[c-z]/"Program Files (x86)"/Huawei/"DevEco Studio"* \
      /mnt/[c-z]/Huawei/"DevEco Studio"* \
      /mnt/[c-z]/"DevEco Studio"*; do
      [ -d "$d" ] || continue
      [ -d "$d/tools" ] || [ -d "$d/sdk" ] || continue
      printf '%s' "$d"
      return 0
    done
  fi
  first_dir /Applications/DevEco-Studio.app/Contents \
    "$HOME/deveco-studio" "$HOME/DevEco-Studio" "$HOME/Applications/DevEco-Studio.app/Contents"
}

# ------------------------------------------------------------- SDK
detect_sdk_home() {
  if [ -n "${DEVECO_SDK_HOME:-}" ] && [ -d "$DEVECO_SDK_HOME" ]; then
    printf '%s' "$DEVECO_SDK_HOME"
    return 0
  fi
  [ -n "${DEVECO_HOME:-}" ] && [ -d "$DEVECO_HOME/sdk" ] || return 1
  printf '%s' "$DEVECO_HOME/sdk"
}

# SDK 里某个版本目录（默认用 default/，老版本是 5.0.0(12)/ 这种）
detect_sdk() {
  [ -n "${DEVECO_SDK_HOME:-}" ] || return 1
  if [ -f "$DEVECO_SDK_HOME/default/openharmony/oh-uni-package.json" ]; then
    printf '%s' "$DEVECO_SDK_HOME/default"
    return 0
  fi
  for d in "$DEVECO_SDK_HOME"/*/openharmony; do
    [ -f "$d/oh-uni-package.json" ] || continue
    printf '%s' "${d%/openharmony}"
    return 0
  done
  return 1
}

# 从 oh-uni-package.json 读 compatibleSdkVersion（displayName + apiVersion）
sdk_version_of() {
  [ -n "${1:-}" ] || return 1
  f="$1/openharmony/oh-uni-package.json"
  [ -f "$f" ] || return 1
  "$(command -v node || echo node)" -e '
    try {
      const j = require(process.argv[1]);
      const name = j.displayName || j.version || "";
      const api = String(j.apiVersion || "");
      if (name && api) console.log(name + "(" + api + ")");
      else if (name) console.log(name);
    } catch (e) {}
  ' "$f" 2>/dev/null
}

# ------------------------------------------------------------- 工具
# WSL 里这些是 Windows 的 .exe / .bat（DevEco 只有 Windows 版），调用方要区分。
exe() {
  # $1 是去掉后缀的路径前缀
  first_file "$1" "$1.exe" "$1.bat" "$1.cmd"
}

detect_hdc() {
  if [ -n "${HARMONY_SDK:-}" ]; then
    f="$(exe "$HARMONY_SDK/openharmony/toolchains/hdc")" && {
      printf '%s' "$f"
      return 0
    }
  fi
  command -v hdc 2>/dev/null
}

detect_ohpm() {
  if [ -n "${DEVECO_HOME:-}" ]; then
    f="$(exe "$DEVECO_HOME/tools/ohpm/bin/ohpm")" && {
      printf '%s' "$f"
      return 0
    }
  fi
  command -v ohpm 2>/dev/null
}

detect_hvigorw() {
  if [ -n "${DEVECO_HOME:-}" ]; then
    f="$(first_file "$DEVECO_HOME/tools/hvigor/bin/hvigorw.js")" && {
      printf '%s' "$f"
      return 0
    }
  fi
  command -v hvigorw 2>/dev/null
}

detect_deveco_node() {
  if [ -n "${DEVECO_HOME:-}" ]; then
    f="$(exe "$DEVECO_HOME/tools/node/node")" && {
      printf '%s' "$f"
      return 0
    }
  fi
  command -v node 2>/dev/null
}

DEVECO_HOME="$(detect_deveco)" || DEVECO_HOME=""
[ -n "$DEVECO_HOME" ] && export DEVECO_HOME

DEVECO_SDK_HOME="$(detect_sdk_home)" || DEVECO_SDK_HOME=""
[ -n "$DEVECO_SDK_HOME" ] && export DEVECO_SDK_HOME

HARMONY_SDK="$(detect_sdk)" || HARMONY_SDK=""
[ -n "$HARMONY_SDK" ] && export HARMONY_SDK

HARMONY_SDK_VERSION="$(sdk_version_of "$HARMONY_SDK")" || HARMONY_SDK_VERSION=""
[ -n "$HARMONY_SDK_VERSION" ] && export HARMONY_SDK_VERSION

HDC="$(detect_hdc)" || HDC=""
[ -n "$HDC" ] && export HDC

OHPM="$(detect_ohpm)" || OHPM=""
[ -n "$OHPM" ] && export OHPM

HVIGORW="$(detect_hvigorw)" || HVIGORW=""
[ -n "$HVIGORW" ] && export HVIGORW

DEVECO_NODE="$(detect_deveco_node)" || DEVECO_NODE=""
[ -n "$DEVECO_NODE" ] && export DEVECO_NODE

# hdc 默认端口跟 adb 不一样，文档建议固定一个值，免得被系统随机端口干扰
HDC_SERVER_PORT="${HDC_SERVER_PORT:-7035}"
export HDC_SERVER_PORT

# ------------------------------------------------------------- 自检
if [ "${1:-}" = "doctor" ]; then
  ok() { printf '  ✓ %s\n' "$*"; }
  bad() { printf '  ✗ %s\n' "$*"; }
  hint() { printf '     %s\n' "$*"; }
  echo "环境：$(uname -s) $(uname -r)$(on_wsl && echo ' (WSL)')"

  if [ -n "$DEVECO_HOME" ]; then
    ok "DevEco Studio：$DEVECO_HOME"
  else
    bad "没找到 DevEco Studio（装一个，或 export DEVECO_HOME=<安装目录>）"
    hint "Windows 默认装在 C:\\Program Files\\Huawei\\DevEco Studio"
  fi

  if [ -n "$HARMONY_SDK" ]; then
    ok "SDK：$HARMONY_SDK${HARMONY_SDK_VERSION:+（compatibleSdkVersion $HARMONY_SDK_VERSION）}"
  else
    bad "没找到 HarmonyOS SDK（DevEco 里装 SDK，或 export DEVECO_SDK_HOME=<sdk 目录>）"
  fi

  [ -n "$HDC" ] && ok "hdc：$HDC（HDC_SERVER_PORT=$HDC_SERVER_PORT）" \
    || bad "没找到 hdc（在 {DevEco}/sdk/{版本}/openharmony/toolchains 里）"
  [ -n "$OHPM" ] && ok "ohpm：$OHPM" || bad "没找到 ohpm（在 {DevEco}/tools/ohpm/bin 里）"
  [ -n "$HVIGORW" ] && ok "hvigor：$HVIGORW" || bad "没找到 hvigorw.js（在 {DevEco}/tools/hvigor/bin 里）"
  [ -n "$DEVECO_NODE" ] && ok "node（hvigor 用）：$DEVECO_NODE" || bad "没找到 node"

  if [ -n "$HDC" ]; then
    devs="$("$HDC" list targets 2>/dev/null | tr -d '\r' | grep -v '^\s*$' | grep -v 'Empty')"
    if [ -n "$devs" ]; then
      ok "在线设备：$(echo "$devs" | tr '\n' ' ')"
    else
      bad "没有在线设备（插真机开 USB 调试，或在 DevEco 的 Device Manager 里起模拟器）"
    fi
  fi
fi
