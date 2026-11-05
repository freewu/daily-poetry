#!/usr/bin/env bash
# React Native for OpenHarmony（RNOH）工作流：初始化 / 编译调试 / 打包。
#
#   tool/harmony.sh doctor   环境 + 工程自检
#   tool/harmony.sh setup    装 RNOH 依赖 + 生成 harmony/ 工程（可重复跑）
#   tool/harmony.sh emulator 起模拟器（已在跑就复用，等系统起完；--list / --stop）
#   tool/harmony.sh start    起鸿蒙用的 Metro（platform = harmony）
#   tool/harmony.sh run      编译 Debug HAP → 装设备 → 拉起（JS 走 Metro 热加载）
#   tool/harmony.sh hap      打 Release HAP → dist/（JS 打进包里，脱机可用）
#   tool/harmony.sh log      看设备日志（hilog，默认过滤 RN 相关 tag）
#   tool/harmony.sh clean    清构建产物
#
# 为什么要这一层：DevEco Studio（hvigor / ohpm / hdc / node）只有 Windows / macOS 版，
# WSL 里得借 Windows 那套装的东西跑，而 cmd.exe /c "cd /d C:\Program Files\…" 会被空格拆散，
# 所以凡是跑 DevEco 的工具都写成 .bat 再交给 cmd.exe（见 win_run）。
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# shellcheck source=tool/harmony-env.sh
. "$ROOT/tool/harmony-env.sh" "$([ "${1:-}" = "doctor" ] && echo doctor)"

HARMONY="$ROOT/harmony"
DIST="$ROOT/dist"
WORK="$ROOT/.data/harmony" # 版本缓存 / metro 日志 / 临时 .bat
TEMPLATE="$ROOT/tool/harmony-template"
APP_KEY="main" # expo-router 的入口就是 AppRegistry.registerComponent('main', …)
RNOH_PKG="@react-native-oh/react-native-harmony"
RNOH_CLI="@react-native-oh/react-native-harmony-cli"
# `npx react-native …` 只是转发器，真正的 CLI 在 @react-native-community/cli 里；
# Expo 工程本身不带它（用 expo start），而 bundle-harmony 只能走 RN CLI。
CLI_PKG="@react-native-community/cli@20"
# Metro 靠环境变量切到鸿蒙解析规则（见 metro.config.js 的 RNOH_METRO 段）：
# `npx react-native start` 只认根目录的 metro.config.js，没有传配置的入口。
METRO_ENV="RNOH_METRO=1"

info() { printf '  %s\n' "$*"; }
warn() { printf '  ! %s\n' "$*" >&2; }
step() { printf '\n▸ %s\n' "$*"; }
die() {
  printf '✗ %s\n' "$*" >&2
  exit 1
}

on_wsl() { grep -qiE '(microsoft|wsl)' /proc/version 2>/dev/null; }
to_win() { wslpath -w "$1" 2>/dev/null; }
# 传给 Windows 程序的路径参数（hdc 要 Windows 路径）
tool_path() {
  if on_wsl; then to_win "$1"; else printf '%s' "$1"; fi
}

# 跑 Windows 侧命令：写个 .bat 再 cmd.exe /c 它（路径里的空格才不会被拆开）
bat_head() { # $1 = 工作目录
  printf '@echo off\r\n'
  [ -n "${DEVECO_SDK_HOME:-}" ] && printf 'set DEVECO_SDK_HOME=%s\r\n' "$(to_win "$DEVECO_SDK_HOME")"
  [ -n "${OHOS_HDC_SERVER_PORT:-}" ] && printf 'set OHOS_HDC_SERVER_PORT=%s\r\n' "$OHOS_HDC_SERVER_PORT"
  printf 'cd /d "%s" || exit /b 1\r\n' "$(to_win "$1")"
}

win_run() {
  local dir="$1"
  shift
  mkdir -p "$WORK"
  local bat="$WORK/run.bat"
  {
    bat_head "$dir"
    printf '%s\r\n' "$*"
    printf 'exit /b %%ERRORLEVEL%%\r\n'
  } >"$bat"
  cmd.exe /c "$(to_win "$bat")"
}

