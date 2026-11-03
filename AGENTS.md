# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code.

# 原生构建前置（Windows）

`just android` 的 Gradle 构建跑在 Windows 侧（WSL 通过 `cmd.exe` 调 `gradlew.bat`），
失败时只看 `exit code 1` 没用，要翻 `%USERPROFILE%\.gradle\daemon\9.3.1\daemon-*.out.log`。
两个已知坑（`just android-doctor` / `just envcheck` 会自检）：

1. **JDK 17**：`@react-native/gradle-plugin` 用 `jvmToolchain(17)` + foojay resolver，
   而 Gradle 不扫 IDEA 的 `%USERPROFILE%\jdks`，找不到就去 GitHub 自动下载（国内常卡死在
   0 字节 `.part` 上，配置阶段静默挂几十分钟）。解决：在 `%USERPROFILE%\.gradle\gradle.properties` 写
   `org.gradle.java.installations.paths=C:\\...\\jdk-17.x` 和
   `org.gradle.java.installations.auto-download=false`。
2. **ccache**：`ReactNative-application.cmake` 会自动 `find_program(ccache)` 并设为编译器启动器；
   Cygwin/MSYS 版 ccache 认不了 `C:\...\clang++.exe`，NDK 编译会整片
   `ccache: FATAL: Could not find compiler ... in PATH`。用原生版（`choco install ccache`），
   或禁用那个 ccache.exe。

# 数据与简繁

- 语料在 `.data/chinese-poetry`（`just data`），库产物 `assets/poetry.db`（`just db`，不入库）。
  全唐诗 目录里混着全宋诗，`scripts/fetch-corpus.sh` 只按需取 `poet.tang.*.json` + `唐诗补录.json`。
- 简繁双写：`*_tw` 列存繁體（繁体语料原样保留、简体源用 OpenCC `cn→tw`），
  `content/title/...` 存简体。App 端 `src/lib/script.ts` 的 `localizePoem()` 只做字段挑选，
  不引运行时转换库；检索同时 LIKE 简体列与繁体列。
- 改表结构必须同时改：`scripts/build-db.mjs` 的 `SCHEMA_VERSION`、`src/lib/db.ts` 的
  `DB_SCHEMA_VERSION`、`__tests__/helpers/memory-db.ts` 的 `SCHEMA`。
  版本不一致时 `src/lib/db-bootstrap.ts` 会在启动时覆盖随包库，并按「题目 + 作者 + 首句」把收藏 / 足迹写回。
  覆盖会整份替换 `meta` 表，所以新增偏好设置时**必须**加进 `KEPT_SETTINGS` 白名单，
  否则换库会把用户设置重置（现有：`settings_theme / settings_push / settings_script /
  settings_font / settings_font_size / settings_tts_rate`）。

# 阅读设置（字体 / 字号 / 语速）

- 全部持久化在 `meta` 表的 `settings_*` KV 里，没有 AsyncStorage：
  `settings_font`（`system|song|kai`）、`settings_font_size`（`sm|md|lg|xl`）、
  `settings_layout`（`horizontal|vertical`）、`settings_tts_rate`（`slow|normal|fast`）。
- 字族 / 字号档位表在 `src/lib/typography.ts`，`AppTypographyProvider`（`src/typography.tsx`）
  读库并往下发 `family / scale / bodySize`；`PoemLines` 不传 `fontSize` 时用 `bodySize`
  （21 × 倍率），行高固定 1.85 倍。
- 不打包字体：走系统 CJK 字族。Android `serif` 会落到 `NotoSerifCJK`（宋体感），
  没有楷体，所以 `fontOptions()` 在 Android 上过滤掉 `kai`；iOS 用 `Songti SC` / `Kaiti SC`。
- 竖排：RN 没有 `writing-mode`，`PoemLines` 把正文按 `columnsOf()` 拆成列，
  每列用 `toColumnText()` 逐字换行堆叠，外层 `flexDirection: 'row-reverse'` 从右往左排。
  **注意**：`row-reverse` 下 `scrollX=0` 是内容最左（也就是末句），所以横向溢出时
  必须 `scrollToEnd()`，否则长诗会从最后一列开始读（挂载 + `onContentSizeChange` 里各调一次，
  用户开始拖动后就不再自动跳）。
- 朗读语速在 `src/lib/tts.ts`，`expo-speech` 的 `rate` 是倍率（1.0 = 系统默认，中文偏快，
  所以「标准」= 0.9）。`PoemActions` 每次朗读现读设置，改完不用重启。
