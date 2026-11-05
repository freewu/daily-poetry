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
#   HDC_PORT            hdc 服务端口（默认 8710；hdc 只认 OHOS_HDC_SERVER_PORT）
#   HVD_EMULATOR        模拟器 Emulator.exe（{DevEco}/tools/emulator/）
#   HVD_HOME            模拟器实例目录（Device Manager 里的 openharmonyDeployPath）
#   HVD_IMAGE_ROOT      模拟器系统镜像目录（imageDeployPath）
#
# 模拟器（HVD）相关的两个目录不在注册表里，只写在
# {APPDATA}/Huawei/DevEcoStudio<版本>/options/deviceManager.xml，所以得读那个文件。

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

# Windows 路径 → WSL 路径（D:\a\b → /mnt/d/a/b）。不依赖 wslpath，任意 shell 都能跑。
win_to_wsl() {
  printf '%s' "$1" | awk '{
    p = $0
    gsub(/\\/, "/", p)
    if (match(p, /^[A-Za-z]:/)) p = "/mnt/" tolower(substr(p, 1, 1)) substr(p, 3)
    print p
  }'
}

# ------------------------------------------------------------- DevEco Studio
# DevEco 只有 Windows / macOS 版；WSL 里就借 Windows 装的那份（构建也在 Windows 侧跑）。
detect_deveco() {
  if [ -n "${DEVECO_HOME:-}" ] && [ -d "$DEVECO_HOME" ]; then
    printf '%s' "$DEVECO_HOME"
    return 0
  fi
  if on_wsl; then
    # 先看开始菜单的快捷方式：DevEco 不写注册表，但 .lnk 里就带着安装路径
    for lnk in /mnt/[c-z]/ProgramData/Microsoft/"Windows"/"Start Menu"/Programs/Huawei/"DevEco Studio"*.lnk; do
      [ -f "$lnk" ] || continue
      local t
      t="$(tr -d '\000' <"$lnk" | grep -ao '[A-Za-z]:\\[^"]*devecostudio64\.exe' | head -1)"
      [ -n "$t" ] || continue
      t="$(win_to_wsl "$t")"
      t="$(dirname "$(dirname "$t")")"
      [ -d "$t/tools" ] || [ -d "$t/sdk" ] || continue
      printf '%s' "$t"
      return 0
    done
    # 兜底：常见安装位置（含 D:\idea\Huawei\DevEco Studio 这种自定义目录）
    for d in /mnt/[c-z]/"Program Files"/Huawei/"DevEco Studio"* \
      /mnt/[c-z]/"Program Files (x86)"/Huawei/"DevEco Studio"* \
      /mnt/[c-z]/Huawei/"DevEco Studio"* \
      /mnt/[c-z]/"DevEco Studio"* \
      /mnt/[c-z]/*/Huawei/"DevEco Studio"* \
      /mnt/[c-z]/*/"DevEco Studio"*; do
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