# 起 GUI 进程（模拟器）：用 PowerShell 的 Start-Process。
win_emu_start() { # $1 = 参数串（Windows 引号风格）
  # 为什么不用 .bat + `start ""`：那样模拟器会继承我们的 stdout/stderr，
  # GUI 进程不死，WSL 这边的管道就永远读不到 EOF，`just harmony-emulator` 会卡到模拟器关闭。
  # Start-Process 不重定向时会完全脱离父进程的 stdio，2 秒就返回。
  # **不能加 -RedirectStandardOutput**：带了它 PowerShell 反而会一直挂着（实测 6 分钟不返回）。
  local args="$1"
  powershell.exe -NoProfile -Command \
    "Start-Process -FilePath '$(to_win "$HVD_EMULATOR")' -WorkingDirectory '$(to_win "$(dirname "$HVD_EMULATOR")")' -ArgumentList '$args'" >/dev/null 2>&1
}
win_emu_probe() { # $1 = 参数串（Windows 引号风格）—— 只在失败后重跑一次捞原因
  # GUI 程序从 WSL 拉起时没有控制台，它的 stdout/stderr 本来会直接消失 ——
  # 而 Emulator.exe 失败时恰恰只写这两条流（Emulator.log 一个字不动，真实原因常在 stderr：
  # '... is not found. Please create the device(folder)'）。
  # 这里带 -Wait：不加它 PowerShell 会一直挂着（GUI 子进程），能走到这一步就说明它已经退了。
  local args="$1" out="$WORK/emu-start.log" err="$WORK/emu-err.log"
  mkdir -p "$WORK"
  : >"$out"
  : >"$err"
  powershell.exe -NoProfile -Command \
    "Start-Process -FilePath '$(to_win "$HVD_EMULATOR")' -WorkingDirectory '$(to_win "$(dirname "$HVD_EMULATOR")")' -ArgumentList '$args' -RedirectStandardOutput '$(to_win "$out")' -RedirectStandardError '$(to_win "$err")' -Wait | Out-Null" >/dev/null 2>&1
}

# ------------------------------------------------------------------ 版本
app_field() { node -p "require('./app.json').expo.$1" 2>/dev/null; }
rn_version() {
  node -p "require('./node_modules/react-native/package.json').version" 2>/dev/null ||
    node -p "require('./package.json').dependencies['react-native']" 2>/dev/null
}

# RNOH 版本跟 RN 的大版本走：0.86.x ← 0.86-stable / 0.86-rc / latest 里能查到的那个
harmony_version() {
  if [ -n "${HARMONY_VERSION:-}" ]; then
    printf '%s' "$HARMONY_VERSION"
    return 0
  fi
  local cached="$WORK/version"
  if [ -f "$cached" ]; then
    cat "$cached"
    return 0
  fi
  local mm tag v
  mm="$(rn_version | cut -d. -f1,2)"
  for tag in "${mm}-stable" "${mm}-rc" latest; do
    v="$(npm view "${RNOH_PKG}@${tag}" version 2>/dev/null | tr -d '\r' | tail -1)"
    [ -n "$v" ] || continue
    mkdir -p "$WORK"
    printf '%s' "$v" >"$cached"
    printf '%s' "$v"
    return 0
  done
  return 1
}

# ------------------------------------------------------------------ 依赖
rnoh_installed() { # $1 = 版本
  [ -f "$ROOT/node_modules/react-native-harmony/package.json" ] || return 1
  [ -d "$ROOT/node_modules/$RNOH_CLI" ] || return 1
  [ -d "$ROOT/node_modules/@react-native-community/cli" ] || return 1
  local got
  got="$(node -p "require('./node_modules/react-native-harmony/package.json').version" 2>/dev/null)"
  [ "$got" = "$1" ]
}

