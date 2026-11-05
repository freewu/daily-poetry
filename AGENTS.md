# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 原生构建前置（Windows）

`just android` 的 Gradle 构建跑在 Windows 侧（WSL 通过 `cmd.exe` 调 `gradlew.bat`），
失败时只看 `exit code 1` 没用，要翻 `%USERPROFILE%\.gradle\daemon\9.3.1\daemon-*.out.log`。
三个已知坑（`just android-doctor` / `just envcheck` 会自检前两个）：

1. **JDK 17**：`@react-native/gradle-plugin` 用 `jvmToolchain(17)` + foojay resolver，
   而 Gradle 不扫 IDEA 的 `%USERPROFILE%\jdks`，找不到就去 GitHub 自动下载（国内常卡死在
   0 字节 `.part` 上，配置阶段静默挂几十分钟）。解决：在 `%USERPROFILE%\.gradle\gradle.properties` 写
   `org.gradle.java.installations.paths=C:\\...\\jdk-17.x` 和
   `org.gradle.java.installations.auto-download=false`。
2. **Debug 包不能脱机用**：`just android` / `android-install` 装的是 Debug 变体，JS bundle
   **不在 APK 里**，启动时靠 `adb reverse tcp:8081` 向 Metro 要 —— 拔线 / 关 `just start` /
   手机重连 Wi-Fi 之后打开就只有「Unable to load script」或白屏（不是崩溃，也不是包的 bug）。
   要脱机验证就打 Release：`just apk`（`gradlew assembleRelease`，JS 打进包里；
   `android/app/build.gradle` 的 release 用模板自带的 `debug.keystore` 签名，
   所以能直接 `adb install -r` 覆盖装上去，收藏 / 设置都留着）。上架 AAB 仍走 EAS。
   产物统一收进 `dist/`（已 gitignore）：`just apk` → `daily-poetry-<版本>-vc<N>.apk`；
   `just pkg` 一次出 APK + IPA + HAP（缺工具链的平台自动跳过并提示）。iOS 的 `.ipa` 只能在 macOS 上本地打（`just ipa`，
   **关掉 code signing** 归档再把 `.app` 塞进 `Payload/` 打成 zip，装设备要自签），
   Windows 上走 `just ipa-eas`（EAS 云端签名，下完自动落 `dist/`）。
3. **ccache**：`ReactNative-application.cmake` 会自动 `find_program(ccache)` 并设为编译器启动器；
   Cygwin/MSYS 版 ccache 认不了 `C:\...\clang++.exe`，NDK 编译会整片
   `ccache: FATAL: Could not find compiler ... in PATH`。用原生版（`choco install ccache`），
   或禁用那个 ccache.exe。

# 鸿蒙（RNOH）

工具链在 `tool/harmony.sh`（子命令）+ `tool/harmony-env.sh`（探测 DevEco / SDK / hdc / ohpm /
hvigor）+ `tool/harmony-render.mjs`（渲染 `tool/harmony-template/` → `harmony/`）。
`just harmony-doctor | harmony-setup | harmony | harmony-emulator | harmony-start | hap | harmony-log | harmony-clean`。

- **`harmony/` 是生成物，不进版本库**（`.gitignore`）。模板里是 `__BUNDLE_NAME__` 这类占位符，
  `app.json` 的 `android.package` / `version` / `versionCode` 与**本机 SDK**（`5.0.0(12)` 这种，
  同时推导 hvigor 的 `modelVersion`）渲染进去。渲染**只补缺不覆盖**（DevEco 里配的签名 / 改过的
  `module.json5` 不能丢），`--force` 才整份重来 —— 别改成无条件覆盖。
- **构建跑在 Windows 侧**：DevEco 的工具一律经 `win_run()` 写 `.bat` 再 `cmd.exe /c` 调
  （`C:\Program Files\Huawei\DevEco Studio` 有空格，内联 `cd /d` 会被拆开）；bat 里同时注入
  `DEVECO_SDK_HOME` 与 `OHOS_HDC_SERVER_PORT`（默认 8710，避开 adb 的 5037）。
  **hdc 只认 `OHOS_HDC_SERVER_PORT`** —— 早先写的 `HDC_SERVER_PORT=7035` 是误配，
  hdc 根本不看那个名字，结果是设备“消失”（两边服务端口打架）。
- **模拟器也是 Windows GUI**（`{DevEco}/tools/emulator/Emulator.exe`）：`just harmony-emulator`
  用 PowerShell 的 `Start-Process` 拉起它，再轮询 `param get bootevent.boot.completed`。
  它自己往 hdc 服务（8710）注册成 `127.0.0.1:5555`，WSL 这边不需要端口映射。
  实例名 / 实例目录 / 镜像目录都**现读**，不硬编码：
  `deviceManager.xml` 的 `openharmonyDeployPath` / `imageDeployPath` + `Emulator.exe -list`，
  可用 `HVD_HOME` / `HVD_IMAGE_ROOT` / `AHarmonyOS_HVD_HOME` 覆盖。
  - **`-path` 传的是部署根目录（`HVD_HOME`），不是实例目录**：`Emulator.exe` 自己拼
    `<path>/<hvd 名>`。传成实例目录它就去找 `<实例>/<实例>`，只往 stderr 丢一句
    `"Mate 80 Pro Max" is not found. Please create the device(folder): …/<名字>/<名字>`，
    再加一句 `Unable to start the emulator` 就退出 —— 而 **`Emulator.log` 一个字都不写**。
    这一句就是「模拟器起不来」的真原因（不关 Windows 状态、跟实例 / 镜像完整性都无关，
    `-version` / `-list` 都正常）。
  - 因此**不能**用 bat + `start ""` 拉起：模拟器会继承 WSL 这边的 stdout/stderr，
    GUI 进程不死管道就永远读不到 EOF，`just harmony-emulator` 会一直卡到模拟器关闭。
    `Start-Process` 不重定向时会脱离父进程 stdio，2 秒返回；而**加上
    `-RedirectStandardOutput` 反而会挂住**（实测 6 分钟不返回），所以重定向只用在
    失败后重跑一次捞 stderr 的 `win_emu_probe`（带 `-Wait`，进程已退不会卡）。
  - `{APPDATA}/Huawei/DevEcoStudio<版本>/options/deviceManager.xml` 是唯一记录这两个目录的地方；
    `{LOCALAPPDATA}/Huawei/Emulator/deployed/` 下常有一份**指向 C: 的同名残壳**（只有 config.ini，
    没有镜像），别被它误导 —— 真实例在 `openharmonyDeployPath` 里。
  - `start_emulator` 起完 5 秒查一次 `tasklist`，进程秒退就报错（并打印 `emu-start.log` /
    `emu-err.log` 里抓到的那两行），`wait_device` 也会在进程消失时提前返回（返回码 2），
    不让人白等五分钟。`wait_device` 的**超时算墙钟**、每次 `hdc shell` 包 `timeout -k`：
    hdc 是 Windows 进程，只发 SIGTERM 杀不掉，否则「超时」会变成永久挂起。
