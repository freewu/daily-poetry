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

STD_DIRS="蒙学 诗经 楚辞 五代诗词 纳兰性德 曹操诗集"
FULL_DIRS="$STD_DIRS 宋词 元曲 幽梦影 论语 四书五经"

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