install_rnoh() {
  local v="$1" lock="" rc
  step "装 RNOH 依赖（$RNOH_PKG@$v）"
  info "140MB 左右，走 npmmirror 大概一分钟；不写进 package.json —— 只有鸿蒙构建需要它"
  [ -f "$ROOT/package-lock.json" ] && {
    lock="$(mktemp)"
    cp "$ROOT/package-lock.json" "$lock"
  }

  # 三个必须**一起**装：npm 每次 --no-save 都会把上一轮装上的 extraneous 包剪掉
  set -- "react-native-harmony@npm:${RNOH_PKG}@${v}" "${RNOH_CLI}@${v}" "$CLI_PKG"
  npm install --no-save "$@"
  rc=$?
  if [ $rc -ne 0 ]; then
    warn "直接装失败（peer 冲突？），改用 --legacy-peer-deps 重试"
    npm install --no-save --legacy-peer-deps "$@"
    rc=$?
  fi

  # npm install 会顺手改 package-lock.json，但 RNOH 是本地工具链、不该进锁文件
  if [ -n "$lock" ]; then
    if ! cmp -s "$lock" "$ROOT/package-lock.json"; then
      cp "$lock" "$ROOT/package-lock.json"
      info "已还原 package-lock.json（RNOH 不进锁文件）"
    fi
    rm -f "$lock"
  fi
  return $rc
}

ensure_rnoh() {
  [ -d "$ROOT/node_modules/react-native" ] || die "还没装依赖：先跑 just deps"
  local v
  v="$(harmony_version)" || die "查不到 RNOH 版本（网络不通？或手动 export HARMONY_VERSION=0.86.1）"
  if rnoh_installed "$v"; then
    info "RNOH 依赖已就绪（$v）"
    return 0
  fi
  install_rnoh "$v" || die "RNOH 依赖安装失败"
  rnoh_installed "$v" || die "装完了但 node_modules/react-native-harmony 还是不对，删掉重装试试"
}

# ------------------------------------------------------------------ 工程
render_project() { # $@ = 额外参数（--force）
  local bundle label sdk model vn vc
  bundle="$(app_field android.package)"
  [ -n "$bundle" ] || bundle="com.example.$(app_field slug | tr -d '_-')"
  label="$(app_field name)"
  [ -n "$label" ] || label="daily-poetry"
  vn="$(app_field version)"
  vc="$(app_field android.versionCode)"
  [ -n "$vc" ] || vc="1"
  # compatibleSdkVersion / hvigor 的 modelVersion 都跟本机装的 SDK 走。
  # modelVersion 是 hvigor 的“模型版本”（5.0.0 / 6.0.0 这种大版本），
  # 不能拿 compatibleSdkVersion 的 6.0.1 直接当（它只取大版本 + .0.0）。
  sdk="${HARMONY_SDK_VERSION:-5.0.0(12)}"
  model="${HARMONY_MODEL_VERSION:-${sdk%%.*}.0.0}"
  if [ -z "${HARMONY_SDK_VERSION:-}" ]; then
    warn "没检测到本机 HarmonyOS SDK，先按 $sdk 写；装好 DevEco 后跑 just harmony-setup --force 重来"
  fi

  step "生成 harmony/ 工程"
  node tool/harmony-render.mjs \
    --template "$TEMPLATE" \
    --out "$HARMONY" \
    --bundle "$bundle" \
    --label "$label" \
    --app-key "$APP_KEY" \
    --version-name "$vn" \
    --version-code "$vc" \
    --rnoh "$(harmony_version)" \
    --sdk "$sdk" \
    --model "$model" \
    --icon "$ROOT/assets/images/icon.png" "$@"
}

ohpm_install() {
  [ -n "${OHPM:-}" ] || {
    warn "没找到 ohpm：先装 DevEco Studio，或 export DEVECO_HOME=<安装目录>"
    warn "装好之后跑 just harmony-setup（会补这一步）"
    return 1
  }
  step "ohpm install（拉 @rnoh/react-native-openharmony 的 .har，约 100MB）"
  if on_wsl; then
    win_run "$HARMONY" "\"$(to_win "$OHPM")\" install"
  else
    (cd "$HARMONY" && "$OHPM" install)
  fi
}

# ------------------------------------------------------------------ 设备
hdc() {
  [ -n "${HDC:-}" ] || die "没找到 hdc（先 just harmony-doctor）"
  "$HDC" "$@"
}

# 在线的 hdc 目标（一行一个；没设备时输出空）
devices() {
  [ -n "${HDC:-}" ] || return 1
  "$HDC" list targets 2>/dev/null | tr -d '\r' | grep -v '^[[:space:]]*$' | grep -v 'Empty'
}