- **RNOH 依赖故意不进 `package.json`**：`install_rnoh()` 一次 `npm install --no-save` 装三个包
  —— `react-native-harmony`（alias 到 `@react-native-oh/react-native-harmony`，含 140MB 的 `.har`）、
  RNOH CLI、**`@react-native-community/cli`**（Expo 工程默认没有它，而 `bundle-harmony` 只能走
  RN CLI）。装完还原 `package-lock.json`。
  - 三个必须**同一条命令**装：npm 每次 `--no-save` 都会把上一轮装上的 extraneous 包剪掉
    （只装 CLI 的话，140MB 的 RNOH 会被删掉）。
  - 版本按 RN 大版本推导（`0.86` → `0.86-stable` → `0.86-rc` → `latest`），因为 `latest`
    dist-tag 还停在 `0.72.146`；结果缓存在 `.data/harmony/version`，`HARMONY_VERSION` 可覆盖。
- **Metro 靠环境变量切**：`just harmony*` 带 `RNOH_METRO=1`，`metro.config.js` 里那段才
  `require('react-native-harmony/metro.config')`（harmony 平台下 `react-native` 重定向、
  `assetRegistryPath` 换成 harmony 版、`platforms` 加 `harmony`）。
  **没有单独的 `metro.config.harmony.js`** —— `npx react-native start` 只认根目录的
  `metro.config.js`，没有传 Metro 配置的入口；写第二个文件反而要维护两份。
  不带这个环境变量时 `just start` / `expo export` / Android / iOS / Web 完全不受影响。
- **根目录 `index.js` 是鸿蒙调试的垫片**：RNOH 的 `MetroJSBundleProvider` 把 URL 写死成
  `http://localhost:8081/index.bundle?platform=harmony&dev=true&minify=false`，而 Expo 的入口是
  `package.json` 的 `main = expo-router/entry` —— 没有这个文件调试就是 404。它只 `require('expo-router/entry')`。
- **`react-native.config.js`（根目录）** 只为把 RNOH 的命令挂进 RN CLI（社区 CLI 只从
  `package.json` 的 dependencies 找命令插件，而 RNOH 是 `--no-save` 装的）—— 用 `try/require`，
  没装鸿蒙工具链时 `commands` 为空，别的平台照旧。
- **Debug / Release 的 JS 来源**：Debug 走 Metro（`hdc rport tcp:8081 tcp:8081`，**不是** `adb reverse`），
  Release 必须 `bundle_harmony false` 把 `bundle.harmony.js` 打进 `entry/src/main/resources/rawfile/`。
  `Index.ets` 的 `AnyJSBundleProvider` 按 Metro → 沙箱文件 → rawfile 三级兜底。
- **tsconfig / eslint 都要排掉** `harmony/` 与 `tool/harmony-template/`（ArkTS 不归 tsc 管，
  `hvigorfile.ts` import 的 `@ohos/hvigor-ohos-plugin` 本机没有类型）。
- **已知阻塞（还没真正跑起来）**：模拟器 / 编译 / 装机 / Metro / 设备日志都通了，**卡在 Expo
  模块没有鸿蒙实现**。`expo-modules-core` 注册不出 TurboModule，装上去能起、JS bundle 也能跑完，
  但一进渲染就挂：
  `W TurboModuleFactory: Turbo Module 'ExpoModulesCore' not found` →
  `E RNOH_JS: [TypeError: Cannot read property 'EventEmitter' of undefined]`（屏幕白 / 红屏）。
  `expo-sqlite`（60MB 诗词库）同源；`reanimated 4` / `gesture-handler 2` 远高于
  `@react-native-oh-tpl/*`。`bundle_harmony` 失败时会打 `harmony_port_note()` 提示，
  别把它当成配置问题去改 Metro 配置。
- **构建期四个已经绕过、但换个环境会重现的坑**（详见 `tool/harmony-template/README.md`）：
  模板里的 `.json` 必须严格 JSON（restool 不认 JSON5，报 `11203002` 还不说哪个文件）；
  `abiFilters` 必须带 `x86_64`（模拟器是 x86_64 镜像，只编 arm64 装上去秒退，
  hilog 只有 `libRNOHApp is undefined`）；多 ABI 时 hvigor 只给第一个 ABI 生成
  `summary.cmake`，第二个 ABI 报 `ffrt::ffrt_cpp but the target was not found`（在模板的
  `CMakeLists.txt` 里自己按 `CMAKE_FIND_ROOT_PATH` 找）；RNOH 0.86.1 的
  `WebSocketTurboModule.ts` 引用了 API 26 才有的 `WebSocketOpenInfo`，API 21 的 SDK 下
  ArkTS 类型检查不过 → `patch_rnoh_sdk_compat()` 删掉那一支（幂等，`ohpm install` 后重打）。
- **Metro 不能被原生构建目录搞死**：CMake 在 `harmony/entry/.cxx/**` 里反复建 / 删
  `CMakeScratch`，`metro-file-map` 的 fallback watcher 撞 ENOENT 直接退出（表现是装上去白屏）。
  `metro.config.js` 把 `harmony/**` 的构建产物加进 `resolver.blockList`。
- **Debug 不走 `bundle-harmony`**：`bundle-harmony --dev true` 把 `sourceMap` / `sourceMapUrl`
  传成同一个文件，metro-source-map 断言 `Unexpected module with full source map found` 抛错。
  Debug 直接起 Metro（`just harmony-start` / `just harmony`）；Release 的 `--dev false` 正常。
