# 每日诗词 — 开发工作流
# 说明：Windows WSL 下若 node/npm 不在默认 PATH，先执行
#   export PATH="$HOME/.local/bin:$PATH"

# 一键初始化：安装依赖 + 下载语料 + 构建数据库 + 生成图标
init: deps data db assets
    @echo "初始化完成 🎉 运行 just start 开始开发"

# 安装 npm 依赖
deps:
    npm install

# 下载精简语料（唐诗三百首 / 千家诗 / 诗经 / 楚辞 / 花间集 / 南唐词）
data:
    test -d .data/chinese-poetry && echo "语料已存在，跳过下载" || bash scripts/fetch-corpus.sh standard

# 下载完整语料（再含全宋词 / 元曲 / 古文观止 / 纳兰 / 曹操 / 幽梦影 / 论语 / 四书 / 蒙学）
data-full:
    bash scripts/fetch-corpus.sh full

# 构建 SQLite 数据库 → assets/poetry.db（精选集）
db: deps data
    node scripts/build-db.mjs

# 构建完整语料库（体积约 12MB）
db-full: deps data-full
    node scripts/build-db.mjs --full

# 校验已有数据库（不重建）
dbcheck:
    node scripts/build-db.mjs --check

# 重新生成品牌图标 / 启动图 / 底栏图标
assets:
    python3 scripts/make-assets.py

# 全套检查：数据库 + 类型检查 + ESLint
check:
    test -f assets/poetry.db || just db
    node scripts/build-db.mjs --check
    npx tsc --noEmit
    npx expo lint

# 环境自检
envcheck:
    @echo "node:    $$(command -v node || echo 缺失)"
    @node -v 2>/dev/null || true
    @echo "npm:     $$(command -v npm || echo 缺失)"
    @npm -v 2>/dev/null || true
    @echo "python3: $$(command -v python3 || echo 缺失)"
    @node -e "console.log('node:sqlite:', typeof require('node:sqlite').DatabaseSync)" 2>/dev/null || echo "node:sqlite: 不可用（需要 Node 22.5+）"

# 启动开发服务器
start:
    npx expo start

# 在 Android 模拟器/真机启动
android: check
    npx expo start --android

# 在 iOS 模拟器启动（仅 macOS）
ios: check
    npx expo start --ios

# 打 JS bundle（验证打包与资源）
export: check
    npx expo export --platform android --output-dir dist

# 说明：真机安装包建议使用 EAS Build（见 README）
build:
    @echo "本地原生构建请使用 EAS: npx eas-cli build --platform android"