require_device() {
  local devs
  devs="$(devices)" || die "没找到 hdc（先 just harmony-doctor）"
  [ -n "$devs" ] || die "没有在线鸿蒙设备：just harmony-emulator 起模拟器，或插真机开 USB 调试"
  info "设备：$(echo "$devs" | tr '\n' ' ')"
}

# ------------------------------------------------------------------ 模拟器（HVD）
# DevEco 的模拟器就是个 Windows GUI 程序（Emulator.exe）：
#   Emulator.exe -hvd <实例名> -path <实例目录> -imageRoot <系统镜像目录>
# 起来之后它自己往 hdc 服务（默认 127.0.0.1:8710）注册成 127.0.0.1:5555，
# 所以 WSL 这边不需要端口映射 —— 直接 hdc list targets 就能看到。
hvd_list() {
  [ -n "${HVD_EMULATOR:-}" ] || return 1
  "$HVD_EMULATOR" -list 2>/dev/null | tr -d '\r' | grep -v '^[[:space:]]*$' | grep -v '\[Empty\]'
}

# 默认实例：config.ini 里 isDefault=true 的那个，没有就取第一个
hvd_default() {
  local all name
  all="$(hvd_list)" || return 1
  [ -n "$all" ] || return 1
  while IFS= read -r name; do
    [ -n "$name" ] || continue
    if grep -q '^isDefault=true' "${HVD_HOME:-/nonexistent}/$name/config.ini" 2>/dev/null; then
      printf '%s' "$name"
      return 0
    fi
  done <<EOF
$all
EOF
  printf '%s\n' "$all" | head -1
}

# 模拟器进程还在不在（Windows 侧 GUI 程序，只能在 Windows 进程表里看）。
# 查不了（没开 interop / 没有 tasklist）一律当它活着 —— 误判成「死了」比多等几分钟更糟。
emu_running() {
  local out
  out="$(tasklist.exe 2>/dev/null)" || return 0
  [ -n "$out" ] || return 0
  printf '%s\n' "$out" | grep -qi 'Emulator\.exe'
}

# 系统起来没有：hdc 先连上，再等 bootevent.boot.completed（首次开机约 1-2 分钟）
# 返回 0 = 就绪，1 = 超时，2 = 模拟器进程没了（秒退，别傻等 5 分钟）
wait_device() { # $1 = 超时秒数（默认 300，算的是墙钟）
  local t="${1:-300}" deadline
  deadline=$(($(date +%s) + t))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if [ -n "$(devices)" ]; then
      # hdc shell 碰到死 target / 刚开机时会卡住，包一层 timeout；
      # **必须带 -k**：hdc 是 Windows 进程，WSL 的 timeout 只发 SIGTERM 时杀不掉它，
      # 于是“超时”变成了永久挂起（模拟器都起来了，脚本还卡着）。
      if timeout -k 2 8 "$HDC" shell "param get bootevent.boot.completed" 2>/dev/null | tr -d '\r' | grep -q true; then
        return 0
      fi
    elif [ "${WATCH_EMU:-0}" = 1 ] && ! emu_running; then
      return 2
    fi
    sleep 3
  done
  return 1
}