- **别用 `npx` 起 RN CLI**：本机 WSL 里 `npx` 会把 `RNOH_METRO=1` 丢掉（`metro.config.js`
  读到 `undefined`，鸿蒙解析规则整段不生效）。脚本里用 `node_modules/.bin/react-native`。
- **`'vp2px' has been deprecated` 不用管**：编译期只有四处、全在 RNOH 的 har 里
  （`RNViewBase.ets:113-115` + `RNSurface.ets:285`），本工程自己的 `.ets` 没用过。
  `vp2px` 从 API 18 起弃用，替代品要组件上下文（`UIContext.vp2px()`）或改走
  `display.getDefaultDisplaySync().densityPixels`；第三方代码 + 当前 App 渲染不了 = 改完没法验证，
  留给上游。

# 数据与简繁

- 语料在 `.data/chinese-poetry`（`just data`；`data-full` 再多取古文观止 / 幽梦影 / 论语 / 四书 / 蒙学），
  库产物 `assets/poetry.db`（`just db`，不入库）。标准模式下十四部集子共 95435 首
  （全唐诗 57599 + 全宋词 21049 + 元曲 10906 + 乐府诗集 3770 + 花间集 447 + 唐诗三百首 320
  + 诗经 305 + 宋词三百首 286 + 纳兰性德词 258 + 千家诗 214 + 毛泽东诗词 145 + 楚辞 65
  + 南唐词 45 + 曹操诗集 26），每日池 1966 首。
- 乐府诗集是**第二个语料来源**：`.data/yuefu/yuefu.json` 由 `scripts/fetch-yuefu.mjs`
  从中文维基文库抓（`Category:樂府詩集` 一百卷，`==曲调（作者）==` / `===诗题===` 两级标题切条目，
  题解 / `:` 注疏 / header-footer 剥掉）。它在 chinese-poetry 目录**外面**，`build-db.mjs`
  用 `join(dirname(DATA_DIR), 'yuefu', 'yuefu.json')` 找它 —— 别改成 `.data/chinese-poetry/` 下面，
  那是 sparse clone 的工作区。`fetch-yuefu` 按卷缓存原文到 `.data/yuefu/raw/`，重跑不重复请求；
  第五十八卷没维基化（`【詩題】朝代·作者` 纯文本，无 `===`），单独一套规则。
  乐府 **不进每日池**（大半是郊庙 / 燕射乐章），进池会把 1966 的轮换整体重排。
- 宋词三百首是**第三个语料来源**：`.data/songci300/songci300.json` 由 `scripts/fetch-songci300.mjs`
  从古文岛（原古诗文网）抓：https://www.guwendao.net/gushi/songsan.aspx 。全集页把九卷摊在一页，
  `<div class="typecont">` 切卷、`<div class="bookMl"><strong>卷一·唐五代词</strong></div>` 是卷名，
  条目是 `<span><a href="/shiwenv_xxx.aspx">词牌·首句</a>(作者)</span>`；正文在**详情页**的
  `<div class="contson">`（`<br />` / `</p>` 是换行），朝代取详情页的 `〔唐代〕`。
  286 首 / 114 位作者 / 9 卷，原文缓存到 `.data/songci300/raw/`（列表页 + 每首一页）。
  同样在 chinese-poetry 目录外面，`parseSongci300()` 用 `join(dirname(DATA_DIR), 'songci300', …)` 找它。
  - 题目是「词牌」或「词牌·首句」（`青玉案·元夕` / `水调歌头·丙辰中秋`），**副题必须留空**：
    `cipaiOf()` 优先认副题，往里塞东西词牌统计立刻串味（`·` 前段才是词牌）。
  - 词序（`丙辰中秋，欢饮达旦…`）在详情页是正文前面单独一个 `<p>`，照旧写成**正文第一行**。
  - 正文一句一行：`<br />` / `</p>` 换行后再按 `。！？；` 断句（`splitClauses()`），
    跟全宋词 / 唐诗的存法一致。
  - 校记整块丢（`EDITOR_NOTE`）：`(更短亭 一作：连短亭)` / `(后三句疑伪作)` 是编者注不是正文。
  - 朝代按详情页的 `〔唐代〕` / `〔五代〕` / `〔宋代〕` 映射成 `唐 / 五代 / 宋`（`五代` 不能
    简单剥「代」字，会变成「五」）。**进每日池**（选本是精选，跟唐诗三百首同理）。
  - 换源前用的是维基文库那版（283 首 / 82 作者，`=='''词牌'''（作者）==` 一条一首）；
    换源后**数量、题目形态、作者名（冯延巳）都变了**，所以 `SCHEMA_VERSION` 升到 7。
- 毛泽东诗词是**第四个语料来源，但抓不了**：知乎对脚本一律 403
  （`zhuanlan.zhihu.com/p/620593015` 是反爬壳页，`api/v4/articles/…` 也 403），
  所以走「浏览器存下来的页面 → `scripts/fetch-mao.mjs` 解析」：存档页放 `.data/mao/mao.html`
  （不入库），产物 `data/mao-poems.json`（145 首 / 98KB，**跟着仓库走**）才是建库的输入 ——
  `parseMao()` 读 `join(ROOT, 'data', 'mao-poems.json')`，fresh clone 不用再找那个页面。
  - 页面正文全在 `<div class="RichText ztext Post-RichText">` 的 `<p>` 里，编号行 `N. 体裁·题目`
    分首（`43～45. 十六字令` 这种一个编号段带几首，正文里用「其一 / 其二」分段，
    没有分段标记就按空行分），日期行 `1910年秋` 后面跟正文。
  - 题目统一成「体裁·题目」（`七律·长征` / `沁园春·长沙`），组诗缀 `·其N`（`十六字令·其一`）；
    **写作日期进副题**（`1925年秋`），详情页就是「选自《毛泽东诗词》· 1925年秋」。
  - `kind` 用「诗词」**不是「词」**：`isCiKind()` 只认「词」，一给这个号就会从
    `七律·长征` 里认出一个叫「七律」的假词牌（`cipaiOf()` 取 `·` 前段），词牌页立刻变垃圾。
  - 朝代一律「现代」，作者一律「毛泽东」；**不进每日池**（145 首里一半是残篇 / 联句 / 题词）。
  全宋词 / 元曲 属于主体语料，**不能**只放在 `FULL_DIRS` 里：`scripts/build-db.mjs` 的主体育法
  一直包含它们，语料缺失时只会「缺哪块跳哪块」地静默少两万多首。
  全唐诗 目录里混着全宋诗，`scripts/fetch-corpus.sh` 只按需取 `poet.tang.*.json` + `唐诗补录.json`。
