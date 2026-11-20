#!/usr/bin/env bash
# version.sh — 改版本号：app.json 里三处一起动
#
# 用法: bash tool/version.sh 1.2.0
#
# 为什么三处一起改：`expo.version` 决定 dist/ 里的文件名和商店版本，
# `android.versionCode` 决定 APK 能不能覆盖安装 / 上架过不过，`ios.buildNumber`
# 决定 iOS 归档号。只改前一个是老事故（Play 直接拒、TestFlight 上传报重复）。
# 三个都有值之后，push 到 main 就会触发 .github/workflows/release.yml 出包。
set -euo pipefail

next="${1:-}"
if [ -z "$next" ]; then
  echo "用法: bash tool/version.sh <x.y.z>（例：bash tool/version.sh 1.2.0）" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node - "$next" "$ROOT/app.json" <<'JS'
const fs = require('fs');
const next = process.argv[2];
const file = process.argv[3];

if (!/^\d+\.\d+\.\d+$/.test(next)) {
  console.error(`版本号得是 x.y.z 三段数字，收到「${next}」`);
  process.exit(1);
}

const raw = fs.readFileSync(file, 'utf8');
const expo = JSON.parse(raw).expo;
const prev = expo.version;
if (prev === next) {
  console.error(`版本号已经是 ${next} 了，什么都没改`);
  process.exit(1);
}

const bump = (n) => (Number.isFinite(Number(n)) ? Number(n) + 1 : 1);
const vc = bump(expo.android && expo.android.versionCode);
const bn = bump(expo.ios && expo.ios.buildNumber);

// 只替换这三个值，别把整个 app.json 重新格式化（注释和顺序都留着）
let out = raw
  .replace(/("version"\s*:\s*")[^"]*(")/, `$1${next}$2`)
  .replace(/("versionCode"\s*:\s*)\d+/, `$1${vc}`)
  .replace(/("buildNumber"\s*:\s*")[^"]*(")/, `$1${bn}$2`);

// 没有 buildNumber 的库补一行（iOS 归档号总得有个起点）
if (!/"buildNumber"/.test(out)) {
  out = out.replace(/("bundleIdentifier"\s*:\s*"[^"]*")/, `$1,\n      "buildNumber": "${bn}"`);
}

// 解析一遍确认没改坏，再落盘
JSON.parse(out);
fs.writeFileSync(file, out);
console.log(`版本 ${prev} → ${next}（versionCode ${vc}，buildNumber ${bn}）`);
JS

cat <<'EOF'

下一步：
  git commit -am "chore(release): 版本号 …" && git push
  → .github/workflows/release.yml 看到版本变了，自动出 Release APK + 未签名 .ipa
  → 想让包挂到 GitHub Release 上：git tag v<版本> && git push origin v<版本>
EOF
