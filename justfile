# 每日诗词 — 开发工作流
# 说明：Windows WSL 下若 node/npm 不在默认 PATH，先执行
#   export PATH="$HOME/.local/bin:$PATH"
#
# 裸跑 `just` 按功能分类列出全部命令（just 按组名字典序排，所以组名带数字前缀）。
#
# 备注（`just --list` 不显示，细节见 AGENTS.md / README.md）：
#   · data 判「已存在」时点名抽查宋词 / 元曲 / 全唐诗：只看目录会在旧语料上一直 skip，
#     于是 build-db 静默地「缺哪块跳哪块」（宋词 / 元曲就是这么“没”的）。
#   · Debug 包的 JS 是 Metro 现喂的（adb reverse 8081）：拔线 / 关 just start 打开就是白屏，
#     要脱机验证就 apk。apk 用模板的 debug.keystore 签名，够自用，上架仍走 EAS。
#   · android/ 已存在时 expo run 不会重跑 prebuild —— 改图标 / 启动图 / app.json 原生配置后
#     先跑 native-reset。
#   · ipa 只有 macOS 能本地打且未签名（装设备要自签）；Windows / WSL 上走 ipa-eas。
#   · 毛泽东诗词没有可抓的 URL（知乎 403），语料是 data/mao-poems.json（跟着仓库走）；
#     要重做就把存档页放 .data/mao/mao.html 再跑 node scripts/fetch-mao.mjs。

# 显式指定 POSIX shell：Windows 上 just 默认会摸到 Cygwin 的 sh（D:\env\cygwin64），
# 它看不见 nvm-windows 的 junction（/cygdrive/d/env/nodejs），于是 npm 变成 127。
# 固定用 bash 后，PowerShell 里会落到 system32\bash.exe（= WSL），PATH 正常翻译成 /mnt/…。
set shell := ["bash", "-uc"]

# 默认目标：裸跑 `just` 就按分类列出全部命令（不再是 init）
[private]
default:
    @just --list

# ==================================================================== 1. 初始化

# 一键初始化：安装依赖 + 下载语料 + 构建数据库 + 生成图标
[group('1. 初始化')]
init: deps data db assets
    @echo "初始化完成 🎉 运行 just start 开始开发"

# 安装 npm 依赖
[group('1. 初始化')]
deps:
    npm install

# 环境自检：node / npm / python3 / node:sqlite + 安卓工具链
[group('1. 初始化')]
envcheck:
    @echo "node:    $(command -v node || echo 缺失)"
    @node -v 2>/dev/null || true
    @echo "npm:     $(command -v npm || echo 缺失)"
    @npm -v 2>/dev/null || true
    @echo "python3: $(command -v python3 || echo 缺失)"
    @node -e "console.log('node:sqlite:', typeof require('node:sqlite').DatabaseSync)" 2>/dev/null || echo "node:sqlite: 不可用（需要 Node 22.5+）"
    @echo "—— 原生构建前置（Gradle 跑在 Windows 侧）——"
    @bash tool/android.sh doctor

# 下载主体语料（sparse clone）+ 抓维基文库乐府诗集、古文岛宋词三百首
[group('1. 初始化')]
data:
    test -f .data/chinese-poetry/宋词/ci.song.0.json && test -f .data/chinese-poetry/元曲/yuanqu.json && test -f .data/chinese-poetry/全唐诗/poet.tang.0.json && echo "语料已存在，跳过下载" || bash scripts/fetch-corpus.sh standard
    node scripts/fetch-yuefu.mjs
    node scripts/fetch-songci300.mjs

# 下载全部语料（再含古文观止 / 幽梦影 / 论语 / 四书 / 蒙学）
[group('1. 初始化')]
data-full:
    bash scripts/fetch-corpus.sh full
    node scripts/fetch-yuefu.mjs
    node scripts/fetch-songci300.mjs

# 构建 SQLite 数据库 → assets/poetry.db（约 9.5 万首 / 14 部集子，简繁双写，约 60MB）+ 预统计 assets/stats.json
[group('1. 初始化')]
db: deps data
    node scripts/build-db.mjs
    node scripts/build-stats.mjs