- **坑**：`git sparse-checkout set` 在「模式没变」时是空操作——工作区里被删掉的文件
  不会补回来，「先 `just data`（旧版没宋词）+ 后 `just data-full`」就永远取不到那两块。
  所以脚本在 set 之后又跑一遍 `git checkout HEAD -- $DIRS` 兜底；`just data` 的
  「已存在就跳过」也点名抽查 `宋词/ci.song.0.json`、`元曲/yuanqu.json`、`全唐诗/poet.tang.0.json`
  而不是只看 `.data/chinese-poetry` 目录。
- 简繁双写：`*_tw` 列存繁體（繁体语料原样保留、简体源用 OpenCC `cn→tw`），
  `content/title/...` 存简体。App 端 `src/lib/script.ts` 的 `localizePoem()` 只做字段挑选，
  不引运行时转换库；检索同时 LIKE 简体列与繁体列。
- 改表结构必须同时改：`scripts/build-db.mjs` 的 `SCHEMA_VERSION`、`src/lib/db.ts` 的
  `DB_SCHEMA_VERSION`、`__tests__/helpers/memory-db.ts` 的 `SCHEMA`。
  **只加语料、结构没动也要把 `SCHEMA_VERSION` +1**：换库只认这个号，不升号老设备永远用旧库。
  （4 = 标准库并入全宋词 / 元曲；5 = 加乐府诗集；6 = 加宋词三百首；7 = 宋词三百首换源；
  8 = 加毛泽东诗词。）
  版本不一致时 `src/lib/db-bootstrap.ts` 会在启动时覆盖随包库，并按「题目 + 作者 + 首句」把收藏 / 足迹写回。
  覆盖会整份替换 `meta` 表，所以新增偏好设置时**必须**加进 `KEPT_SETTINGS` 白名单，
  否则换库会把用户设置重置（现有：`settings_theme / settings_push / settings_daily_gap /
  settings_script / settings_font / settings_font_size / settings_layout / settings_punct /
  settings_tts_rate`）。

# 每日推送（作者冷却 / 应景）

- 平日挑诗在 `src/lib/daily.ts`（纯函数，可单测）：以 1960-01-01 为起点逐日往前推，
  每天用 `dayNumber` 做种子的 mulberry32 抽**一位作者**，跳过最近 N 天出现过的，
  再从该作者的诗里抽一首 —— 「N 天内不重复作者」是构造出来的，不是抽完再筛。
  因此同一天在任何设备上都是同一首；作者数少于 N 时按作者数退化成轮流；
  没署名的诗统一算一位「佚名」（冷却身份只在挑选器内部用，不展示）。
- `settings_daily_gap`（`0|3|7|14|30`，默认 `7`）只影响平日轮换；档位表是 `GAP_OPTS`，
  设置页「每日推送 → 作者间隔」用 `Segment` 渲染，未命中值走 `gapKeyOf()` 退回默认。
- 应景（`poemForOccasion`）：拿节日 / 节气名（`occasion.label` + `keywords` 别名）在**全库**
  按题目检索，题目无命中再退到正文；命中集合按 `日期 + 节日 id` 的种子随机取一首
  （同一天稳定，来年换一首）。`ORDER BY daily DESC` 让精选池优先，冷门节气靠全库兜底；
  全库也没有才回退平日轮换（`pickPoemForDate` 的 `occasion: false`）。
- 24 个节气里大半在 1963 首精选池中零命中（立夏 0/2、小满 0/1…），所以应景检索**不能再**限定
  `daily = 1`，否则等于没做。
- 挑诗器按「库实例 + 档位」缓存在 `WeakMap` 里（一次会话只建一次，逐日推到今天约 8ms）；
  测试里换 db 实例会重建，别把 20 多万次的循环写进断言。
- **隔夜缓存**（`src/lib/daily-cache.ts`）：挑今天的诗要跑应景检索（`LIKE '%词%'` 扫全库
  5.7 万行）或从 1960 年逐日推到今天，两步都在首屏必经路径上（桌面实测 75ms / 27ms）。
  所以首页画完后（`pickForDateCached()` 返回之后）**不 await** 地调 `prefetchUpcomingDays()`
  把往后 3 天的诗算好，写进 `meta` 的 `daily_picks`：
  `{ 'YYYY-MM-DD': { id, key: 'push|gap', themed } }` —— 只存 id，不存正文。
  下次打开 `pickForDateCached()` 先读这条 KV（约 0.03ms）再 `getPoem(id)`。
  - 缓存**不改变结果**：`poemForDay` / `poemForOccasion` 都是「日期 + 池子 + 偏好」的纯函数，
    `__tests__/daily-cache-test.ts` 对拍「缓存 id == 现算 id」。
  - 偏好指纹 `key` 对不上（用户改了推送方式 / 作者间隔）就作废重算；
    只写今天及以后的日期（往回翻的日子不占缓存）；最多留 8 条（`CACHE_KEEP`）。
  - `daily_picks` **故意不进 `KEPT_SETTINGS`**：换库后旧 id 指向的是旧库的诗。
  - `prefetchUpcomingDays()` 用 `WeakSet<db>` 做「一整个会话只跑一次」的闸，
    测试想重跑得先 `resetPrefetchForTest()`。
  - 首页与诗词详情页都走 `pickForDateCached()`（别绕回去直接调 `pickPoemForDate`，
    那样缓存永远命中不了）。
- 首页翻日（`src/app/(tabs)/today.tsx`）：顶栏箭头 + **左右滑动**两条路改的是同一个
  `date` state。滑动用 `PanResponder` 包在 ScrollView 外面（`testID="today-swipe"`），
  判定在 `src/lib/swipe.ts`：`claimsSwipe()` 只在横向明显大于竖向（`|dy|*1.5 < |dx|`）时
  接管手势 —— 竖向的必须留给 ScrollView，否则上下滚诗会被吃掉；`swipeStep()` 松手时
  才用 56px 的真门槛，右滑 = 前一天、左滑 = 后一天。`next()` 的守门（不越过今天）写在
  `setDate` 的 updater 里，这样 `prev`/`next`/`PanResponder` 都是稳定引用，不用每帧重建。
