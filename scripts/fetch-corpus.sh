#!/usr/bin/env bash
# fetch-corpus.sh — 下载 chinese-poetry 语料（sparse / blob:none，省流量）
# 用法: bash scripts/fetch-corpus.sh [standard|full]
#
# 全唐诗 目录里混着全宋诗（poet.song.*，体积巨大），所以不整体 checkout，
# 只按需取 poet.tang.*.json 与唐诗补录.json（见 fetch_tang）。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-standard}"
DEST="$ROOT/.data/chinese-poetry"
URL="https://github.com/chinese-poetry/chinese-poetry.git"

# 宋词（ci.song.*.json，约 16MB）与元曲（yuanqu.json，约 4MB）算主体语料：
# `scripts/build-db.mjs` 的主体育法里一直有它们，只放在 full 里会让 `just db`
# 静默少掉两万多首（见 89507dd 之后的修正）。
STD_DIRS="蒙学 诗经 楚辞 五代诗词 纳兰性德 曹操诗集 宋词 元曲"
FULL_DIRS="$STD_DIRS 幽梦影 论语 四书五经"

if [ "$MODE" = "full" ]; then
  DIRS="$FULL_DIRS"
  echo "语料模式: full"
else
  DIRS="$STD_DIRS"
  echo "语料模式: standard"
fi

mkdir -p "$ROOT/.data"

if [ ! -d "$DEST/.git" ]; then
  echo "首次克隆（sparse + blob:none）…"
  git clone --depth 1 --filter=blob:none --sparse "$URL" "$DEST"
fi

cd "$DEST"
# sparse-checkout 会对「工作区里存在但不在 cone 内」的文件（下面手工取的
# 全唐诗）刷一堆 warning，成功时把 stderr 丢掉，失败再原样报出来。
if ! out=$(git sparse-checkout set $DIRS 2>&1); then
  echo "$out"
  exit 1
fi

# 关键：`sparse-checkout set` 在「模式没变」时是**空操作**——工作区里被删掉 /
# 从没取下来的文件不会补回来。于是「先 `just data`（没有宋词元曲）后来
# `just data-full`」这种升级路径上，宋词 / 元曲就永远取不到（build-db 只会
# 静默地跳它们）。再拿 checkout 把 cone 里的目录兜一遍，只补缺失的文件。
if ! out=$(git checkout HEAD -- $DIRS 2>&1); then
  echo "$out"
  exit 1
fi

# 全唐诗：只取唐诗（58 个 poet.tang.N.json + 唐诗补录.json，约 25MB）
fetch_tang() {
  local out="全唐诗" files f
  # core.quotePath=false：否则中文路径会被转义成 \345\205\250 这种形式
  files=$(git -c core.quotePath=false ls-tree -r --name-only HEAD -- "$out" \
    | grep -E "^$out/(poet\.tang\.[0-9]+\.json|唐诗补录\.json)$" || true)
  if [ -z "$files" ]; then
    echo "（仓库里没有全唐诗，跳过）"
    return 0
  fi
  mkdir -p "$out"
  local n=0
  while read -r f; do
    [ -f "$f" ] && continue
    git show "HEAD:$f" >"$f"
    n=$((n + 1))
  done <<<"$files"
  echo "全唐诗: 新取 $n 个文件"
}

echo "取全唐诗（仅唐诗部分）…"
fetch_tang

echo "语料就绪: $DEST"
du -sh "$DEST" 2>/dev/null || true
