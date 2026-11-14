#!/usr/bin/env bash
# 官网截图工具：驱动模拟器里的 App，把主要页面截进 docs/assets/screenshots/。
#
#   bash tool/screenshots.sh doctor          # 看设备 / 包名 / 分辨率是否就绪
#   bash tool/screenshots.sh install         # 装 dist/ 里最新的 Release APK（离线可用）
#   bash tool/screenshots.sh shoot-all       # 一键跑完「主要页面」的截图序列
#   bash tool/screenshots.sh shot <名字>     # 只截当前屏 → docs/assets/screenshots/<名字>.png
#   bash tool/screenshots.sh dump            # 打印当前屏可点元素（resource-id / 文本 / 坐标）
#   bash tool/screenshots.sh tap <文本或 id> [等待秒数]
#   bash tool/screenshots.sh swipe <x1> <y1> <x2> <y2> [毫秒]
#   bash tool/screenshots.sh back | home
#   bash tool/screenshots.sh webp            # 1080x2400 PNG → 720x1600 索引色（官网用）
#
# 说明：截图必须用 Release 包（JS 打进 APK），Debug 包离了 Metro 就是白屏。
# 坐标是按 1080x2400 / 420dpi 的 AVD（Pixel 7）量的；换机型先用 dump 对一次坐标。
set -uo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# android-env.sh 负责认出 adb / 设备 / AVD（WSL 里是 Linux 客户端连 Windows 的 server）
# shellcheck disable=SC1091
. tool/android-env.sh sourced >/dev/null 2>&1 || true

OUT="$ROOT/docs/assets/screenshots"
mkdir -p "$OUT"
S=""

die() { printf '✗ %s\n' "$*" >&2; exit 1; }
info() { printf '  %s\n' "$*"; }

# ---------------------------------------------------------------- 设备
need_adb() { [ -n "${ADB:-}" ] || die "没找到 adb，先跑 just android-setup"; }

serial() {
  need_adb
  "$ADB" devices | awk 'NR > 1 && $2 == "device" { print $1; exit }'
}

need_device() {
  [ -n "$S" ] || S="$(serial)" || S=""
  [ -n "$S" ] || die "没有在线设备，先跑 just emulator"
}

tap_xy() { "$ADB" -s "$S" shell input tap "$1" "$2"; sleep "${3:-1.2}"; }

ui_dump_xml() {
  "$ADB" -s "$S" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1
  "$ADB" -s "$S" shell cat /sdcard/ui.xml > /tmp/dp-ui.xml
}

# 可点元素一览：resource-id / text / content-desc + bounds（调坐标时用）
print_ui() {
  python3 - <<'PY'
import re
xml = open('/tmp/dp-ui.xml', encoding='utf-8').read()
for n in re.findall(r'<node[^>]*>', xml):
    b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
    if not b:
        continue
    rid = re.search(r'resource-id="([^"]*)"', n)
    txt = re.search(r'text="([^"]*)"', n)
    desc = re.search(r'content-desc="([^"]*)"', n)
    parts = [p for p in ((rid.group(1).split(':id/')[-1] if rid else ''),
                         (txt.group(1) if txt else '')[:40],
                         (desc.group(1) if desc else '')[:20]) if p]
    if not parts:
        continue
    print('%-42s %s' % (' | '.join(parts), b.group(0)))
PY
}

