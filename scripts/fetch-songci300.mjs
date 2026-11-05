#!/usr/bin/env node
/**
 * fetch-songci300.mjs — 从古文岛抓《宋词三百首》→ .data/songci300/songci300.json
 *
 * 用法:
 *   node scripts/fetch-songci300.mjs            # 抓（已缓存的不重复请求）
 *   node scripts/fetch-songci300.mjs --refresh  # 丢掉缓存重抓
 *
 * 语料不走 chinese-poetry 仓库（那边只有全宋词，没有这部选集），来源是古文岛（原古诗文网）：
 *   https://www.guwendao.net/gushi/songsan.aspx
 *
 * 全集页把九卷摊在一页里，每卷一个块：
 *
 *   <div class="typecont">
 *   <div class="bookMl"><strong>卷一·唐五代词</strong></div>
 *   <span><a href="/shiwenv_xxxx.aspx">菩萨蛮·平林漠漠烟如织</a>(李白)</span>
 *   …
 *
 * 所以「词牌·首句」和作者在**列表页**取（详情页的作者会带「(存疑)」），正文和朝代在详情页：
 *
 *   〔唐代〕                       ← 朝代（列表页没有）
 *   <div class="contson">
 *   <p>丙辰中秋，欢饮达旦，大醉，作此篇，兼怀子由。</p>   ← 词序，单独一段，当第一行留着
 *   <p>明月几时有？把酒问青天。…(何似 一作：何时)<br />转朱阁…</p>
 *
 * 两件事：
 * - `<br />` / `</p>` 是换行，再在 `。！？；` 处断句 —— 一句一行，跟全宋词 / 唐诗的存法一致；
 * - `（…一作：…）` / `(后三句疑伪作)` 是校记，不是正文，整块丢掉。
 *
 * 抓下来的原文**不做简繁转换**（古文岛是简体，繁体列交给 build-db 的 variants()）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { UA, cacheName, readCache, sleep, writeCache } from './wikitext.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA = resolve(ROOT, '.data', 'songci300');
const RAW = join(DATA, 'raw');
const OUT = join(DATA, 'songci300.json');
const REFRESH = process.argv.includes('--refresh');

const BASE = 'https://www.guwendao.net';
const LIST_URL = `${BASE}/gushi/songsan.aspx`;
/** 逐首抓，别把人家站打疼 */
const DELAY = 150;

/** 朝代：古文岛写「唐代」「宋代」「五代」，库里要「唐」「宋」「五代」（`五代` 不能再剥「代」） */
const DYNASTY = new Map([
  ['唐代', '唐'],
  ['五代', '五代'],
  ['南唐', '五代'],
  ['宋代', '宋'],
  ['北宋', '宋'],
  ['南宋', '宋'],
]);

/** 句读：一句一行（逗号 / 顿号是句内停顿，不断） */
const CLAUSE = /[。！？；]/;

/** 校记：`（更短亭 一作：连短亭）` / `(后三句疑伪作)`，是编者注，不是正文 */
const EDITOR_NOTE = /[（(][^（）()]*(?:一作|或作|别作|疑)[^（）()]*[）)]/g;

const NAMED = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’',
  hellip: '…', mdash: '—', middot: '·',
};

/** HTML 实体 → 字符（`&nbsp;` `&amp;` `&#39;` `&#x4e2d;`） */
function decode(html) {
  return html.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return NAMED[e.toLowerCase()] ?? m;
  });
}

/** 剥标签 + 解实体 + 收空白 */
const textOf = (html) => decode(html.replace(/<[^>]+>/g, '')).replace(/[\u00a0\t]/g, ' ').trim();

async function fetchHtml(url, attempt = 1) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'zh-CN,zh;q=0.9' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (e) {
    if (attempt >= 3) throw e;
    await sleep(800 * attempt);
    return fetchHtml(url, attempt + 1);
  }
}

/** 取一页：命中缓存就不请求；`--refresh` 重抓 */
async function page(name, url) {
  const path = cacheName(RAW, 'html', name);
  const cached = readCache(path, REFRESH);
  if (cached !== null) return cached;
  const html = await fetchHtml(url);
  writeCache(path, html);
  await sleep(DELAY);
  return html;
}

