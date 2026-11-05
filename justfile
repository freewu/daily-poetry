# 每日诗词 — 开发工作流
# 说明：Windows WSL 下若 node/npm 不在默认 PATH，先执行
#   export PATH="$HOME/.local/bin:$PATH"

# 显式指定 POSIX shell：Windows 上 just 默认会摸到 Cygwin 的 sh（D:\env\cygwin64），
# 它看不见 nvm-windows 的 junction（/cygdrive/d/env/nodejs），于是 npm 变成 127。
# 固定用 bash 后，PowerShell 里会落到 system32\bash.exe（= WSL），PATH 正常翻译成 /mnt/…。
set shell := ["bash", "-uc"]

# 默认目标：裸跑 `just` 就列出全部命令（不再是 init）
[private]
default:
    @just --list

# 一键初始化：安装依赖 + 下载语料 + 构建数据库 + 生成图标
init: deps data db assets
    @echo "初始化完成 🎉 运行 just start 开始开发"

# 安装 npm 依赖
deps:
    npm install

# 判“已存在”时点名抽查几块语料：只看目录会在旧语料上一直 skip，
# 于是 build-db 静默地「缺哪块跳哪块」（宋词 / 元曲就是这么“没”的）。
# 主体语料在 chinese-poetry 仓库（sparse clone）；乐府诗集 / 宋词三百首 不在里面，
# 由 fetch-yuefu / fetch-songci300 从维基文库抓，缓存在 .data/yuefu、.data/songci300。

# 下载主体语料 + 乐府诗集 / 宋词三百首
data:
    test -f .data/chinese-poetry/宋词/ci.song.0.json && test -f .data/chinese-poetry/元曲/yuanqu.json && test -f .data/chinese-poetry/全唐诗/poet.tang.0.json && echo "语料已存在，跳过下载" || bash scripts/fetch-corpus.sh standard
    node scripts/fetch-yuefu.mjs
    node scripts/fetch-songci300.mjs

# 下载全部语料（再含古文观止 / 幽梦影 / 论语 / 四书 / 蒙学）
data-full:
    bash scripts/fetch-corpus.sh full
    node scripts/fetch-yuefu.mjs
    node scripts/fetch-songci300.mjs

# 顺带生成预统计 assets/stats.json（作者 / 词牌；页面读它，不现算 SQL）

# 构建 SQLite 数据库 → assets/poetry.db（约 9.5 万首，简繁双写，约 59MB）
db: deps data
    node scripts/build-db.mjs
    node scripts/build-stats.mjs

# 构建完整语料库（再加杂项，约 9.2 万首）
db-full: deps data-full
    node scripts/build-db.mjs --full
    node scripts/build-stats.mjs

# 校验已有数据库（不重建）
dbcheck:
    node scripts/build-db.mjs --check
    node scripts/build-stats.mjs --check

# 重新生成品牌图标 / 启动图 / 底栏图标（印章取自根目录 logo.png，换图后跑一遍）
assets:
    python3 scripts/make-assets.py

# 全套检查：数据库 + 类型检查 + ESLint + 测试
check:
    test -f assets/poetry.db || just db
    just dbcheck
    npx tsc --noEmit
    npx expo lint
    npx jest

# 单元 / 组件测试（Jest + jest-expo，可按名字过滤：just test 农历）
test *args:
    npx jest {{args}}

# 覆盖率报告（输出到 coverage/）
test-cov:
    npx jest --coverage

# Android 工具链自检：SDK / adb / 模拟器 / 在线设备 / JDK17 / ccache / Maestro
android-doctor:
    bash tool/android.sh doctor

# WSL 里没有 adb 时下载 Linux platform-tools（约 10MB）
android-setup:
    bash tool/android.sh setup

# 启动 Android 模拟器并等到开机完成；可指定 AVD：just emulator Pixel_8
emulator avd="":
    bash tool/android.sh boot {{avd}}

# Debug 包的 JS 是 Metro 现喂的（adb reverse 8081）：拔线 / 关 just start 打开就是白屏。

# 构建并安装 Debug 包到模拟器 / 真机（首次会下载 Gradle 依赖）
android-install:
    bash tool/android.sh install

# 本地用模板的 debug.keystore 签名，够自用；上架仍走 EAS。

# 打**离线可用**的 Release APK → dist/daily-poetry-<版本>-vc<N>.apk（设备在线时顺带覆盖安装）
apk: check
    bash tool/android.sh apk

# 其它平台只提示，真出包走 just ipa-eas

# 打 iOS .ipa → dist/：macOS 本地归档（未签名，AltStore / Sideloadly 自签可装）
ipa: check
    bash tool/ios.sh ipa

# 用 EAS Build 云端打 .ipa（Windows / WSL 也能跑；需 expo 账号 + Apple 凭证），下完收进 dist/
ipa-eas:
    bash tool/ios.sh eas

# 一次出两个包到 dist/：APK 本地打，IPA 本地（macOS）或跳过并提示走 just ipa-eas
pkg: check
    bash tool/android.sh apk
    bash tool/ios.sh ipa --soft

# Maestro E2E：just e2e 跑全部，或 just e2e .maestro/01-today.yaml 跑单个
e2e *args:
    bash tool/android.sh e2e {{args}}

# 环境自检
envcheck:
    @echo "node:    $(command -v node || echo 缺失)"
    @node -v 2>/dev/null || true
    @echo "npm:     $(command -v npm || echo 缺失)"
    @npm -v 2>/dev/null || true
    @echo "python3: $(command -v python3 || echo 缺失)"
    @node -e "console.log('node:sqlite:', typeof require('node:sqlite').DatabaseSync)" 2>/dev/null || echo "node:sqlite: 不可用（需要 Node 22.5+）"
    @echo "—— 原生构建前置（Gradle 跑在 Windows 侧）——"
    @bash tool/android.sh doctor

# 启动开发服务器
start:
    npx expo start

# 改图标 / 启动图 / app.json 原生配置后必跑，再 just android

# 重生成原生工程（android/ ios/ 都是 prebuild 产物，不入库）
native-reset:
    rm -rf android ios
    npx expo prebuild --clean

# 注意：android/ 已存在时 expo run 不会重跑 prebuild，图标 / 启动图改了要 just native-reset

# 在 Android 模拟器/真机启动（原生 Debug 构建 + Metro）
android: check
    npx expo run:android

# 在 iOS 模拟器启动（仅 macOS）
ios: check
    npx expo start --ios

# 打 JS bundle（验证打包与资源）
export: check
    npx expo export --platform android --output-dir dist

# 打包提示：本地出包用 just pkg（APK + IPA）/ just apk / just ipa，上架用 EAS
build:
    @echo "本地出包：just pkg（APK + IPA）｜只要安卓：just apk｜只要 iOS：just ipa 或 just ipa-eas"