el_center() {
  python3 - "$1" <<'PY'
import re, sys
key = sys.argv[1]
prefix = key.endswith('*')
if prefix:
    key = key[:-1]
xml = open('/tmp/dp-ui.xml', encoding='utf-8').read()
best = None
for n in re.findall(r'<node[^>]*>', xml):
    rid = re.search(r'resource-id="([^"]*)"', n)
    rid = rid.group(1).split(':id/')[-1] if rid else ''
    txt = re.search(r'text="([^"]*)"', n)
    txt = txt.group(1) if txt else ''
    desc = re.search(r'content-desc="([^"]*)"', n)
    desc = desc.group(1) if desc else ''
    if prefix:
        hit = any(v.startswith(key) for v in (rid, txt, desc))
    else:
        hit = key in (rid, txt, desc)
    if not hit:
        continue
    b = re.search(r'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"', n)
    if not b:
        continue
    x1, y1, x2, y2 = map(int, b.groups())
    best = ((x1 + x2) // 2, (y1 + y2) // 2)
    if 'clickable="true"' in n:
        break
print('%d %d' % best if best else '')
PY
}

# 按文本 / resource-id 点（先抓一次 UI 树）
el_tap() {
  need_device
  ui_dump_xml
  local pos
  pos="$(el_center "$1")"
  [ -n "$pos" ] || die "当前屏找不到：$1（bash tool/screenshots.sh dump 看看）"
  info "tap $1 → $pos"
  tap_xy $pos "${2:-1.2}"
}

# 列表里可能要先滚才看得见：往下滚最多 N 次，直到元素出现
find_scroll() {
  need_device
  local key="$1" tries="${2:-6}" pos i
  for i in $(seq 0 "$tries"); do
    ui_dump_xml
    pos="$(el_center "$key")"
    if [ -n "$pos" ]; then printf '%s\n' "$pos"; return 0; fi
    "$ADB" -s "$S" shell input swipe 540 1700 540 800 400
    sleep 0.6
  done
  return 1
}

el_tap_scrolled() {
  local pos
  pos="$(find_scroll "$1" "${2:-6}")" || die "滚了也找不到：$1"
  info "tap $1 → $pos"
  tap_xy $pos "${3:-1.4}"
}

shot() {
  need_device
  sleep "${2:-0.6}"
  "$ADB" -s "$S" exec-out screencap -p > "$OUT/$1.png"
  info "docs/assets/screenshots/$1.png"
}

back() { "$ADB" -s "$S" shell input keyevent KEYCODE_BACK; sleep "${1:-1.1}"; }

# 1080x2400 原图压成 720x1600 索引色 PNG（官网加载快，肉眼几乎无差）
to_web_size() {
  python3 - "$OUT" <<'PY'
import glob, os, sys
from PIL import Image
out = sys.argv[1]
for f in sorted(glob.glob(os.path.join(out, '*.png'))):
    im = Image.open(f).convert('RGB').resize((720, 1600), Image.LANCZOS)
    im = im.quantize(colors=256, method=Image.MEDIANCUT, dither=Image.FLOYDSTEINBERG)
    im.save(f, optimize=True)
    print('%-34s %6d B' % (os.path.basename(f), os.path.getsize(f)))
PY
}

# ---------------------------------------------------------------- 一键序列
# 流程：今日 → 诗词库 → 集子/作者/词牌 → 诗篇（横排 + 竖排）→ 卡片 →
#       收藏 → 挑战（入口/对局/结果/战绩）→ 设置三屏 → 深色两张
# 顺序不能乱：每一步的落点都是下一步的起点。卡住就单步用 shot / tap 手动补。
shoot_all() {
  need_device
  info "设备：$S"

  "$ADB" -s "$S" shell am force-stop com.bluefrog.dailypoetry
  "$ADB" -s "$S" shell monkey -p com.bluefrog.dailypoetry \
    -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  sleep 9
  shot today 1

  # --- 诗词库：列表 + 集子（唐诗三百首）+ 作者统计
  tap_xy 405 2230 1.6
  shot library
  el_tap_scrolled 'collection-tangshi' 6 1.8
  shot collection-tangshi
  el_tap collection-authors-link 1.8
  shot collection-authors
  back

  # --- 词牌统计（只有词集才有）：回诗词库 → 全宋词
  back
  el_tap_scrolled 'collection-quansongci' 6 1.8
  el_tap collection-cipai-link 1.8
  shot collection-cipai
  back
  back

  # --- 诗篇详情：横排
  el_tap_scrolled 'collection-tangshi' 6 1.8
  el_tap 'poem-row-*' 2
  shot poem-detail
  back

  # --- 竖排：设置里切「排版 → 竖排」，再回诗篇截一张，然后切回横排
  tap_xy 945 2230 1.4
  el_tap layout-vertical 1.6
  tap_xy 405 2230 1.4
  el_tap 'poem-row-*' 2
  shot poem-detail-vertical
  back
  tap_xy 945 2230 1.4
  el_tap layout-horizontal 1.4
  tap_xy 135 2230 1.4

  # --- 诗词卡片（带日期 / 农历）：今日 → 分享
  el_tap act-card 2.8
  shot card
  back

  # --- 收藏：先点亮今天的红心，列表才不是空的
  el_tap act-favorite 1.2
  tap_xy 675 2230 1.6
  shot favorites

  # --- 挑战：入口 → 对局（十题盲选，只为拿到结果页）→ 战绩
  el_tap challenge-entry 1.8
  shot challenge-pools
  el_tap challenge-start 2.6
  shot challenge-question
  local i pos
  for i in $(seq 1 10); do
    "$ADB" -s "$S" shell input swipe 540 1900 540 400 250; sleep 0.3
    "$ADB" -s "$S" shell input swipe 540 1900 540 400 250; sleep 0.3
    ui_dump_xml
    pos="$(el_center challenge-option-0)"
    if [ -n "$pos" ]; then tap_xy $pos 0.7; fi
    tap_xy 540 2290 1
  done
  sleep 2
  shot challenge-result 1.5
  back
  el_tap challenge-log-entry 1.8
  shot challenge-log
  back
  back

  # --- 设置：顶部 / 每日精选多选 / 字体排版
  tap_xy 945 2230 1.6
  shot settings
  el_tap scope-field 1.8
  shot settings-scope
  el_tap scope-done 1.2
  "$ADB" -s "$S" shell input swipe 540 1700 540 800 600; sleep 0.8
  shot settings-lower

  # --- 深色主题（截完切回跟随系统）
  el_tap theme-dark 1.6
  shot settings-dark
  tap_xy 135 2230 1.6
  shot today-dark
  tap_xy 945 2230 1.2
  el_tap theme-auto 1.4

  info "完成 ✓ 接着跑 bash tool/screenshots.sh webp 压到 720 宽"
}

cmd="${1:-doctor}"
case "$cmd" in
  doctor)
    need_device
    info "设备：$S"
    info "分辨率：$("$ADB" -s "$S" shell wm size | tr -d '\r')"
    if "$ADB" -s "$S" shell pm list packages 2>/dev/null | tr -d '\r' | grep -F dailypoetry >/dev/null; then
      info "已安装：com.bluefrog.dailypoetry"
    else
      info "未安装该 App（先 bash tool/screenshots.sh install）"
    fi
    ;;
  install)
    apk="$(ls -t dist/*.apk 2>/dev/null | head -1)"
    [ -n "$apk" ] || die "dist/ 里没有 APK，先跑 just apk"
    need_device
    info "安装 $apk"
    "$ADB" -s "$S" install -r "$apk"
    ;;
  shoot-all | all) shoot_all ;;
  shot) shot "${2:-screen}" "${3:-0.6}" ;;
  dump) need_device; ui_dump_xml; print_ui ;;
  tap) el_tap "$2" "${3:-1.2}" ;;
  swipe) need_device; "$ADB" -s "$S" shell input swipe "$2" "$3" "$4" "$5" "${6:-300}"; sleep 0.8 ;;
  back) need_device; back ;;
  home) need_device; "$ADB" -s "$S" shell input keyevent KEYCODE_HOME; sleep 1 ;;
  webp) to_web_size ;;
  *)
    printf '用法：bash tool/screenshots.sh [doctor|install|shoot-all|shot|dump|tap|swipe|back|home|webp]\n' >&2
    exit 2
    ;;
esac