start_emulator() { # $1 = 实例名（空 = 默认实例）
  local name="$1" path root
  [ -n "${HVD_EMULATOR:-}" ] || die "没找到模拟器 Emulator.exe（DevEco 5.0+ 自带，跑 just harmony-doctor 看看）"
  [ -n "$name" ] || name="$(hvd_default)" || name=""
  [ -n "$name" ] || die "没有可用的模拟器实例（DevEco → Device Manager → 新建，会顺带下载系统镜像）"
  [ -n "${HVD_HOME:-}" ] || die "找不到模拟器实例目录（Device Manager 里的 openharmonyDeployPath）"
  path="$HVD_HOME/$name"
  [ -d "$path" ] || die "模拟器实例目录不存在：$path"
  root="${HVD_IMAGE_ROOT:-}"
  [ -n "$root" ] || die "找不到模拟器系统镜像目录（Device Manager 里的 imageDeployPath）"
  step "启动模拟器：$name"
  # 注意 -path 传的是**部署根目录**（HVD_HOME），不是实例目录：
  # Emulator.exe 会自己拼成 <path>/<hvd 名>。传实例目录的话它会去找
  # <实例>/<实例>，只往 stderr 丢一句 'is not found. Please create the device(folder)'
  # 加一句 'Unable to start the emulator' 就退出，Emulator.log 一个字不写。
  if on_wsl; then
    win_emu_start "-hvd \"$name\" -path \"$(to_win "$HVD_HOME")\" -imageRoot \"$(to_win "$root")\"" \
      || die "Emulator.exe 启动失败"
  else
    (cd "$(dirname "$HVD_EMULATOR")" && "$HVD_EMULATOR" -hvd "$name" -path "$HVD_HOME" -imageRoot "$root" \
      >"$WORK/emu-start.log" 2>"$WORK/emu-err.log" &)
  fi
  # 起完立刻死掉是常见故障（Windows 侧只丢一句 Unable to start the emulator，
  # Emulator.log 一个字都不写），别让调用方白等五分钟。
  sleep 5
  if ! emu_running; then
    warn "模拟器进程秒退"
    # 重跑一次捞 stderr（正常路径不付这个代价：PowerShell 的 Start-Process
    # 不加 -Wait 时会一直挂着，GUI 子进程不退它就不返回）。
    on_wsl && win_emu_probe "-hvd \"$name\" -path \"$(to_win "$HVD_HOME")\" -imageRoot \"$(to_win "$root")\""
    for l in "$WORK/emu-start.log" "$WORK/emu-err.log"; do
      [ -s "$l" ] || continue
      while IFS= read -r line; do [ -n "$line" ] && warn "  $line"; done <"$l"
    done
    warn "日志：$path/Emulator.log｜能起一次但重复起不来时先重启 Windows"
    return 1
  fi
  info "模拟器窗口已拉起（关掉窗口 / just harmony-emulator --stop 可停）"
}

# 装包：先试 hdc install，不行再 file send + bm install（老版本 hdc 没有 install）
install_hap() {
  local hap="$1" win
  win="$(tool_path "$hap")"
  if hdc install -r "$win" >/dev/null 2>&1; then
    info "已安装：$(basename "$hap")"
    return 0
  fi
  warn "hdc install 失败，改用 bm install 兜底"
  hdc file send "$win" /data/local/tmp/daily-poetry.hap >/dev/null || return 1
  hdc shell bm install -p /data/local/tmp/daily-poetry.hap
}