/**
 * 全集页 → 条目列表 `[{name, title, author, url}]`。
 * 九卷用 `<div class="typecont">` 切块，卷名（`卷一·唐五代词`）只用来报进度。
 */
function parseList(html) {
  const out = [];
  const blocks = html.split('<div class="typecont">').slice(1);
  for (const block of blocks) {
    const volume = /<div class="bookMl"><strong>(.*?)<\/strong><\/div>/.exec(block)?.[1] ?? '';
    const re = /<a href="(\/shiwenv_[^"]+)"[^>]*>([^<]+)<\/a>\(([^)]*)\)/g;
    for (let m = re.exec(block); m; m = re.exec(block)) {
      out.push({
        volume: textOf(volume),
        title: textOf(m[2]),
        author: textOf(m[3]),
        url: `${BASE}${m[1]}`,
        name: m[1].replace(/^\//, '').replace(/\.aspx$/, ''),
      });
    }
  }
  return out;
}

/** 详情页 → `{dynasty, lines, note}`；正文取不到就返回空行（调用方跳过） */
function parsePoem(html) {
  const dynastyRaw = /〔([^〕]{1,8})〕/.exec(html)?.[1] ?? '';
  const dynasty = DYNASTY.get(dynastyRaw) ?? dynastyRaw.replace(/代$/, '');

  const bodies = [...html.matchAll(/<div class="contson"[^>]*>([\s\S]*?)<\/div>/g)].map((m) => m[1]);
  const lines = [];
  let note = false;
  for (const body of bodies) {
    // 词序是正文前面单独一段（不带 <br />）：`<p>丙辰中秋，欢饮达旦…</p><p>明月几时有？…<br />…</p>`
    const paragraphs = body.split(/<\/p>/i).filter((p) => textOf(p));
    if (paragraphs.length > 1 && !/<br/i.test(paragraphs[0])) note = true;

    const flat = body.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n');
    for (const raw of flat.split('\n')) {
      const text = textOf(raw).replace(EDITOR_NOTE, '').replace(/\s+([，。！？；、：])/g, '$1').trim();
      if (!text) continue;
      lines.push(...splitClauses(text));
    }
  }
  return { dynasty, lines, note };
}

/** 一句一行：在 `。！？；` 处断开（标点留在句尾） */
function splitClauses(line) {
  const out = [];
  let buf = '';
  for (const ch of line) {
    buf += ch;
    if (CLAUSE.test(ch)) {
      out.push(buf.trim());
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf.trim());
  return out.filter(Boolean);
}

async function main() {
  mkdirSync(RAW, { recursive: true });

  const listHtml = await page('songsan', LIST_URL);
  if (!listHtml) throw new Error(`抓不到《宋词三百首》全集页: ${LIST_URL}`);

  const entries = parseList(listHtml);
  if (!entries.length) throw new Error('全集页解析出 0 首，版式变了？');

  // 同一首偶尔在两卷里都挂着（选本互见），按 URL 去重
  const seen = new Set();
  const uniq = entries.filter((e) => (seen.has(e.url) ? false : seen.add(e.url)));

  const out = [];
  const skipped = [];
  let notes = 0;
  for (const [i, e] of uniq.entries()) {
    const html = await page(e.name, e.url);
    const { dynasty, lines, note } = html ? parsePoem(html) : { dynasty: '', lines: [], note: false };
    if (!lines.length) {
      skipped.push(`${e.title}(${e.author})`);
      continue;
    }
    if (note) notes += 1;
    out.push({ title: e.title, author: e.author, dynasty: dynasty || '宋', lines });
    if ((i + 1) % 50 === 0) console.log(`  已解析 ${i + 1}/${uniq.length}`);
  }

  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  const authors = new Set(out.map((e) => e.author).filter(Boolean));
  const volumes = new Set(entries.map((e) => e.volume).filter(Boolean));
  console.log(
    `\n宋词三百首: ${out.length} 首 / ${authors.size} 位作者 / ${volumes.size} 卷 / ` +
      `${entries.length - uniq.length} 首重复 / ${notes} 首带词序`,
  );
  if (skipped.length) console.log(`跳过（正文没解析出来）: ${skipped.join('、')}`);
  console.log(`输出: ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB)`);
  console.log('样例:', JSON.stringify(out.find((e) => e.title.includes('水调歌头')) ?? out[0], null, 2));
}

await main();
