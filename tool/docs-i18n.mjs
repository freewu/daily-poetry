#!/usr/bin/env node
/**
 * 官网简繁对照表：docs/index.html（简体是唯一真相）→ docs/assets/i18n.js
 *
 *   node tool/docs-i18n.mjs           # 重新生成
 *   node tool/docs-i18n.mjs --check   # 只校验是否过期（CI / just check 用，退出码 1）
 *
 * 做法是「整串对照」而不是逐字转换：页面上每个文本节点 / alt / aria-label 的
 * 简体原文当键，OpenCC（cn→twp，带词组表）转出来的繁體当值。运行时
 * docs/app.js 拿节点的 trim 后文本去查表，命中就换 —— 因此：
 *   · 改完 HTML 的文案必须重跑本脚本，否则新句子在繁體模式下原样露出简体；
 *   · 键里带换行 / 缩进也一样能对上（两边都用同一份 HTML 里抠出来的原文）；
 *   · 纯 ASCII（代码、路径、英文）转换后不变，直接不写进表里。
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import * as OpenCC from "opencc-js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "docs", "index.html");
const OUT = join(ROOT, "docs", "assets", "i18n.js");
const toTw = OpenCC.Converter({ from: "cn", to: "twp" });

if (!existsSync(SRC)) {
  console.error(`✗ 找不到 ${relative(ROOT, SRC)}`);
  process.exit(1);
}

/* script / style 里的内容不翻（app.js 自己维护三态主题等动态文案） */
const html = readFileSync(SRC, "utf8")
  .replace(/<script[\s\S]*?<\/script>/gi, "<script></script>")
  .replace(/<style[\s\S]*?<\/style>/gi, "<style></style>");

const found = new Set();

/* 文本节点：标签之间、且不含 < > 的整段。trim 的口径必须与 app.js 一致 */
for (const m of html.matchAll(/>([^<>]+)</g)) {
  const text = m[1].trim();
  if (text) found.add(text);
}

/* 会显示给人看的属性（content 只出现在 meta 上） */
const ATTRS = /\s(?:alt|aria-label|title|placeholder|content)="([^"]*)"/g;
for (const m of html.matchAll(ATTRS)) {
  const text = m[1].trim();
  if (text) found.add(text);
}

const pairs = [];
for (const hans of found) {
  const hant = toTw(hans);
  if (hant !== hans) pairs.push([hans, hant]);
}
pairs.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));

const body = pairs
  .map(([hans, hant]) => `  ${JSON.stringify(hans)}: ${JSON.stringify(hant)},`)
  .join("\n");

const content = `/* 自动生成，别手改：node tool/docs-i18n.mjs
 * 官网的简繁对照表 —— 键是 docs/index.html 里的简体原文（文本节点 / alt / aria-label…），
 * 值是 OpenCC（cn→twp）转出的臺灣正體。docs/app.js 按 trim 后的整串查表替换。
 * 共 ${pairs.length} 条。 */
window.DP_I18N = {
${body}
};
`;

if (process.argv.includes("--check")) {
  const old = existsSync(OUT) ? readFileSync(OUT, "utf8") : "";
  if (old !== content) {
    console.error(
      `✗ ${relative(ROOT, OUT)} 与 ${relative(ROOT, SRC)} 不同步，跑一遍：node tool/docs-i18n.mjs`,
    );
    process.exit(1);
  }
  console.log(`✓ 简繁对照表是最新的（${pairs.length} 条）`);
} else {
  writeFileSync(OUT, content);
  console.log(
    `✓ ${relative(ROOT, OUT)}：${pairs.length} 条对照（共 ${found.size} 段文本）`,
  );
}