- 测滑动的坑有两层，`__tests__/screens/today-screen-test.tsx` 的 `swipe()` 注释里写了：
  ① RNTL 派发事件前会**无参**调 `onStartShouldSetResponder` / `onMoveShouldSetResponder`
  探路，PanResponder 对无参调用一律 false → `fireEvent(view, 'responderGrant')` 被静默丢弃，
  只能直接调 View 上的 `onResponderGrant/Move/Release`；② `gestureState.dx` 是 PanResponder
  自己从 `event.touchHistory` 累计的，测试得喂 `touchBank` + 递增的 `mostRecentTimeStamp`，
  并且 `act` 要 `await`，否则后续用例会一起挂。

# 阅读设置（字体 / 字号 / 排版 / 标点 / 语速）

- 全部持久化在 `meta` 表的 `settings_*` KV 里，没有 AsyncStorage：
  `settings_font`（`system|song|kai`）、`settings_font_size`（**正文字号 px 字符串**，
  `'21'` 这种）、`settings_layout`（`horizontal|vertical`）、`settings_punct`（`keep|space`）、
  `settings_tts_rate`（`slow|normal|fast`）。
- 字号是**滑块**（`src/components/font-size-slider.tsx`，`@react-native-community/slider`），
  **10–24 号**、步长 1。老库里的四档键还有救：`bodySizeOf()`（`src/lib/typography.ts`）认
  `sm|md|lg|xl` 并按 `LEGACY_SIZE_SCALE` × 21 换算成 px，写回去就自动升级成数字
  （`xl` 换算出来 27.3，会被新上限 clamp 成 24）。
  `scaled()` 的下限是 **9** —— 必须比正文字号下限 10 小，否则缩到 10 号时行内小字
  （首句 13 号 × 10/21）反而比正文还大。
  **拖动只改界面、松手（`onSlidingComplete`）才落库**，否则一次拖动写几十遍 meta；
  页面用 `draftSize ?? bodySize` 显示，commit 时先清 draft 再 `setBodySize()`。
- 字族表在 `src/lib/typography.ts`，`AppTypographyProvider`（`src/typography.tsx`）
  读库并往下发 `family / bodySize / scale`（`scale = bodySize / 21`，`scaleOfBody()`）；
  `PoemLines` 不传 `fontSize` 时直接用 `bodySize`（px），行高固定 1.85 倍。
- 不打包字体：走系统 CJK 字族。Android `serif` 会落到 `NotoSerifCJK`（宋体感），
  没有楷体，所以 `fontOptions()` 在 Android 上过滤掉 `kai`；iOS 用 `Songti SC` / `Kaiti SC`。
- 竖排：RN 没有 `writing-mode`，`PoemLines` 把正文按 `columnsOf()` 拆成列，
  每列用 `toColumnText()` 逐字换行堆叠，外层 `flexDirection: 'row-reverse'` 从右往左排。
  **注意**：`row-reverse` 下 `scrollX=0` 是内容最左（也就是末句），所以横向溢出时
  必须 `scrollToEnd()`，否则长诗会从最后一列开始读（挂载 + `onContentSizeChange` 里各调一次，
  用户开始拖动后就不再自动跳）。
- 标点：`src/lib/punct.ts` 的 `hidePunct()` 把**每个**标点换成**一个空格**（不是删掉，否则两句
  黏在一起），**不合并**连续空格——「」，这种连着的一串要各留一位，压掉就又黏回去了；
  只去掉行首尾空格，**保留换行**——竖排的列数按行算，动换行会把版式搞乱。
- 竖排没有「空格宽度」这回事：`toColumnText()`（`src/lib/typography.ts`）把行内空白换成
  全角空格 `\u3000`，空位才跟字一样占整格；否则 `hidePunct` 换来的空格在竖列里会消失。
  标点只在 `PoemLines` / `PoemRow` 渲染时套，复制与朗读仍是原文标点。
- 卡片（`src/app/card/[id].tsx` + `src/components/share-card.tsx`）不跟阅读设置：
  正文字号默认 `CARD_BODY = 18`，题目 / 作者按 1.4 / 0.72 倍等比走，排版固定横排。
  卡片页底部的**字号滑块 / 用字（简繁）/ 标点（空·符）**是**局部 override**——
  state 用 `null` 表示「还没动过，跟设置」，`override ?? 设置值` 得到实际值，
  所以不用监听 provider 的异步加载，也**不会**把阅读设置写脏。
  `ShareCard` / `PoemLines` 因此各多出 `bodySize` / `script` / `punct` 覆盖 props。
- 分段选择器统一用 `src/components/segment.tsx` 的 `Segment`（`compact` 是卡片页那种
  小号版），别再在页面里复制一份。
- 朗读语速在 `src/lib/tts.ts`，`expo-speech` 的 `rate` 是倍率（1.0 = 系统默认，中文偏快，
  所以「标准」= 0.9）。`PoemActions` 每次朗读现读设置，改完不用重启。
- 朗读入口的显示条件在 `src/tts.ts` 的 `useTtsSupport()`：web 同步看 `speechSynthesis`，
  原生 `getAvailableVoicesAsync()` 空数组（没装 / 没启用 TTS 引擎）就收起。没有语音合成时
  `PoemActions` 不画「朗读」，设置页整段「朗读」（语速 + 试听）也不画。
  查询本身失败一律当作**支持**——查不到就藏功能比留个按钮更糟；有声音但不是中文也算支持
  （那是引擎语言包问题，不该由 App 替用户判断）。

# 诗词卡片（截图 → 相册 → 分享）

- `src/app/card/[id].tsx`：`?id=` 取诗，可选 `?date=`（每日一诗那天，印在底部）；
  `captureRef(viewRef)`（`react-native-view-shot`）截外层 `View`，**必须** `collapsable={false}`，
  否则 Android 会把这层拍平，截出来是空的。
