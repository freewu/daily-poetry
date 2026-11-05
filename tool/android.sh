#!/usr/bin/env bash
# Android 侧的操作入口：起模拟器 / 等开机 / 装包 / 跑 Maestro。
#
#   bash tool/android.sh doctor          # 工具链自检
#   bash tool/android.sh setup           # 缺 adb 时下载 Linux platform-tools
#   bash tool/android.sh boot [avd]      # 启动模拟器并等到 sys.boot_completed=1
#   bash tool/android.sh wait            # 只等设备开机完成
#   bash tool/android.sh install         # prebuild + Gradle 构建 Debug 包并安装
#   bash tool/android.sh apk             # 打离线可用的 Release APK → dist/（拔线 / 关 Metro 也能用）
#   bash tool/android.sh e2e [flow…]     # 跑 .maestro 下的 Maestro 流程
#
# WSL 说明：模拟器本身是 Windows 程序，必须由 Windows 侧启动；adb 用 Linux
# 客户端连 Windows 的 adb server（详见 tool/android-env.sh 文件头）。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck disable=SC1091
# 传一个非 doctor 的参数，避免 source 时就把自检结果打印一遍（doctor 里会再跑一次）
. tool/android-env.sh sourced

info() { printf '  %s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

on_wsl() { grep -qi microsoft /proc/version 2>/dev/null; }

# 在 Windows 侧执行命令（WSL 里 Gradle / 模拟器都得跑在 Windows 上）
win_run() {
  if on_wsl; then
    cmd.exe /c "cd /d $(wslpath -w "$ROOT") && $*"
  else
    bash -lc "$*"
  fi
}

require_adb() {
  [ -n "${ADB:-}" ] || {
    printf '✗ 没找到 adb。\n' >&2
    printf '  在 WSL 里可以先跑：just android-setup（会下载 Linux platform-tools）\n' >&2
    printf '  或者在 Windows 上装 platform-tools 并启动 adb server（adb start-server）。\n' >&2
    exit 1
  }
}

device_serial() {
  require_adb
  "$ADB" devices -l 2>/dev/null | python3 tool/android_target.py device
}

wait_boot() {
  local timeout="${1:-240}" serial="" waited=0
  require_adb
  info "等待设备上线（最长 ${timeout}s）…"
  while [ "$waited" -lt "$timeout" ]; do
    serial="$(device_serial)"
    [ -n "$serial" ] && break
    sleep 3
    waited=$((waited + 3))
  done
  [ -n "$serial" ] || die "没有设备上线。先在 Android Studio 里启动一个 AVD，或跑 just emulator。"
  info "设备：$serial"

  while [ "$waited" -lt "$timeout" ]; do
    booted="$("$ADB" -s "$serial" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r\n')"
    if [ "$booted" = "1" ]; then
      info "开机完成 ✓"
      printf '%s\n' "$serial"
      return 0
    fi
    sleep 3
    waited=$((waited + 3))
  done
  die "设备 ${serial} 在 ${timeout}s 内没有完成开机"
}

cmd_doctor() {
  sh tool/android-env.sh doctor
  python3 tool/android_target.py --selftest >/dev/null && info "android_target.py 自检 ✓"
  command -v maestro >/dev/null 2>&1 && info "maestro=$(command -v maestro)" \
    || info "（可选）没装 Maestro：见 README「Android 测试」一节"
}

# 没有 Linux adb 时下载官方 platform-tools（约 10MB），放到 ~/.local/share
cmd_setup() {
  [ -n "${ADB:-}" ] && { info "adb 已就绪：$ADB"; return 0; }
  local dir="$HOME/.local/share/android-platform-tools" zip url
  url="https://dl.google.com/android/repository/platform-tools-latest-linux.zip"
  mkdir -p "$dir"
  zip="$dir/platform-tools.zip"
  info "下载 $url"
  curl -fL --progress-bar -o "$zip" "$url" || die "下载失败"
  python3 -m zipfile -e "$zip" "$dir" || die "解压失败"
  chmod +x "$dir/platform-tools/adb"
  rm -f "$zip"
  mkdir -p "$HOME/.local/bin"
  ln -sf "$dir/platform-tools/adb" "$HOME/.local/bin/adb"
  info "adb → $dir/platform-tools/adb（已链接到 ~/.local/bin/adb）"
  info "把 ~/.local/bin 加进 PATH 后，Maestro 就能直接调用 adb"
}

cmd_boot() {
  local avd="${1:-${AVD:-}}" serial
  serial="$(device_serial)"
  if [ -n "$serial" ]; then
    info "已有在线设备：$serial"
    return 0
  fi
  [ -n "$avd" ] || die "没有可用 AVD。用 avdmanager create avd 建一个，或 just emulator <名字>"
  [ -n "${EMULATOR:-}" ] || die "没找到 emulator 可执行文件"
  info "启动 AVD：$avd"
  if on_wsl; then
    # start 让模拟器在 Windows 侧独立运行，不阻塞当前 shell
    cmd.exe /c "start \"\" \"$(wslpath -w "$EMULATOR")\" -avd $avd -no-snapshot-load -gpu swiftshader_indirect" || true
  else
    nohup "$EMULATOR" -avd "$avd" -no-snapshot-load -gpu swiftshader_indirect >/tmp/emulator.log 2>&1 &
  fi
  wait_boot 300 >/dev/null && info "模拟器就绪 ✓"
}

cmd_install() {
  wait_boot 240 >/dev/null
  info "构建并安装 Debug 包（首次会下载 Gradle 依赖，较慢）…"
  if on_wsl; then
    win_run npx expo run:android --no-bundler
  else
    npx expo run:android --no-bundler
  fi
}

# Debug 包的 JS 是 Metro 现喂的（adb reverse 8081），拔线 / 关 just start 之后就只剩
# 「Unable to load script」—— 想脱机用必须装 Release 包（JS 打进 APK 里）。
# 本地 Release 用模板自带的 debug.keystore 签名（见 android/app/build.gradle），能直接装。

# 从 app.json 读一个字段（版本号 / versionCode）；读不到就给兜底，别让文件名变成空的
app_field() {
  node -p "const a = require('./app.json').expo; String($1)" 2>/dev/null || printf '0'
}

# 产物文件名：daily-poetry-<version>-vc<versionCode>.apk（dist/ 已在 .gitignore 里）
apk_name() {
  printf 'daily-poetry-%s-vc%s.apk' "$(app_field 'a.version')" "$(app_field 'a.android.versionCode || 1')"
}

cmd_apk() {
  local apk="android/app/build/outputs/apk/release/app-release.apk"
  local dist="$ROOT/dist"
  info "构建 Release APK（JS 打进包里，装完可以拔线）…"
  if on_wsl; then
    win_run "cd android && gradlew.bat assembleRelease" \
      || die "Gradle 构建失败。日志：%USERPROFILE%\\.gradle\\daemon\\*.out.log（JDK17 / ccache 见 AGENTS.md）"
  else
    ( cd android && ./gradlew assembleRelease ) || die "Gradle 构建失败"
  fi
  [ -f "$apk" ] || die "没找到产物 $apk"

  # 顺手收一份到 dist/：Gradle 的产物目录会被 clean 清掉，dist/ 是给「拿文件去装」用的
  mkdir -p "$dist"
  cp -f "$apk" "$dist/$(apk_name)" || die "复制产物到 dist/ 失败"
  info "产物：dist/$(apk_name)（$(du -h "$dist/$(apk_name)" | cut -f1)）"

  [ -n "${ADB:-}" ] || {
    info "没有 adb，跳过安装（手动装：adb install -r $apk）"
    return 0
  }
  local serial
  serial="$(device_serial)" || serial=""
  if [ -z "$serial" ]; then
    info "设备不在线，跳过安装（adb install -r $apk）"
    return 0
  fi
  info "覆盖安装到 $serial（收藏 / 设置都会留着）…"
  "$ADB" -s "$serial" install -r "$apk" >/dev/null && info "装好了 ✓ 现在可以拔线"
}

cmd_e2e() {
  local serial flows=("$@")
  serial="$(device_serial)" || true
  [ -n "$serial" ] || die "没有在线设备，先跑 just emulator"
  info "设备：$serial"

  command -v maestro >/dev/null 2>&1 || die "没装 Maestro。见 README「Android 测试」一节（安装后重试）"

  # Maestro 自己会调 adb：把 Linux adb 目录塞进 PATH，并复用 Windows 的 adb server
  if [ -n "${ADB:-}" ]; then
    PATH="$(dirname "$ADB"):$PATH"
    export PATH
  fi
  export ADB_SERVER_SOCKET="${ADB_SERVER_SOCKET:-}"
  export MAESTRO_CLI_NO_ANALYTICS=1
  export MAESTRO_DRIVER_STARTUP_TIMEOUT="${MAESTRO_DRIVER_STARTUP_TIMEOUT:-120000}"

  # App 的 JS 由 Metro 提供；没有它就只会看到红屏
  if ! curl -sf --max-time 3 http://127.0.0.1:8081/status >/dev/null 2>&1; then
    info "提示：8081 上没有 Metro。先另开一个终端跑 just start（或 just android）"
  fi

  if [ "${#flows[@]}" -eq 0 ]; then
    set -- .maestro
  fi
  info "运行 Maestro：$*"
  maestro test --device "$serial" "$@"
}

case "${1:-doctor}" in
  doctor) cmd_doctor ;;
  setup) cmd_setup ;;
  boot | emulator) shift; cmd_boot "${1:-}" ;;
  wait) shift; wait_boot "${1:-240}" ;;
  install | build) cmd_install ;;
  apk | release) cmd_apk ;;
  e2e) shift; cmd_e2e "$@" ;;
  *)
    printf '用法：bash tool/android.sh [doctor|setup|boot|wait|install|apk|e2e] [参数…]\n' >&2
    exit 2
    ;;
esac
