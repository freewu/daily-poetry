# 每日诗词 · Daily Poetry

一款安静、克制的“每日一诗”移动应用 —— 用 React Native (Expo SDK 57) 构建，
内置离线诗词库，每天推给你一首应景的诗。

> 同一日期，无论何时打开，都会遇见同一首诗 —— 推送算法与日期一一对应、完全可复现。

## 特性

- **每日一诗**：从精选池（唐诗三百首、千家诗、诗经、楚辞、花间集、南唐词，共 1396 首）
  按日期确定性轮换；可前后翻看任意一天的诗篇。
- **农历 / 干支 / 节气**：首页同步显示当日农历与干支年；恰逢传统节日或二十四节气时，
  以「应景优先」推送模式自动换上一首节日诗（《元日》《清明》《中秋月》《九月九日忆山东兄弟》…），
  同年稳定、次年轮换；也可保持「经典轮换」。
- **朗读**：系统 TTS 以中文朗读整首诗（题目、作者、正文），可随时停止。
- **诗词库**：全唐诗 57599 · 全宋词 21049 · 元曲 10906 · 诗经 / 楚辞 / 五代诗词 / 唐诗三百首 / 千家诗，
  合计约 9.1 万首，支持按题目、作者、诗句全文搜索（简体、繁體都能搜到）。
- **收藏 / 复制**：喜欢就点亮红心，一键复制全文（含出处落款）。
- **离线优先**：全部语料打进一个 SQLite 数据库随应用发布（`.db` asset），无需联网。
- **简繁切换**：每首诗同时收录简体与繁體两套正文（设置 → 正文字体），繁体保留语料原文，
  简体由 OpenCC 转写；朗读、复制、列表预览都跟着切换。
- **纸墨主题**：宣纸底、朱砂印、楷体图标；浅色 / 深色 / 跟随系统。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 框架 | React Native 0.86 · Expo SDK 57 · expo-router（Stack + NativeTabs） |
| 存储 | `expo-sqlite`（SQLiteProvider + assetSource 内置库） |
| 农历 | `lunar-javascript`（节气 / 节日 / 干支换算） |
| 朗读 | `expo-speech`（系统 TTS） |
| 构建 | Node ≥22 `node:sqlite`（`DatabaseSync`）、OpenCC-js、Python/Pillow（图标） |
| 工作流 | `just` |

## 目录结构

```
assets/               应用图标 / 启动图 / 底栏图标（由脚本生成）
  poetry.db           SQLite 诗词库（构建产物，不入库）
scripts/
  fetch-corpus.sh     下载 chinese-poetry 语料（sparse + blob:none）
  build-db.mjs        语料 → poetry.db（适配各 JSON 结构、简繁转换、索引）
  make-assets.py      品牌图标（楷体「诗」印）/ 启动图 / 底栏图标
src/
  app/                expo-router 路由（(tabs) + poem/[id] + collection/[id]）
  components/         诗卡 / 诗文渲染 / 列表行 / 顶栏 / 操作栏
  lib/                db.ts（查询与每日算法）· format.ts · types.ts
  theme.tsx           纸墨双主题（浅色 / 深色 / 跟随系统）
__tests__/            Jest 单元 / 组件测试（纯 Node，无需模拟器）
.maestro/             Maestro E2E 流程（真机 / 模拟器）
tool/
  android-env.sh      adb / emulator / Maestro 环境探测
  android.sh          doctor · setup · boot · install · e2e
justfile              常用开发命令
```

## 快速开始