# SDK 里某个版本目录（DevEco 6 是 default/sdk-pkg.json，老版本是 default/openharmony/oh-uni-package.json）
detect_sdk() {
  [ -n "${DEVECO_SDK_HOME:-}" ] || return 1
  if [ -f "$DEVECO_SDK_HOME/default/sdk-pkg.json" ]; then
    printf '%s' "$DEVECO_SDK_HOME/default"
    return 0
  fi
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

# 读 compatibleSdkVersion 那种「版本(API)」写法（platformVersion 优先，displayName 兜底）
sdk_version_of() {
  [ -n "${1:-}" ] || return 1
  local f
  f="$1/sdk-pkg.json"
  [ -f "$f" ] || f="$1/openharmony/oh-uni-package.json"
  [ -f "$f" ] || return 1
  "$(command -v node || echo node)" -e '
    try {
      const raw = require(process.argv[1]);
      const j = raw.data || raw;
      const name = j.platformVersion || j.displayName || j.version || "";
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

# ------------------------------------------------------------- 模拟器（HVD）
# Device Manager 的「实例目录 / 系统镜像目录」只写在 IDE 的设置文件里。
deveco_settings_xml() {
  local f best=""
  # 目录名按字典序展开，DevEcoStudio6.0 排在 5.0 后面 → 最后一个就是最高版本
  for f in /mnt/[c-z]/Users/*/AppData/Roaming/Huawei/DevEcoStudio*/options/deviceManager.xml; do
    [ -f "$f" ] && best="$f"
  done
  [ -n "$best" ] && printf '%s' "$best"
}

detect_hvd_home() {
  if [ -n "${AHarmonyOS_HVD_HOME:-}" ] && [ -d "$AHarmonyOS_HVD_HOME" ]; then
    printf '%s' "$AHarmonyOS_HVD_HOME"
    return 0
  fi
  local xml p
  xml="$(deveco_settings_xml)" && {
    p="$(grep -o 'name="openharmonyDeployPath" value="[^"]*"' "$xml" 2>/dev/null | head -1 | sed 's/.*value="//;s/"$//')"
    if [ -n "$p" ]; then
      on_wsl && p="$(win_to_wsl "$p")"
      [ -d "$p" ] && {
        printf '%s' "$p"
        return 0
      }
    fi
  }
  local d
  for d in /mnt/[c-z]/Users/*/AppData/Local/Huawei/Emulator/deployed; do
    [ -d "$d" ] && {
      printf '%s' "$d"
      return 0
    }
  done
  return 1
}

detect_hvd_image_root() {
  if [ -n "${HVD_IMAGE_ROOT:-}" ] && [ -d "$HVD_IMAGE_ROOT" ]; then
    printf '%s' "$HVD_IMAGE_ROOT"
    return 0
  fi
  local xml p d
  xml="$(deveco_settings_xml)" && {
    p="$(grep -o 'name="imageDeployPath" value="[^"]*"' "$xml" 2>/dev/null | head -1 | sed 's/.*value="//;s/"$//')"
    if [ -n "$p" ]; then
      on_wsl && p="$(win_to_wsl "$p")"
      [ -d "$p" ] && {
        printf '%s' "$p"
        return 0
      }
    fi
  }
  for d in /mnt/[c-z]/Users/*/AppData/Local/Huawei/Sdk; do
    [ -d "$d" ] && {
      printf '%s' "$d"
      return 0
    }
  done
  return 1
}

detect_hvd_emulator() {
  [ -n "${DEVECO_HOME:-}" ] || return 1
  exe "$DEVECO_HOME/tools/emulator/Emulator"
}

HVD_HOME="$(detect_hvd_home)" || HVD_HOME=""
[ -n "$HVD_HOME" ] && export HVD_HOME

HVD_IMAGE_ROOT="$(detect_hvd_image_root)" || HVD_IMAGE_ROOT=""
[ -n "$HVD_IMAGE_ROOT" ] && export HVD_IMAGE_ROOT

HVD_EMULATOR="$(detect_hvd_emulator)" || HVD_EMULATOR=""
[ -n "$HVD_EMULATOR" ] && export HVD_EMULATOR

# hdc 认的是 OHOS_HDC_SERVER_PORT（默认 8710，跟 adb 的 5037 不冲突）。
# 以前这里写死 HDC_SERVER_PORT=7035 —— hdc 根本不看那个名字，而 DevEco 起的 hdc 服务在 8710，
# 两边各说一个端口只会互相看不见（模拟器 / 真机全“消失”）。所以只在用户显式设了才往下传。
HDC_PORT="${OHOS_HDC_SERVER_PORT:-8710}"
export HDC_PORT
[ -n "${OHOS_HDC_SERVER_PORT:-}" ] && export OHOS_HDC_SERVER_PORT

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

  [ -n "$HDC" ] && ok "hdc：$HDC（端口 $HDC_PORT）" \
    || bad "没找到 hdc（在 {DevEco}/sdk/{版本}/openharmony/toolchains 里）"

  if [ -n "$HVD_EMULATOR" ]; then
    hvds="$("$HVD_EMULATOR" -list 2>/dev/null | tr -d '\r' | grep -v '^[[:space:]]*$' | grep -v '\[Empty\]')"
    if [ -n "$hvds" ]; then
      ok "模拟器：$HVD_EMULATOR"
      hint "实例（$(echo "$hvds" | wc -l) 个）：$(echo "$hvds" | tr '\n' ' ')"
      hint "起模拟器：just harmony-emulator｜停：just harmony-emulator --stop"
    else
      bad "模拟器能跑但没实例（DevEco 的 Device Manager 里新建一个，会顺带下载系统镜像）"
    fi
  else
    bad "没找到模拟器 Emulator.exe（{DevEco}/tools/emulator/；DevEco 5.0+ 才有）"
  fi
  [ -n "$OHPM" ] && ok "ohpm：$OHPM" || bad "没找到 ohpm（在 {DevEco}/tools/ohpm/bin 里）"
  [ -n "$HVIGORW" ] && ok "hvigor：$HVIGORW" || bad "没找到 hvigorw.js（在 {DevEco}/tools/hvigor/bin 里）"
  [ -n "$DEVECO_NODE" ] && ok "node（hvigor 用）：$DEVECO_NODE" || bad "没找到 node"

  if [ -n "$HDC" ]; then
    devs="$("$HDC" list targets 2>/dev/null | tr -d '\r' | grep -v '^\s*$' | grep -v 'Empty')"
    if [ -n "$devs" ]; then
      ok "在线设备：$(echo "$devs" | tr '\n' ' ')"
    else
      bad "没有在线设备（just harmony-emulator 起模拟器，或插真机开 USB 调试）"
    fi
  fi
fi
