#!/usr/bin/env bash
# iOS 出包入口：本地 .ipa（macOS + Xcode）或 EAS 云端出包（Windows / WSL 也能跑）。
#
#   bash tool/ios.sh ipa            # macOS：prebuild（缺 ios/ 时）+ 归档 → dist/*.ipa
#   bash tool/ios.sh ipa --soft     # 非 macOS 时只提示、不报错（给 `just pkg` 用）
#   bash tool/ios.sh eas            # EAS Build 云端打 .ipa，成功后下载到 dist/
#
# 为什么本地 ipa 是「未签名」的：Windows / 没有开发者证书的 macOS 都签不了名。
# 归档时关掉 code signing（CODE_SIGNING_ALLOWED=NO），再把 .xcarchive 里的 .app
# 塞进 Payload/ 打成 .ipa —— 这就是 AltStore / Sideloadly 那类自签工具认的格式。
# 要**能直接装**的包（ad-hoc / App Store）就走 `just ipa-eas`：签名和凭证都在云端。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

info() { printf '  %s\n' "$*"; }
die() { printf '✗ %s\n' "$*" >&2; exit 1; }

DIST="$ROOT/dist"

# 从 app.json 读一个字段（版本号 / 构建号）；读不到就给个兜底，别让文件名变成空的
app_field() {
  node -p "const a = require('./app.json').expo; String($1)" 2>/dev/null || printf '0'
}

# 产物文件名：daily-poetry-<version>-b<buildNumber>.ipa（dist/ 已在 .gitignore 里）
ipa_name() {
  printf 'daily-poetry-%s-b%s.ipa' "$(app_field 'a.version')" "$(app_field 'a.ios.buildNumber || 1')"
}

cmd_ipa() {
  local soft="${1:-}"

  if [ "$(uname -s)" != "Darwin" ]; then
    if [ "$soft" = "--soft" ]; then
      info "跳过 IPA：本地打 .ipa 需要 macOS + Xcode（当前是 $(uname -s)），要 iOS 包跑 just ipa-eas"
      return 0
    fi
    printf '✗ 本地打 .ipa 需要 macOS + Xcode（当前是 %s）。\n' "$(uname -s)" >&2
    printf '  这台机器上可以走云端：just ipa-eas（EAS Build，需 expo 账号 + Apple 凭证）\n' >&2
    return 1
  fi

  command -v xcodebuild >/dev/null 2>&1 \
    || die "没找到 xcodebuild。装好 Xcode 后跑：sudo xcode-select -s /Applications/Xcode.app"

  if [ ! -d ios ]; then
    info "ios/ 不存在（prebuild 产物不入库），先生成…"
    npx expo prebuild -p ios --clean || die "prebuild 失败"
  fi

  local ws scheme arch="$ROOT/build/ios"
  ws="$(ls -d ios/*.xcworkspace 2>/dev/null | head -1)"
  [ -n "$ws" ] || die "没找到 ios/*.xcworkspace（prebuild 没跑完？）"
  scheme="$(basename "$ws" .xcworkspace)"

  rm -rf "$arch"
  mkdir -p "$arch"
  info "归档 Release（关掉签名）：scheme=$scheme"
  xcodebuild -workspace "$ws" -scheme "$scheme" -configuration Release -sdk iphoneos \
    -archivePath "$arch/app.xcarchive" \
    CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY="" \
    archive 2>&1 | tail -n 8

  local app
  app="$(ls -d "$arch/app.xcarchive/Products/Applications/"*.app 2>/dev/null | head -1)"
  [ -n "$app" ] || die "归档里没有 .app（构建失败？完整日志在 xcodebuild 输出里）"

  # .ipa 就是一个只含 Payload/<名字>.app 的 zip
  rm -rf "$arch/Payload"
  mkdir -p "$arch/Payload" "$DIST"
  cp -R "$app" "$arch/Payload/"

  local out="$DIST/$(ipa_name)"
  rm -f "$out"
  ( cd "$arch" && zip -qry "$out" Payload ) || die "打包 zip 失败"

  info "产物：dist/$(ipa_name)（$(du -h "$out" | cut -f1)）"
  info "未签名：装到设备要自签（AltStore / Sideloadly）；正式签名走 just ipa-eas"
}

cmd_eas() {
  command -v npx >/dev/null 2>&1 || die "没找到 npx"

  info "EAS Build 云端打 iOS（profile=preview，internal 分发 → ad-hoc .ipa）…"
  local json url out
  json="$(mktemp)"
  if ! npx --yes eas-cli build --platform ios --profile preview --non-interactive --wait --json > "$json"; then
    rm -f "$json"
    die "EAS 构建失败。没登录就先 npx eas-cli login；iOS 还需在 EAS 项目里配 Apple 凭证"
  fi

  url="$(node -e '
    let s = "";
    process.stdin.on("data", (d) => (s += d)).on("end", () => {
      try {
        const j = JSON.parse(s);
        const b = Array.isArray(j) ? j[0] : j;
        console.log(b?.artifacts?.buildUrl || "");
      } catch {
        console.log("");
      }
    });
  ' < "$json")"
  rm -f "$json"

  if [ -z "$url" ]; then
    info "云端已出包，但没有拿到下载链接：去 https://expo.dev 的 Builds 页下 .ipa"
    return 0
  fi

  mkdir -p "$DIST"
  out="$DIST/$(ipa_name)"
  info "下载 $url"
  curl -fL --progress-bar -o "$out" "$url" || die "下载失败，去 expo.dev 手动下"
  info "产物：dist/$(ipa_name)（$(du -h "$out" | cut -f1)）"
}

case "${1:-ipa}" in
  ipa) shift; cmd_ipa "${1:-}" ;;
  eas | cloud) cmd_eas ;;
  *)
    printf '用法：bash tool/ios.sh [ipa [--soft]|eas]\n' >&2
    exit 2
    ;;
esac