- `src/lib/card-save.ts`：`expo-media-library` 的「相册」就是 MediaStore 的一个目录，
  `Album.create(name, [])` 会因为没有第一个文件而报错，所以必须先 `Album.get()`，
  存在就 `Asset.create(uri, album)`，不存在才带着这张图一起建。
- 权限：Android 10+ 往 MediaStore 插图片不需要权限，默认直接写、失败才要一次；
  iOS 必须先授权（调用方传 `askFirst`）。`app.json` 里的 `photosPermission` /
  `savePhotosPermission` 是 iOS 的用途文案。
- `src/lib/card-save.ts` 的 `shareImage()`：存成之后调 `expo-sharing` 弹系统面板
  （`mimeType: image/png` + `UTI: public.png`），返回 boolean —— 分享失败 / web 不支持
  **不影响「已保存」**，只决定要不要提示。`isAvailableAsync()` 为假时静默跳过。
- 卡片配色与字号写死在 `src/components/share-card.tsx`，不跟主题、不跟阅读字号：
  导出的图是给别人看的，版面要稳定。
- 卡片顶部是一行抬头：`CARD_MARK`（「每日诗词 APP」）+ 体裁芯片（`poem.kind`：诗 / 词 / 曲 / 文 / 蒙学）。
  两者在同一个 `styles.head` 里（`testID="share-card-head"`，横排居中、gap 8），
  别再拆成上下两行；芯片原来单占一行，2026-11 那版把它挪到抬头右边。
- 卡片页底部的**字号 / 用字（简繁）/ 标点（空·符）会记住上次的选择**：存在 meta 的
  `settings_card_size` / `settings_card_script` / `settings_card_punct`（三个键都在
  `KEPT_SETTINGS` 白名单里，换库不丢），读写都走 `src/lib/card.ts` 的
  `cardBodyOf()` / `cardScriptOf()` / `cardPunctOf()` —— 没存过就返回 `null`，
  此时字号用卡片默认 18、简繁 / 标点跟阅读设置；脏值 / 越界字号（`99`）读回来是 24。
  字号拖动**只在 `onSlidingComplete` 落库**（`onChange` 一次拖动触发几十遍），
  跟阅读设置的字号滑块是同一套路。它**不是**阅读设置，别写到 `settings_font_size` 上。
- 卡片上两个品牌位是**两个常量**（`src/lib/card.ts`）：顶部抬头 `CARD_MARK`（`每日诗词 APP`，
  说清这是哪个 App）；底部**只印** `cardDateLine()` 的「2026年11月3日 · 农历九月廿五」
  （`date` 没传就不画，连上面那条分隔线一起）；`CARD_BRAND`（`每日一诗`）现在**只做
  相册文件名前缀**，卡片上不再出现 —— 改它就等于改相册里的文件名。

# 集子（诗词列表 / 作者统计 / 词牌）

- 路由：`src/app/collection/[id]/index.tsx` 是**集子的落点页 —— 全部诗词**（`poems.tsx` 已并入，
  别再建回单页），顶栏右侧两个 `BarLink`：「按作者」→ `collection/[id]/authors.tsx`，
  词集才有的「按词牌」→ `collection/[id]/cipai/index.tsx`；
  `collection/[id]/cipai/[name].tsx` 是某个词牌的作品，`author/[name].tsx` 是某位作者的作品
  （参数 `name` / `coll` / `tw` / `id`）。
  `[id].tsx` 和 `[id]/index.tsx` 不能共存（`cipai.tsx` 与 `cipai/[name].tsx` 同理，所以词牌统计页是
  `cipai/index.tsx`），改结构时别再写回单文件；新增子页要同步 `_layout.tsx` 的
  `Stack.Screen name="collection/[id]/xxx"`。
  两个统计页的「全部诗词」走 `useBackOr()`（`src/components/bar-link.tsx`）：能返回就返回，
  深链直接进来（没有上一页）才 push 列表页。
- **作者表 / 词牌表是同一个组件**：`src/components/indexed-list.tsx` 的 `IndexedList`
  （分组标题 + 行 + 右侧字母条 + `getItemLayout`）。作者和词牌都是「首字母分组、组内数量多的在前、
  名字后面跟收录数、点进去看作品」，展示形式一旦分两份写就必然长歪。
  它只收 `{ name, nameTw?, count }[]` 按首字母分好组的数据 + 三个回调（`labelOf` / `testIDOf` / `onPick`），
  行的渲染、行高、跳转全在里面。
- **词牌**（`src/lib/cipai.ts`）：库里没有这一列，现算。
  - 副题里有词牌就用副题（花间集是「卷N·词牌」要剥卷次），否则看题目：
    **`·`（U+00B7）取前段**（『长相思·山一程』），**`・`（U+30FB）取后段**
    ——全宋词 2377 首写的是「别名・正名」（『酹江月・念奴娇』『凤栖梧・蝶恋花』），
    按别名各算一词牌会抖出 1409 个名字，认正名后归并成 884 个。两个字符长得很像，别合并处理。
  - 全宋词 / 宋词三百首的词牌**就在题目里**（`ci.song.*.json` 只有 rhythmic，建库时写进了 title），
    花间集 / 南唐词的副题才是 rhythmic。所以别改成只读 `subtitle`，那会让 2 万首全宋词变哑巴。
  - 只有 `kind === '词'` 的集子出词牌页（元曲是曲牌，没做），诗集进去直说「没有词牌」。
  - 词牌**统计**不在这里现算：建库时就算好写进随包 `assets/stats.json`（见下节「预统计」）。
    实时算的只剩「某个词牌的作品」——`poemsOfCipai()`（`src/lib/db.ts`）先按
    `title/subtitle LIKE '%词牌%'` 抄个超集，再用 `cipaiOf()` **精确比对**删掉误伤 ——
    「念奴娇」的 LIKE 超集 608 首里就有 1 首不是它。
  - 排序复用 `groupAuthors()`（词牌统计的产物形状跟 `AuthorStat` 一模一样），没另写一套分组。
