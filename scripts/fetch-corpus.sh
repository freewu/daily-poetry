#!/usr/bin/env bash
# fetch-corpus.sh — 下载 chinese-poetry 语料（sparse / blob:none，省流量）
# 用法: bash scripts/fetch-corpus.sh [standard|full]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-standard}"
DEST="$ROOT/.data/chinese-poetry"
URL="https://github.com/chinese-poetry/chinese-poetry.git"

STD_DIRS="蒙学 诗经 楚辞 五代诗词"
FULL_DIRS="$STD_DIRS 宋词 元曲 纳兰性德 曹操诗集 幽梦影 论语 四书五经"

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
git sparse-checkout set $DIRS
echo "语料就绪: $DEST"
du -sh "$DEST" 2>/dev/null || true
