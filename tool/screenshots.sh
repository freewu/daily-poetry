#!/usr/bin/env bash
# 官网截图工具：驱动模拟器里的 App，把主要页面截进 docs/assets/screenshots/。
#
#   bash tool/screenshots.sh doctor          # 看设备 / 包名 / 分辨率是否就绪
#   bash tool/screenshots.sh install         # 装 dist/ 里最新的 Release APK（离线可用）
#   bash tool/screenshots.sh shoot-all       # 一键跑完「主要页面」的截图序列
#   DP_DARK=1 bash tool/screenshots.sh shoot-all  # 同一套序列再跑一遗深色版（产物带 -dark 后缀）
#   bash tool/screenshots.sh shot <名字>     # 只截当前屏 → docs/assets/screenshots/<名字>.png
#   bash tool/screenshots.sh dump            # 打印当前屏可点元素（resource-id / 文本 / 坐标）
#   bash tool/screenshots.sh tap <文本或 id> [等待秒数]
#   bash tool/screenshots.sh swipe <x1> <y1> <x2> <y2> [毫秒]
#   bash tool/screenshots.sh back | home
#   bash tool/screenshots.sh webp            # 1080x2400 PNG → 720x1600 索引色（官网用）
#
# 列表太长、脚本滚动不稳时，可以直接深链跳过去（比一层层点稳）：
#   adb shell am start -a android.intent.action.VIEW -d "dailypoetry://collection/ci"
#   adb shell am start -a android.intent.action.VIEW -d "dailypoetry://poem/2"
# 路径就是 expo-router 的路由（collection/[id] · collection/[id]/cipai · poem/[id] · settings …）。
#
# 说明：截图必须用 Release 包（JS 打进 APK），Debug 包离了 Metro 就是白屏。
# 坐标是按 1080x2400 / 420dpi 的 AVD（Pixel 7）量的；换机型先用 dump 对一次坐标。
# WSL 里 Linux 版 adb 连不上 Windows 的 server 时，把 ADB 指过去就行：
#   ADB=/mnt/c/Users/xxx/AppData/Local/Android/Sdk/platform-tools/adb.exe bash tool/screenshots.sh ...
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
  # Windows 侧的 adb.exe 输出是 CRLF，
  # 不剥 \r 的话 $2 永远不等于 device（这里会用 Linux / Windows 两个 adb）
  "$ADB" devices | tr -d '\r' | awk 'NR > 1 && $2 == "device" { print $1; exit }'
}

need_device() {
  [ -n "$S" ] || S="$(serial)" || S=""
  [ -n "$S" ] || die "没有在线设备，先跑 just emulator"
}

# 所有 adb shell 都套 timeout：卡住的时候不是报错，是**永远不回**（脚本看着像挂了）。
# 上面那次十题循环在 uiautomator dump 上就卡了 7 分钟。超时算「这次没干成」，让上层重试。
shq() { timeout 20 "$ADB" -s "$S" shell "$@"; }

tap_xy() { shq input tap "$1" "$2"; sleep "${3:-1.2}"; }