- 首字母 / 排序全在 `src/lib/authors.ts`，用 `pinyin-pro` 现算（不落库、不加列、不改 schema）：
  - `pinyin(name, { surname: 'all' })` 才能把 曾 / 单 / 仇 / 查 / 乐 按姓氏读；
    仍有个别（如「尉迟恭」的尉）按常用音读，属于可接受的误差。
  - 「佚名」「无名氏」「无名」「不详」在 `ANON_NAMES` 里，**统一进 `#`（其他）**，
    否则会按拼音排进 Y / W 冒充真作者；没署名（空串）同样进 `#`，显示为「佚名」。
  - 组间 A→Z 且 `#` 最后（`compareLetters`）；**组内先比作品数（降序）**，同数再按全拼、
    再按名字；空串 sortKey 用 `\uffff` 垫底。作品数是这本集子里的收录数（建库时
    `COUNT(*) GROUP BY author` 算好写进 `assets/stats.json`），不是诗人一生的总量。
- 字母条 `src/components/letter-rail.tsx` 贴在**右侧**（拇指够得着、也不压名字），
  只渲染**实际存在**的字母（分组就是字母表），
  `SectionList` 的 `onViewableItemsChanged` 用 `useCallback([])`（RN 要求常量引用，
  而 `react-hooks/refs` 规则禁止渲染期读 `ref.current`）；`scrollToLocation` 外面必须 try/catch。
- **点字母不生效的坑**：`SectionList` 是虚拟化的，没量过的分段 `scrollToLocation` 会失败
  ——没有 `getItemLayout` 又没给 `onScrollToIndexFailed` 时，RN 只打一行 warning 就静默不动；
  就算给了 `onScrollToIndexFailed`，它也只能拿 `_averageCellLength`（已量过的那几十格的平均值）
  去估位置，而「标题 26px / 作者行 44px」混在一起的平均值乘以全唐诗那 3700 个扁平下标，
  误差是**几百行**（表现：高亮换了，列表停在别的字母）。
  现在的做法是**直接给精确坐标**：`src/lib/section-layout.ts` 的 `makeSectionLayout()`
  按「每组 = 1 标题 + n 行 + 1 空尾部」算前缀和，`IndexedList` 把行 / 分组标题的**高度写死**
  （`ROW_PAD + 行高(字号×1.4)`、`HEAD_H = 26`），列表头部高度靠 `onLayout` 量一次当起点；
  于是 `scrollToLocation` 一次到位，`onScrollToIndexFailed` / 粗滚重试那套全删掉了。
  **改行高必须同时改 `getItemLayout` 的口径**，否则跳转就会歪（`sectionsHeight()` 是它的总和）。
- **预统计走 JSON，页面不跑运行时 SQL**（`assets/stats.json`，约 280KB / gzip 65KB，**产物入库**）：
  - 生成 `scripts/build-stats.mjs`：`just db` / `db-full` 建完库顺带跑；只校验不写盘加 `--check`
    （`just dbcheck`，`just check` 也调它）。算的就是两条 —— `GROUP BY author`（带
    `MAX(author_tw)`）和拿 `cipaiOf()` 过一遍整集（这就是以前页面里那件「把 2.1 万首正文全读进内存」的事）。
  - 形状 `{ version, collections: { [id]: { total, authors: [{name,nameTw?,count}], cipai: [...] } } }`；
    `nameTw` 跟 `name` 一样就**省略**（省几百 KB 的重复）；`version` 对应 `src/lib/stats.ts` 的
    `STATS_VERSION`。`total` 是集子总首数，**作者 count 之和未必等于它**（没署名的诗算 `''` 这位作者）。
    只有 `kind === '词'` 的集子算词牌，其余 `cipai: []`。
  - **建库脚本是 .mjs，只能把 `src/lib/cipai.ts` 的两条规则（`VOLUME` / `·` / `・`）照抄一份**，
    改词牌规则**必须两处一起改**；`__tests__/assets/stats-test.ts` 会用 TS 那边现算一遍对拍，
    漏改一条就红（它还校验集子不多不少、`total` 对得上、作者跟 `GROUP BY` 一致）。
  - 页面侧 `statsOf(coll)`（`src/lib/stats.ts`）**同步**返回，不用 `await`；
    `collection/[id]/cipai/index.tsx` 因此不再 `poemsOfCollection` 整集装载。
    `authorsOfCollection()` 已删除 —— 要作者统计就 `statsOf()`。
  - 组件测试：内存库里造的数据不可能出现在随包 JSON 里，用 `__tests__/helpers/stats.ts` 的
    `seedStats(db)` 按内存库现算一份塞进 `setStatsForTest()`；**改过库（例如 `UPDATE ... author_tw`）
    要再调一次**，否则页面读到的是改之前的。
- 统计页的量：全唐诗 3650 位作者（`quantangshi`）、全宋词 884 个词牌（最多的是浣溪沙 817 首），
  唐诗三百首 75 位，宋词三百首 114 位作者 / 136 个词牌（最多的是清平乐 11 首），
  毛泽东诗词只有一位作者（145 首全归「毛泽东」；`kind` 是「诗词」不是「词」，没有词牌页），
  诗经 305 首全是「佚名」→ 只有一个「其他」分组。
  作者作品数之和必须等于集子总首数（测试盯着这条）。

# 诗词挑战（填空十题）

- 入口在收藏页标题右边那块（`testID="challenge-entry"`）→ `src/app/challenge/index.tsx`（选题源）
  → `src/app/challenge/[pool].tsx`（对局）；战绩在 `src/app/challenge/log.tsx`
  （入口页**右上角** `challenge-log-entry`，只显示「战绩 N」徽标，明细全在这页）。
  `pool` 是 `favorites` 或集子 id，可带 `?seed=` 复现某局；
  **三个路由都得在 `_layout.tsx` 里 `Stack.Screen`**（`challenge/index` / `challenge/[pool]` / `challenge/log`）。
  选题源名「我的收藏」来自常量 `CHALLENGE_FAVORITES = 'favorites'`（`src/lib/db.ts`）。
- 出题全在 `src/lib/challenge.ts`（纯函数，可单测）：抽诗 → 按行断句 → 挑一句挖成 `BLANK` → 配三个干扰项。
  种子走 `src/lib/random.ts` 的 `rng()`，**同一天同一来源出同一份题**，重开一局才换种子。
  挖空只从 `content`（简体正文）派生，要繁体就让调用方先 `localizePoem()` 再传进来。