find_hap() {
  local dir="$HARMONY/entry/build/default/outputs/default"
  [ -d "$dir" ] || return 1
  if [ -f "$dir/entry-default-signed.hap" ]; then
    printf '%s' "$dir/entry-default-signed.hap"
  elif [ -f "$dir/entry-default-unsigned.hap" ]; then
    printf '%s' "$dir/entry-default-unsigned.hap"
  else
    ls "$dir"/*.hap 2>/dev/null | head -1
  fi
}

# ------------------------------------------------------------------ 构建
hv_build() { # $1 = debug | release
  local mode="$1" args
  [ -n "${HVIGORW:-}" ] || die "没找到 hvigorw.js（先 just harmony-doctor）"
  [ -n "${DEVECO_NODE:-}" ] || die "没找到 node（hvigor 要用 DevEco 自带的那份）"
  args="--mode module -p product=default -p module=entry@default -p buildMode=$mode assembleHap --no-daemon"
  step "hvigor assembleHap（$mode）"
  if on_wsl; then
    win_run "$HARMONY" "\"$(to_win "$DEVECO_NODE")\" \"$(to_win "$HVIGORW")\" $args"
  else
    (cd "$HARMONY" && "$DEVECO_NODE" "$HVIGORW" $args)
  fi
}

bundle_harmony() { # $1 = true | false（dev）
  step "打 JS bundle（--dev $1）→ harmony/entry/src/main/resources/rawfile/"
  # 入口是根目录的 index.js（RNOH 把 Metro URL 写死成 /index.bundle，见 index.js 的注释）
  if ! env "$METRO_ENV" npx react-native bundle-harmony --dev "$1"; then
    warn "bundle-harmony 失败"
    harmony_port_note
    return 1
  fi
}

# 鸿蒙侧生态没跟上时最常见的失败（解析不到 .harmony/.native 文件、缺 TurboModule）
harmony_port_note() {
  warn "—— 如果报的是 'Unable to resolve module' 或缺三方原生模块，那是鸿蒙移植还没做："
  warn "   expo-sqlite 没有鸿蒙版（诗词库全靠它）、react-native-screens 4.x 只发了"
  warn "   .android/.ios 文件、reanimated 4 / gesture-handler 2 也远高于 @react-native-oh-tpl 的版本。"
  warn "   详见 tool/harmony-template/README.md 的「没做的部分」。"
}

# ------------------------------------------------------------------ Metro
metro_running() {
  curl -s -m 1 http://127.0.0.1:8081/status 2>/dev/null | grep -q 'packager-status:running'
}

start_metro() {
  mkdir -p "$WORK"
  if metro_running; then
    info "8081 上已经有 Metro 在跑（复用）"
    return 0
  fi
  step "起 Metro（harmony 平台，日志 .data/harmony/metro.log）"
  nohup env "$METRO_ENV" npx react-native start --port 8081 \
    >"$WORK/metro.log" 2>&1 &
  echo $! >"$WORK/metro.pid"
  local i
  for i in $(seq 1 60); do
    metro_running && {
      info "Metro 就绪（pid $(cat "$WORK/metro.pid")）"
      return 0
    }
    sleep 1
  done
  warn "Metro 60s 没起来，看 .data/harmony/metro.log"
  return 1
}

# ------------------------------------------------------------------ 子命令
cmd_doctor() {
  echo "—— 工程 ——"
  local f
  for f in metro.config.js react-native.config.js index.js; do
    if [ -f "$ROOT/$f" ]; then info "✓ $f"; else info "✗ 缺 $f（它在仓库里，别删）"; fi
  done
  if [ -f "$HARMONY/build-profile.json5" ]; then
    info "✓ harmony/ 工程已生成"
  else
    info "✗ 还没生成 harmony/（跑 just harmony-setup）"
  fi
  local v
  v="$(harmony_version 2>/dev/null)" || v=""
  if [ -n "$v" ]; then
    info "RNOH 版本：$v（对应 RN $(rn_version)）"
    if rnoh_installed "$v"; then
      info "✓ RNOH npm 依赖已装"
    else
      info "✗ RNOH npm 依赖没装（跑 just harmony-setup）"
    fi
  else
    info "✗ 查不到 RNOH 版本（网络？）"
  fi
  if [ -d "$HARMONY/oh_modules/@rnoh/react-native-openharmony" ]; then
    info "✓ oh_modules 里已有 @rnoh/react-native-openharmony"
  else
    info "✗ oh_modules 还没拉 har（just harmony-setup 会跑 ohpm install）"
  fi
  echo
  info "提示：签名要在 DevEco 里配（File > Project Structure > Signing Configs 勾自动签名，"
  info "      需登录华为账号）。没签名只能装模拟器 / 开发者模式的真机。"
  harmony_port_note
  echo
  info "下一步：just harmony-emulator（没设备就起模拟器）｜just harmony（编译 + 装机）"
}

cmd_setup() {
  local force=""
  case "${1:-}" in
    -f | --force) force="--force" ;;
  esac
  ensure_rnoh

  if [ -f "$HARMONY/build-profile.json5" ] && [ -z "$force" ]; then
    info "harmony/ 已存在，跳过生成（要重来：tool/harmony.sh setup --force）"
    # 只认带引号的键值：模板第一行注释里也有“compatibleSdkVersion”这几个字，
    # 按 `compatibleSdkVersion[^,]*` 抓会先命中最上面那行注释（拿到的是键名本身）。
    sdk_in_project="$(grep -o '"compatibleSdkVersion"[[:space:]]*:[[:space:]]*"[^"]*"' "$HARMONY/build-profile.json5" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
    if [ -n "${HARMONY_SDK_VERSION:-}" ] && [ "$sdk_in_project" != "$HARMONY_SDK_VERSION" ]; then
      warn "harmony/ 里的 compatibleSdkVersion=$sdk_in_project 跟本机 SDK=$HARMONY_SDK_VERSION 不一致"
      warn "换 SDK 后要 just harmony-setup --force（签名得在 DevEco 里重配）"
    fi
  else
    render_project $force || die "生成 harmony/ 失败"
  fi

  mkdir -p "$HARMONY/entry/src/main/resources/rawfile"

  if [ -d "$HARMONY/oh_modules/@rnoh/react-native-openharmony" ] && [ -z "$force" ]; then
    info "oh_modules 已就绪，跳过 ohpm install"
  else
    ohpm_install || warn "跳过 ohpm install —— harmony/ 里还没有 har，构建会失败"
  fi

  echo
  info "下一步：just harmony（编译 + 装设备 + 起 Metro）｜just hap（Release 包）"
}

cmd_start() {
  ensure_rnoh
  step "Metro（Ctrl-C 结束）"
  exec env "$METRO_ENV" npx react-native start --port 8081
}

cmd_run() {
  ensure_rnoh
  [ -f "$HARMONY/build-profile.json5" ] || render_project || die "生成 harmony/ 失败"
  ensure_device
  start_metro || warn "Metro 没起来，装上去也是白屏 —— 另开一个终端跑 just harmony-start"

  step "端口转发（Metro 8081）"
  hdc rport tcp:8081 tcp:8081 >/dev/null 2>&1 || warn "hdc rport 失败（模拟器可能不需要）"

  hv_build debug || die "hvigor 构建失败（细节看 DevEco 的 Build 输出，或 .data/harmony/run.bat 里那条命令）"
  local hap
  hap="$(find_hap)" || die "没找到产物 .hap（看 harmony/entry/build/default/outputs/default/）"
  install_hap "$hap" || die "装包失败（多半是没签名：DevEco 里配 Signing Configs 后重来）"

  local bundle
  bundle="$(grep -o '"bundleName"[^,]*' "$HARMONY/AppScope/app.json5" | head -1 | sed 's/.*"\([^"]*\)"$/\1/')"
  [ -n "$bundle" ] || die "读不到 bundleName（harmony/AppScope/app.json5 被改过？）"
  step "拉起应用（$bundle）"
  hdc shell aa force-stop "$bundle" >/dev/null 2>&1
  hdc shell aa start -a EntryAbility -b "$bundle" >/dev/null || die "aa start 失败"
  info "已拉起。热加载：改 JS 自动刷新；原生改动重跑 just harmony"
  info "日志：just harmony-log"
}

cmd_hap() {
  local soft=""
  case "${1:-}" in
    --soft) soft=1 ;;
  esac
  if [ -z "${DEVECO_HOME:-}" ] || [ -z "${HVIGORW:-}" ]; then
    if [ -n "$soft" ]; then
      warn "没装 DevEco Studio，跳过 HAP（装好后 just hap）"
      return 0
    fi
    die "没装 DevEco Studio（just harmony-doctor 看缺什么）"
  fi
  ensure_rnoh
  [ -f "$HARMONY/build-profile.json5" ] || render_project || die "生成 harmony/ 失败"
  [ -d "$HARMONY/oh_modules/@rnoh/react-native-openharmony" ] || ohpm_install || die "ohpm install 失败"

  bundle_harmony false || die "bundle-harmony 失败"
  hv_build release || die "hvigor 构建失败"
  local hap ver vc out
  hap="$(find_hap)" || die "没找到 .hap 产物"
  ver="$(app_field version)"
  vc="$(app_field android.versionCode)"
  [ -n "$vc" ] || vc="1"
  out="$DIST/daily-poetry-${ver}-${vc}.hap"
  mkdir -p "$DIST"
  cp "$hap" "$out"
  step "产物"
  info "$out（$(du -h "$out" | cut -f1)）"
  case "$(basename "$hap")" in
    *unsigned*) warn "这是**未签名**的包：真机要 DevEco 里配 Signing Configs 重打，模拟器 / 开发者模式可直接装" ;;
  esac
  if [ -n "${HDC:-}" ]; then
    local devs
    devs="$(devices)"
    [ -n "$devs" ] && install_hap "$out" && info "已覆盖安装到设备"
  fi
}

cmd_log() {
  require_device
  local filter="${*:-ReactNativeJS|RNOH|rnoh}"
  step "hilog（Ctrl-C 结束，过滤：$filter）"
  hdc hilog | grep -Ei "$filter"
}

cmd_emulator() {
  local name="" stop="" list="" a
  for a in "$@"; do
    case "$a" in
      -l | --list) list=1 ;;
      -s | --stop) stop=1 ;;
      -h | --help)
        sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
        return 0
        ;;
      *) name="$a" ;;
    esac
  done
  [ -n "${HVD_EMULATOR:-}" ] || die "没找到模拟器 Emulator.exe（DevEco 5.0+ 才有；先 just harmony-doctor）"

  if [ -n "$list" ]; then
    info "模拟器：$HVD_EMULATOR"
    info "实例目录：${HVD_HOME:-（没找到）}"
    info "系统镜像：${HVD_IMAGE_ROOT:-（没找到）}"
    hvd_list | while IFS= read -r a; do
      [ -n "$a" ] && info "· $a（$(du -sh "${HVD_HOME:-/nonexistent}/$a" 2>/dev/null | cut -f1)）"
    done
    return 0
  fi

  if [ -n "$stop" ]; then
    [ -n "$name" ] || name="$(hvd_default)" || name=""
    [ -n "$name" ] || die "没有可停的实例（just harmony-emulator --list 看看）"
    step "停止模拟器：$name"
    "$HVD_EMULATOR" -stop "$name" 2>&1 | tr -d '\r' | sed 's/^/  /'
    local i=0
    while [ -n "$(devices)" ] && [ "$i" -lt 20 ]; do
      sleep 1
      i=$((i + 1))
    done
    info "已停止"
    return 0
  fi

  [ -n "$name" ] || name="$(hvd_default)" || name=""
  if [ -n "$(devices)" ]; then
    info "已经有设备在线：$(devices | tr '\n' ' ')（不重复起）"
    [ -n "$name" ] && info "要换成模拟器 $name：just harmony-emulator --stop 再起"
    return 0
  fi
  start_emulator "$name" || return 1
  step "等系统起完（hdc 先连上，再等 bootevent.boot.completed；首次开机 1-2 分钟）"
  WATCH_EMU=1 wait_device 300
  case "$?" in
    0)
      info "设备就绪：$(devices | tr '\n' ' ')"
      info "下一步：just harmony（编译 + 装机 + 热加载）｜just harmony-log 看日志"
      ;;
    2)
      warn "模拟器中途退出了（进程已经不在）"
      warn "日志：${HVD_HOME:-<实例目录>}/$name/Emulator.log"
      return 1
      ;;
    *)
      warn "5 分钟没等到就绪的设备"
      warn "模拟器自己的日志：${HVD_HOME:-<实例目录>}/$name/Emulator.log"
      warn "Device Manager 能起而这里起不来时，检查系统镜像是否已下载完（imageDeployPath）"
      return 1
      ;;
  esac
}

# 装 / 跑之前调它：没设备就自动拉模拟器（而不是直接报错让人切 GUI）
ensure_device() {
  local devs
  devs="$(devices)" || die "没找到 hdc（先 just harmony-doctor）"
  if [ -n "$devs" ]; then
    info "设备：$(echo "$devs" | tr '\n' ' ')"
    return 0
  fi
  if [ -n "${HVD_EMULATOR:-}" ] && [ -n "$(hvd_list)" ]; then
    info "没有在线设备，自动起模拟器"
    cmd_emulator || die "模拟器没起来（just harmony-emulator --list 看实例）"
    return 0
  fi
  die "没有在线鸿蒙设备：just harmony-emulator 起模拟器，或插真机开 USB 调试"
}

cmd_clean() {
  step "清构建产物"
  rm -rf "$HARMONY/entry/build" "$HARMONY/build" "$HARMONY/entry/.preview" "$HARMONY/.hvigor" "$HARMONY/oh_modules/.cache"
  info "保留 harmony/ 工程与 oh_modules"
}

case "${1:-}" in
  doctor) cmd_doctor ;;
  setup) shift; cmd_setup "$@" ;;
  emulator | emu) shift; cmd_emulator "$@" ;;
  start) cmd_start ;;
  run) cmd_run ;;
  hap) shift; cmd_hap "$@" ;;
  log) shift; cmd_log "$@" ;;
  clean) cmd_clean ;;
  bundle) shift; bundle_harmony "${1:-false}" ;;
  '')
    sed -n '2,16p' "$0" | sed 's/^# \{0,1\}//'
    ;;
  *)
    die "未知子命令：$1（doctor / setup / emulator / start / run / hap / log / clean）"
    ;;
esac