# 抓 UI 树。`uiautomator dump` 偶尔会整段挂住（不是报错，是一直不出结果 —— 上面
# 那次十题循环就是被它卡了 7 分钟），所以每一步都套 timeout，失败就让调用方重试。
# 返回非 0 表示这次没抓到可用 XML（文件空 / 超时），调用方按「没找到元素」处理。
ui_dump_xml() {
  local i
  for i in 1 2 3; do
    if timeout 25 "$ADB" -s "$S" shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; then
      timeout 15 "$ADB" -s "$S" shell cat /sdcard/ui.xml > /tmp/dp-ui.xml 2>/dev/null
      [ -s /tmp/dp-ui.xml ] && return 0
    fi
    sleep 0.4
  done
  return 1
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
# 点一个「当前屏上本来就该有」的元素。多试几次再报错：刚切过来的页面首帧还没画完、
# 首页那首诗还在算，一次 dump 抓不到是常事（深色序列就在 act-card 上撞过一次）。
el_tap() {
  need_device
  local key="$1" wait="${2:-1.2}" pos i
  pos=""
  for i in 1 2 3 4 5; do
    ui_dump_xml
    pos="$(el_center "$key")"
    [ -n "$pos" ] && break
    sleep 0.8
  done
  [ -n "$pos" ] || die "当前屏找不到：$key（bash tool/screenshots.sh dump 看看）"
  info "tap $key → $pos"
  tap_xy $pos "$wait"
}

# 列表里可能要先滚才看得见：往下滚最多 N 次，直到元素出现
find_scroll() {
  need_device
  local key="$1" tries="${2:-6}" pos i
  for i in $(seq 0 "$tries"); do
    ui_dump_xml
    pos="$(el_center "$key")"
    if [ -n "$pos" ]; then printf '%s\n' "$pos"; return 0; fi
    shq input swipe 540 1700 540 800 400
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

# 底部 tab 栏在不在？栈里 push 了页面（集子 / 作者 / 诗篇）时是整页铺满的，tab 栏根本不存在，
# 这时候还去点 (945, 2230) 会落到列表行上 —— 曾经因此跑飞，最后报的是「找不到 layout-vertical」。
tab_bar_visible() { grep -q 'navigation_bar_item' /tmp/dp-ui.xml; }

# 切底部 tab：不在 tab 根上就先 BACK 退回去（最多退 4 层），再按坐标点
tab() {
  need_device
  local x="$1" i
  for i in 1 2 3 4 5 6 7 8; do
    ui_dump_xml
    if tab_bar_visible; then
      info "tab $x"
      tap_xy "$x" 2230 "${2:-1.6}"
      return 0
    fi
    # App 还没画出来（刚启动 / 正在加载）：等一等，别 BACK —— BACK 会把它退到桌面
    if ! app_visible; then
      info "App 还没起来，等一下"
      sleep 1
      continue
    fi
    info "不在 tab 根上，先 BACK"
    shq input keyevent KEYCODE_BACK
    sleep 1.1
  done
  die "退不回 tab 根页（底部 tab 栏一直没出现）"
}

# 当前 UI 树是不是咱这个 App（dump 里每个节点都带 package 属性）
app_visible() { grep -q 'com.bluefrog.dailypoetry' /tmp/dp-ui.xml; }

# 切主题**不走 UI**：设置页的「外观」在最底下，「我的」那一排又是 sticky 头，
# 滚到底之后 uiautomator 报的 bounds 是坏的（y2 < y1），点下去落在哪儿全靠运气。
# 设备是 root + 自带 sqlite3，直接改 meta 的 settings_theme（白名单里，换库也不丢），
# 再冷启动一次即可 —— 跟换库 / 换字号是同一套 KV。
set_theme() {
  need_device
  local m="$1" db=/data/data/com.bluefrog.dailypoetry/files/SQLite/poetry.db
  shq am force-stop com.bluefrog.dailypoetry >/dev/null 2>&1
  sleep 1.2
  shq "sqlite3 $db \"INSERT INTO meta(key,value) VALUES('settings_theme','$m') ON CONFLICT(key) DO UPDATE SET value=excluded.value;\"" >/dev/null \
    || die "改 settings_theme 失败（设备上 sqlite3 不通？）"
  info "主题 → $m"
}

shot() {
  need_device
  sleep "${2:-0.6}"
  local i png
  # 深色序列（DP_DARK=1）给同一套名字加后缀：today.png / today-dark.png 成对
  png="$OUT/$1${SHOT_SUFFIX:-}.png"
  for i in 1 2 3; do
    if timeout 40 "$ADB" -s "$S" exec-out screencap -p > "$png" 2>/dev/null && [ -s "$png" ]; then
      info "docs/assets/screenshots/$1${SHOT_SUFFIX:-}.png"
      return 0
    fi
    sleep 0.6
  done
  die "截图失败（screencap 没回）：$1"
}

back() { shq input keyevent KEYCODE_BACK; sleep "${1:-1.1}"; }

# 1080x2400 原图压成 720x1600 索引色 PNG（官网加载快，肉眼几乎无差）
to_web_size() {
  python3 - "$OUT" <<'PY'
import glob, os, sys
from PIL import Image
out = sys.argv[1]
for f in sorted(glob.glob(os.path.join(out, '*.png'))):
    im = Image.open(f).convert('RGB')
    if im.size == (720, 1600):
        # 已经是网页尺寸就不再重压：反复过一遍 LANCZOS 只会把字糊掉
        print('%-34s %6d B  (已就绪)' % (os.path.basename(f), os.path.getsize(f)))
        continue
    im = im.resize((720, 1600), Image.LANCZOS)
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
  if [ "${DP_DARK:-0}" = "1" ]; then
    SHOT_SUFFIX="-dark"
    info "深色序列：产物一律带 -dark 后缀"
  fi

  # 先定主题（深色序列 → dark，浅色序列 → auto），再冷启动跑全程。
  # 浅色序列也要显式写一遍：上一次深色序列把库里的 theme 留成 dark 了，不写回来整批图都是黑的。
  if [ "${DP_DARK:-0}" = "1" ]; then set_theme dark; else set_theme auto; fi
  shq am force-stop com.bluefrog.dailypoetry
  shq monkey -p com.bluefrog.dailypoetry \
    -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
  sleep 9

  shot today 1

  # --- 诗词库：列表 + 集子（唐诗三百首）+ 作者统计
  tab 405 1.6
  shot library
  el_tap_scrolled 'collection-tangshi' 6 1.8
  shot collection-tangshi
  el_tap collection-authors-link 1.8
  shot collection-authors
  back

  # --- 词牌统计（只有词集才有）：回诗词库 → 全宋词
  # 全宋词的集子 id 是 ci（不是 quansongci）；诗词库网格只渲染前 10 张卡片，
  # 再往后的集子滚不到（FlatList 窗口化 + 内容高度≈视口），所以这里必须挑首页就有的
  back
  el_tap_scrolled 'collection-ci' 6 1.8
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
  tab 945 1.4
  # 设置页首帧要等库读完（异步），一次 dump 可能还看不到分段控件 → 走带重试的那个
  el_tap_scrolled layout-vertical 6 1.6
  # 诗词库 tab 回来是集子网格（tab 根），没有诗行 —— 得重新进一次唐诗三百首，
  # 挑的还是第一行，跟上面那张横排的诗是同一首，两张正好对得上
  tab 405 1.4
  el_tap_scrolled 'collection-tangshi' 6 1.8
  el_tap 'poem-row-*' 2
  shot poem-detail-vertical
  back
  tab 945 1.4
  el_tap_scrolled layout-horizontal 6 1.4
  tab 135 1.4

  # --- 诗词卡片（带日期 / 农历）：今日 → 分享
  el_tap act-card 2.8
  shot card
  back

  # --- 收藏：浅色序列先点亮今天的红心，列表才不是空的；
  #     深色序列不能再点（那一下是取消收藏，两次的列表就对不上了）
  if [ "${DP_DARK:-0}" = "1" ]; then
    tab 675 1.6
  else
    el_tap act-favorite 1.2
    tab 675 1.6
  fi
  shot favorites

  # --- 挑战：入口 → 对局（十题盲选，只为拿到结果页）→ 战绩
  el_tap challenge-entry 1.8
  shot challenge-pools
  el_tap challenge-start 2.6
  shot challenge-question
  # 十题一路盲选（只为了走到结果页）。别再用「盲点 (540,2290)」那套：选项没点中时
  # 那个位置不是「下一题」，滚动又会把选项推出屏幕 —— 一题能耗掉两分钟，整段跑飞。
  # 现在每题都是「找选项 → 点它 → 找下一题（challenge-next）→ 点」，找不到就重抓一次 UI。
  local i pos
  for i in $(seq 1 10); do
    pos=""
    for _ in 1 2 3; do
      ui_dump_xml
      pos="$(el_center challenge-option-0)"
      if [ -n "$pos" ]; then break; fi
      shq input swipe 540 1800 540 900 250
      sleep 0.5
    done
    [ -n "$pos" ] || die "第 $i 题找不到 challenge-option-0"
    tap_xy $pos 0.9
    el_tap challenge-next 1.3
  done
  sleep 2
  shot challenge-result 1.5
  back
  el_tap challenge-log-entry 1.8
  shot challenge-log
  back
  back

  # --- 设置：顶部 / 每日精选多选 / 字体排版
  tab 945 1.6
  shot settings
  el_tap scope-field 1.8
  shot settings-scope
  el_tap scope-done 1.2
  shq input swipe 540 1700 540 800 600; sleep 0.8
  shot settings-lower

  # 深色那套图不在这里顺手拍 —— 整段用 DP_DARK=1 重跑（每张都带 -dark 后缀），
  # 主题在开头就用 set_theme 定好了，这里不用再管。

  info "完成 ✓ 接着跑 bash tool/screenshots.sh webp 压到 720 宽"
}

cmd="${1:-doctor}"
case "$cmd" in
  doctor)
    need_device
    info "设备：$S"
    info "分辨率：$(shq wm size | tr -d '\r')"
    if shq pm list packages 2>/dev/null | tr -d '\r' | grep -F dailypoetry >/dev/null; then
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
  swipe) need_device; shq input swipe "$2" "$3" "$4" "$5" "${6:-300}"; sleep 0.8 ;;
  back) need_device; back ;;
  home) need_device; shq input keyevent KEYCODE_HOME; sleep 1 ;;
  webp) to_web_size ;;
  *)
    printf '用法：bash tool/screenshots.sh [doctor|install|shoot-all|shot|dump|tap|swipe|back|home|webp]\n' >&2
    exit 2
    ;;
esac
