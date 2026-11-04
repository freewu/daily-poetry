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

- 语料在 `.data/chinese-poetry`（`just data`；`data-full` 再多取古文观止 / 幽梦影 / 论语 / 四书 / 蒙学），
  库产物 `assets/poetry.db`（`just db`，不入库）。标准模式下十一部集子共 91234 首
  （全唐诗 57599 + 全宋词 21049 + 元曲 10906 + 唐诗三百首 320 + 千家诗 214 + 诗经 305
  + 楚辞 65 + 花间集 447 + 南唐词 45 + 纳兰性德词 258 + 曹操诗集 26），每日池 1680 首。
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
  （4 = 标准库并入全宋词 / 元曲。）
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
- 24 个节气里大半在 1680 首精选池中零命中（立夏 0/2、小满 0/1…），所以应景检索**不能再**限定
  `daily = 1`，否则等于没做。
- 挑诗器按「库实例 + 档位」缓存在 `WeakMap` 里（一次会话只建一次，逐日推到今天约 8ms）；
  测试里换 db 实例会重建，别把 20 多万次的循环写进断言。

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
  - 全宋词的词牌**就在题目里**（`ci.song.*.json` 只有 rhythmic，建库时写进了 title），
    花间集 / 南唐词的副题才是 rhythmic。所以别改成只读 `subtitle`，那会让 2 万首全宋词变哑巴。
  - 只有 `kind === '词'` 的集子出词牌页（元曲是曲牌，没做），诗集进去直说「没有词牌」。
  - 词牌统计、分词牌取作品都是**内存**算的（整集本来就一次装载，全宋词 2.1 万首）。
    `poemsOfCipai()`（`src/lib/db.ts`）先用 `title/subtitle LIKE '%词牌%'` 抄个超集，
    再用 `cipaiOf()` **精确比对**删掉误伤 —— 「念奴娇」的 LIKE 超集 608 首里就有 1 首不是它。
  - 排序复用 `groupAuthors()`（词牌统计的产物形状跟 `AuthorStat` 一模一样），没另写一套分组。
- 首字母 / 排序全在 `src/lib/authors.ts`，用 `pinyin-pro` 现算（不落库、不加列、不改 schema）：
  - `pinyin(name, { surname: 'all' })` 才能把 曾 / 单 / 仇 / 查 / 乐 按姓氏读；
    仍有个别（如「尉迟恭」的尉）按常用音读，属于可接受的误差。
  - 「佚名」「无名氏」「无名」「不详」在 `ANON_NAMES` 里，**统一进 `#`（其他）**，
    否则会按拼音排进 Y / W 冒充真作者；没署名（空串）同样进 `#`，显示为「佚名」。
  - 组间 A→Z 且 `#` 最后（`compareLetters`）；**组内先比作品数（降序）**，同数再按全拼、
    再按名字；空串 sortKey 用 `\uffff` 垫底。作品数是这本集子里的收录数
    （`COUNT(*) GROUP BY author`），不是诗人一生的总量。
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
- 统计页的量：全唐诗 3650 位作者（`quantangshi`）、全宋词 884 个词牌（最多的是浣溪沙 817 首），
  唐诗三百首 75 位，诗经 305 首全是「佚名」→ 只有一个「其他」分组。
  作者作品数之和必须等于集子总首数（测试盯着这条）。