# 构建完整语料库（再加古文观止 / 幽梦影 / 论语 / 四书 / 蒙学）
[group('1. 初始化')]
db-full: deps data-full
    node scripts/build-db.mjs --full
    node scripts/build-stats.mjs

# 校验已有数据库与预统计（不重建）
[group('1. 初始化')]
dbcheck:
    node scripts/build-db.mjs --check
    node scripts/build-stats.mjs --check

# 重新生成品牌图标 / 启动图 / 底栏图标（印章取自根目录 logo.png，换图后跑一遍）
[group('1. 初始化')]
assets:
    python3 scripts/make-assets.py

# ==================================================================== 2. 开发

# 启动 Expo dev server
[group('2. 开发')]
start:
    npx expo start

# 在 Android 模拟器 / 真机启动（原生 Debug 构建 + Metro）
[group('2. 开发')]
android: check
    npx expo run:android

# 在 iOS 模拟器启动（仅 macOS）
[group('2. 开发')]
ios: check
    npx expo start --ios

# 启动 Android 模拟器并等到开机完成；可指定 AVD：just emulator Pixel_8
[group('2. 开发')]
emulator avd="":
    bash tool/android.sh boot {{avd}}

# 构建并安装 Debug 包到模拟器 / 真机（首次会下载 Gradle 依赖）
[group('2. 开发')]
android-install:
    bash tool/android.sh install

# WSL 里没有 adb 时下载 Linux platform-tools（约 10MB）
[group('2. 开发')]
android-setup:
    bash tool/android.sh setup

# 重生成原生工程（android/ ios/ 都是 prebuild 产物，不入库）
[group('2. 开发')]
native-reset:
    rm -rf android ios
    npx expo prebuild --clean

# ==================================================================== 3. 检查

# 全套检查：数据库 + 预统计 + 类型检查 + ESLint + 测试
[group('3. 检查')]
check:
    test -f assets/poetry.db || just db
    just dbcheck
    npx tsc --noEmit
    npx expo lint
    npx jest

# 单元 / 组件测试（Jest + jest-expo，可按名字过滤：just test 农历）
[group('3. 检查')]
test *args:
    npx jest {{args}}

# 覆盖率报告（输出到 coverage/）
[group('3. 检查')]
test-cov:
    npx jest --coverage

# Maestro E2E：just e2e 跑全部，或 just e2e .maestro/01-today.yaml 跑单个
[group('3. 检查')]
e2e *args:
    bash tool/android.sh e2e {{args}}

# Android 工具链自检：SDK / adb / 模拟器 / 在线设备 / JDK17 / ccache / Maestro
[group('3. 检查')]
android-doctor:
    bash tool/android.sh doctor

# ==================================================================== 4. 打包

# 打**离线可用**的 Release APK → dist/daily-poetry-<版本>-vc<N>.apk（设备在线时顺带覆盖安装）
[group('4. 打包')]
apk: check
    bash tool/android.sh apk

# 打 iOS .ipa → dist/：macOS 本地归档（未签名，AltStore / Sideloadly 自签可装）
[group('4. 打包')]
ipa: check
    bash tool/ios.sh ipa

# 用 EAS Build 云端打 .ipa（Windows / WSL 也能跑；需 expo 账号 + Apple 凭证），下完收进 dist/
[group('4. 打包')]
ipa-eas:
    bash tool/ios.sh eas

# 一次出两个包到 dist/：APK 本地打，IPA 本地（macOS）或跳过并提示走 just ipa-eas
[group('4. 打包')]
pkg: check
    bash tool/android.sh apk
    bash tool/ios.sh ipa --soft

# 打 JS bundle 至 dist/（验证打包与资源是否齐全，不生成安装包）
[group('4. 打包')]
export: check
    npx expo export --platform android --output-dir dist

# 打包提示：本地出包用 just pkg（APK + IPA）/ just apk / just ipa，上架用 EAS
[group('4. 打包')]
build:
    @echo "本地出包：just pkg（APK + IPA）｜只要安卓：just apk｜只要 iOS：just ipa 或 just ipa-eas"