前置：`git`、Node ≥ 22.5（自带 `node:sqlite`）、npm、[`just`](https://github.com/casey/just)、
Python3 + Pillow（仅生成图标需要）。系统情况：`just envcheck`

终端：**WSL 里直接跑，或在 Windows 的 PowerShell / CMD 里跑**都行 ——
`justfile` 固定了 `set shell := ["bash", "-uc"]`，Windows 上会落到
`C:\Windows\System32\bash.exe`（即 WSL），`node` / `npm` 由 WSL 的 PATH 解析。
（不要指望 just 自己找的 Cygwin `sh`：它看不见 nvm-windows 的 junction
`/cygdrive/d/env/nodejs`，`npm install` 会以 127 失败。）

WSL 里若 node/npm 不在默认 PATH，先执行：

```bash
export PATH="$HOME/.local/bin:$PATH"
```

> 在 PowerShell 里跑时，每行命令前面可能多出一行
> `wsl: 无法配置网络 (networkingMode Nat)…` —— 那是 WSL 自身的启动告警
> （`.wslconfig` 的 networkingMode + localhost 代理），与配方无关，不影响执行。
> 想消掉：把 `.wslconfig` 改成 `networkingMode=mirrored`，或去掉 localhost 代理配置。

```bash
# 一键初始化：装依赖 → 下语料 → 建库 → 生成图标
just init

# 启动开发服务器（Expo Go / 模拟器扫码）
just start
```

手动分步：

```bash
just envcheck # 先看 node / npm / python3 / node:sqlite 是否就绪
just deps     # npm install
just data     # 下载主体语料（约 45MB，sparse clone + 按需取全唐诗）
just db       # 构建 assets/poetry.db（约 9.1 万首，简繁双写，约 56MB）
just assets   # 重新生成图标（可选）

just db-full  # 再加杂项语料：古文观止 222 / 纳兰 258 / 曹操 / 幽梦影 / 论语 / 四书 / 蒙学等（约 60MB）
```

完整配方：

| 配方 | 说明 |
| --- | --- |
| `just data` / `data-full` | 下载语料（sparse clone；全唐诗按需取唐诗部分） |
| `just db` / `db-full` | 构建 `assets/poetry.db`（简繁双写） |
| `just dbcheck` | 只校验已有数据库 |
| `just check` | DB 校验 + `tsc` 类型检查 + `expo lint` + `jest` |
| `just test [模式]` | 单元 / 组件测试，如 `just test 农历` |
| `just test-cov` | 覆盖率报告（`coverage/`） |
| `just start` | 启动 Expo dev server |
| `just android` / `ios` | 原生 Debug 构建并在设备上启动 |
| `just emulator [avd]` | 启动模拟器并等到开机完成 |
| `just android-install` | 构建 Debug 包并安装到设备 |
| `just e2e [流程]` | 跑 Maestro E2E（全部或单条 `.maestro/*.yaml`） |
| `just android-doctor` | Android 工具链自检（SDK / adb / 设备 / Maestro） |
| `just export` | 打 Android JS bundle 至 `dist/`（验证打包） |
| `just build` | 提示使用 EAS Build 出真机安装包 |
| `just envcheck` | 环境自检 |

> 真机安装包使用 [EAS Build](https://docs.expo.dev/eas/)（配置见 `eas.json`）：
>
> ```bash
> npx eas-cli login
> npx eas-cli build --platform android --profile preview   # 内部测试 APK
> npx eas-cli build --platform android --profile production # 上架 AAB，版本号自增
> ```
>
> 构建会自动带上 `assets/poetry.db`（已在 `metro.config.js` 注册 `db` 为资源类型）。
> iOS 云构建需在 EAS 项目设置中配置 Apple 凭证。

## 测试

两层，互补：

**① 单元 / 组件测试（Jest + jest-expo）** —— 跑在 Node 上，不用模拟器。
原生模块在 `jest.setup.ts` 里换成内存实现（SQLite / speech / clipboard / router），
`__tests__/helpers/memory-db.ts` 用一个纯 JS 的内存库承接真实 SQL，
所以 `src/lib/db.ts` 的查询语句本身也被覆盖。

```bash
just test            # 全量（约 5s）
just test 农历       # 按文件名 / 用例名过滤
just test-cov        # 生成 coverage/lcov.info
```

覆盖范围：`format`（繁简 / 断句）、`lunar`（节气 / 干支 / 节日应景）、`db`（每日算法、
搜索、收藏）、`script`（简繁取字段）、`db-bootstrap`（换库时保留收藏 / 足迹）、
`assets/poetry.db`（构建产物结构校验）、`theme`（跟随系统 / 持久化），
以及路由骨架（入口重定向、根布局、底栏）与五个屏幕、诗文 / 操作栏组件。
当前：15 套件 / 123 用例，语句覆盖 ~95%、行覆盖 ~98%。

**② E2E（Maestro）** —— 真机或模拟器上的冒烟流程，断言用的是组件 `testID`：

```bash
just android-doctor   # 先确认 adb / 设备 / maestro 都在
just emulator         # 需要的话先起模拟器
just android-install  # 装 Debug 包（首次会拉 Gradle 依赖）
just start            # 另开一个终端跑 Metro
just e2e              # 跑 .maestro 下全部流程，或 just e2e .maestro/01-today.yaml
```

WSL 下注意：模拟器是 Windows 程序，由 Windows 侧启动；WSL 里的 adb 客户端连
Windows 的 adb server（见 `tool/android-env.sh`）。缺 adb 时 `just android-setup`
会下载 Linux platform-tools。

## 数据说明

- 语料：[chinese-poetry/chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)（MIT），
  均为公版古典文本；花间集序（欧阳炯《序》）不收入正文。
- 简繁双写：语料本身就是繁体的（全唐诗、全宋词、元曲、五代诗词、诗经、楚辞）原样存进 `*_tw` 列，
  简体列由 OpenCC `t → cn` 转写；简体源（唐诗三百首、千家诗、蒙学…）反过来用 `cn → tw` 生成繁体。
  因此繁體是原文、简体是转写，两种字体都不需要运行时转换库；检索时两列一起 LIKE。
- 换库：`meta.schema_version` 与 App 内的 `DB_SCHEMA_VERSION` 不一致时，启动会把随包库整份覆盖，
  覆盖前先把收藏 / 足迹按「题目 + 作者 + 首句」抄出来，新库落盘后按同样的键找回（见 `src/lib/db-bootstrap.ts`）。
- 每日算法：`dayNumber(date) = UTC 天数`，`offset = dayNumber % 精选池大小`，
  取 `daily=1` 且 `ORDER BY id` 的第 offset 首 —— 幂等、稳定。
- 应景算法：先按题目命中（明确主题作），题目无命中退到正文；命中池按“年”轮换
  （`year = floor(dayNumber / 365.2425)`），同一节日每年固定一首、次年换一首；
  无应景命中时回退经典轮换。应景日数据均来自 lunar-javascript（MIT）。
- “每日一诗”精选池固定为六部经典（1396 首）；全唐诗 / 全宋词 / 元曲等全量语料
  只在「诗词库」里检索与收藏，不参与每日轮换（否则每天一首的节奏会被稀释）。

## 路线图

- [x] 农历 / 干支 / 节气显示与节日应景推送
- [x] 朗读（系统 TTS）
- [ ] 注音译注 —— chinese-poetry 语料不含译注；需要额外引入注音（如 pinyin-pro）与
      白话译注数据源后再做
- [x] EAS 云构建配置（`eas.json` + 应用标识就绪，登录 EAS 账号即可出包）
- [x] 测试：Jest 单元 / 组件测试（`just test`）+ Maestro E2E 冒烟（`just e2e`）

## License

MIT