- **语料噪声必须挡在门外**（不挡会出「（〖1〗句次成公简诗句后」这种题）：
  - 全唐诗《补录》里混着约 570 首整理稿 / 校勘记，正文带 `〖〗［］` —— `buildChallenge()` 整首跳过；
  - 候选句只收**纯汉字**（`HAN_ONLY`），夹着数字 / 字母 / 拼音的一律不挖；
  - 括号 / 引号 / 书名号也算断句符（`CLAUSE_SEP`），否则注明会整段被当成一句。
- 挖空句 5–16 个字（`BLANK_MIN` / `BLANK_MAX`）：太短能猜出来，太长选项排不下。
  干扰项按**字数接近**挑（先 ±2，再 ±5，最后不限），候选句来自池子里所有诗——
  所以池子至少要 `CHALLENGE_MIN_POOL = 4` 首，入口页按这个数禁用不够的来源。
- 池子不足十首时不报错，**一首诗出多题**（每遍重新洗牌挑另一句，遍数给到 `size + 2`），
  实在凑不满就返回少几题，页面照样能玩。
- 评级 `rankOf()`：6 及格 / 8 优秀 / 10 诗仙下凡（`PASS_RATE` / `GOOD_RATE`），
  题数不是十题按比例算，全对永远是「诗仙下凡」，`total <= 0` 落到 `fail`。
- **分数线只活在代码里，不上 UI**：入口页不再列「6 / 10 及格、8 / 10 优秀」，
  结果页 low 分只给「加油」（`RANKS.fail.label`），`RANKS[*].hint` 里也**不许出现题数**
  （`challenge-test` 有一条正则盯着）。要加档位就改这里，别把门槛抄回页面。
- 结果页入场动效在 `[pool].tsx` 内部两个小组件：`Pop`（分数 spring 弹一下）、
  `Rise`（`delay` 错开的淡入 + 上浮，评级 120 / 提示 240 / 用时 340 / 全对 460）。
  都用 `useNativeDriver: true` + `clamp`（spring 会过冲，opacity 超出 1 会闪白）。
  加新行就再包一层 `Rise`，别在 `resultHead` 外面套 ScrollView 动画。
- 战绩（用时 / 答对数 / 参与时间 / 来源）存 `meta` KV 的 `challenge_log`，**不建表**；
  入口页只查「有几局」（给右上角徽标），明细页 `challenge/log.tsx` 才整份读，用它自己的 `useFocusEffect`；
  所以这次没动 `SCHEMA_VERSION`；只留最近 `CHALLENGE_LOG_MAX = 20` 局，新的排最前。
  `challenge_log` 已进 `src/lib/db-bootstrap.ts` 的 `KEPT_SETTINGS`（换库不清战绩）。
  将来要按月统计之类再建表，那时才需要升 schema。
- **`challengePoems()` 的两层排序**：内层 `ORDER BY RANDOM() LIMIT ?` 抽 40 首，
  外面再包一层 `ORDER BY id` —— 行序是 `buildChallenge()` 洗牌的输入，
  不固定的话同一个种子会出不同的题（测试直接飘）。
- 页面写法上两个已有的坑：换一局用**外层组件换 `key` 重挂载**，不要 `useEffect` 里 `setState`
  （`react-hooks/set-state-in-effect`）；开局时刻用 `useRef(0)` 在 effect 里写，
  **别在 render 里读 `Date.now()`**（`react-hooks/purity`）。
- 战绩行里的分数带 `testID="challenge-log-score"`：汇总块里也有个「8/10」，
  测试用 `getByText` 会撞车。

# 图标 / 启动图（`just assets`）

- 全部由 `scripts/make-assets.py`（Pillow）生成，产物在 `assets/images/`：`icon.png`、
  `android-icon-{foreground,monochrome}.png`、`splash-icon.png`、`splash-icon-dark.png`、
  `favicon.png`、`tab/*.png`。换图标 = 替换根目录 `logo.png` 再 `just assets`，别再手改 PNG。
- **换完图标必须 `just native-reset`（= `rm -rf android ios` + `expo prebuild --clean`）再装机**：
  `android/` 是 prebuild 产物（`.gitignore` 里），`expo run:android` 在它已存在时**不会**重跑
  prebuild，`res/mipmap-*/ic_launcher*.webp`、`drawable-*/splashscreen_logo.png` 全是旧的
  —— 表现就是「素材明明换了，装出来还是老图标」。app.json 的 `icon` / `adaptiveIcon` /
  `expo-splash-screen` 改动同理。
- 印章是从 `logo.png` **抠出来的**。阈值不写死：纸底亮度按 **P60** 现量（源图亮一点暗一点
  都不用改代码），纸底 −26 以下算纸、再往下 36 级过渡、−62 以下是纯印泥。26 级余量是**必须**的：
  少了纸纹噪点会透出来，深色启动图上就是一层红灰（`splash-icon` 四角 alpha>10 现在是 0%）。
  外框只看「够深且偏红」的列 / 行分布（各取 >10 个印泥像素），投影和脏点撑不大框；
  crop 后再留 5% 白。
  **透明像素要填印泥色**，否则缩放时边缘朝纸色漂，透明底上会留一圈白光。
- 版式沿用老口径：`icon.png` 纸底（`#F4EDDA`）+ 印章占长边 60%，`android-icon-foreground`
  透明底 59%（落在 66% 安全区内），`splash-icon` 62%，`favicon` 朱砂底 + 白色印章 68%，
  `monochrome` 是白色剪影（Android 13 主题图标只取 alpha）。
- 存图前**量化到 256 色**（`save()`）：原图带纸纹，真彩 RGBA 每张 400–500KB，
  量化后整套 332KB 且肉眼看不出差别。别改回真彩。
- 深色启动图单独一张 `splash-icon-dark.png`（`app.json` 的 `plugins.expo-splash-screen.dark.image`）：
  深红印泥贴在 `#181510` 上几乎看不见，得换成纸色的「反白印」`CREAM_INK`。
- `logo.png` 是**源图**，得跟着仓库走（`just assets` 依赖它）；`tab/*.png` 仍从
  `@expo/vector-icons` 的 Ionicons.ttf 渲染，跟 `(tabs)/_layout.tsx` 里的图标名对得上。
