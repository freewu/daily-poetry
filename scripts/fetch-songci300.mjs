#!/usr/bin/env node
/**
 * fetch-songci300.mjs — 从中文维基文库抓《宋词三百首》→ .data/songci300/songci300.json
 *
 * 用法:
 *   node scripts/fetch-songci300.mjs            # 抓（已缓存的不重复请求）
 *   node scripts/fetch-songci300.mjs --refresh  # 丢掉缓存重抓
 *
 * 语料不走 chinese-poetry 仓库（那边只有全宋词，没有这部选集），来源是维基文库：
 *   https://zh.wikisource.org/wiki/宋詞三百首
 * 整本书在**一个页面**里，一条一首：
 *
 *   =='''宴山亭·北行見杏花'''（[[Author:趙佶|趙佶]]）==   ← 二级标题 = 一首
 *   （丙辰中秋，歡飲達旦…）                              ← 词序（有就收，`（小序略）` 是占位符，丢）
 *   <poem>
 *   裁翦冰綃，輕疊數重，淡著燕脂勻注。…
 *   </poem>
 *
 * 两个例外：
 * - `[[青玉案 (辛棄疾)]]` 这条只给链接，正文在独立页面（`{{:青玉案 (辛棄疾)}}`），
 *   题名 / 副题 / 作者 / 朝代得从那个页面的 `{{header}}` 里读。
 * - 少数几首把上下阕写在同一行里，用两个全角空格隔开（`…幾番春暮？　　憑寄離恨…`），
 *   这里拆成两行 —— 跟库里其他词一样，一句一行。
 *
 * 抓下来的原文**不做简繁转换**（维基文库繁简混排，转换交给 build-db 的 variants()）。
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { cacheName, fetchWikitext, readCache, stripWikitext, writeCache } from './wikitext.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA = resolve(ROOT, '.data', 'songci300');
const RAW = join(DATA, 'raw');
const OUT = join(DATA, 'songci300.json');
const REFRESH = process.argv.includes('--refresh');

const PAGE = '宋詞三百首';

/** 朝代：整本选集是宋词，只有这几位是五代 / 南唐人（其余按宋算） */
const DYNASTY_OF = new Map([
  ['馮延已', '五代'],
  ['馮延巳', '五代'],
  ['李璟', '五代'],
  ['李煜', '五代'],
]);

/** 序占位符：维基编者没录序的地方写「（小序略）」，不是正文 */
const SKIP_NOTE = /^[（(]\s*小序略\s*[）)]$/;

/** 一行正文：剥标记、去掉行首尾空白，保留书名号与括号 */
const cleanLine = (raw) => stripWikitext(raw).replace(/[\u00a0\t]/g, ' ').trim();

/** 句读：词里的「句」边界（逗号 / 顿号不算，它们是句内停顿） */
const CLAUSE = /[。！？；]/;

/**
 * 一句一行。语料里绝大多数行本来就是一句，但有两处把整阕挤在一行：
 * `裁翦冰綃，…幾番春暮？　　憑寄離恨…`（上下阕用两个全角空格隔开）。
 * 拆到跟全宋词一样的一句一行；词序（整段括在（）里）不拆，它是序不是词句。
 */
function splitClauses(line) {
  if (/^[（(].*[）)]$/.test(line)) return [line];
  const out = [];
  let buf = '';
  for (const ch of line) {
    buf += ch;
    if (CLAUSE.test(ch)) {
      out.push(buf);
      buf = '';
    }
  }
  if (buf.trim()) out.push(buf);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** `<poem>…</poem>` 里的正文：一行一句；`　　　　` 是上下阕的分界，先拆成两行 */
function poemLines(text) {
  const out = [];
  for (const raw of text.split('\n')) {
    for (const piece of cleanLine(raw).split(/\u3000{2,}/)) {
      const line = piece.replace(/^\u3000+|\u3000+$/g, '').trim();
      if (line) out.push(...splitClauses(line));
    }
  }
  return out;
}

/** `{{header}}` 里的字段（转写页才有） */
function headerField(text, name) {
  const m = new RegExp(`^\\|[ \\t]*${name}[ \\t]*=[ \\t]*(.*)$`, 'm').exec(text);
  return cleanLine(m?.[1] ?? '');
}

/**
 * 解析一个条目段：标题行 + 标题与 `<poem>` 之间的文字（词序 / 转写标记）+ 正文。
 * 返回 `{title, author, dynasty, lines, page?}`；`page` 是要另外抓的转写页。
 */
function parseEntry(heading, segment) {
  const poemAt = segment.indexOf('<poem>');
  const before = poemAt === -1 ? segment : segment.slice(0, poemAt);
  const poem = poemAt === -1 ? '' : /<poem>([\s\S]*?)<\/poem>/.exec(segment)?.[1] ?? '';

  // 词序 / 转写页标记 / 副题（`'''元夕'''`，只在转写那一条出现）
  const notes = [];
  let page = '';
  let section = '';
  for (const raw of before.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const transclusion = /^\{\{:(.+?)\}\}$/.exec(line);
    if (transclusion) {
      page = transclusion[1].trim();
      continue;
    }
    if (/^\{\{/.test(line)) continue;
    const sub = /^'''(.*?)'''$/.exec(line);
    if (sub) {
      section = cleanLine(sub[1]);
      continue;
    }
    const note = cleanLine(line);
    if (note && !SKIP_NOTE.test(note)) notes.push(note);
  }

  // 标题里的作者：`[[Author:趙佶|趙佶]]`
  const authorLink = /\[\[(?:Author|作者):([^|\]]+)(?:\|([^\]]+))?\]\]/.exec(heading);
  const author = cleanLine(authorLink?.[2] ?? authorLink?.[1] ?? '');

  // 标题：去掉作者链接 / 粗体 / 尾部括注；链接形态（`[[青玉案 (辛棄疾)]]`）留给转写页
  let title = '';
  if (!page) {
    title = cleanLine(heading.replace(authorLink?.[0] ?? '', ''))
      .replace(/[（(][^（）()]*[）)]\s*$/, '')
      .trim();
  }
  if (page && section) title = section;

  return { title, author, dynasty: DYNASTY_OF.get(author) ?? '宋', notes, page, lines: poemLines(poem) };
}

async function main() {
  mkdirSync(RAW, { recursive: true });

  const mainPath = cacheName(RAW, 'page', PAGE);
  let text = readCache(mainPath, REFRESH);
  if (text === null) {
    console.log(`抓《${PAGE}》…`);
    const got = await fetchWikitext([PAGE]);
    text = got.get(PAGE) ?? null;
    writeCache(mainPath, text);
  }
  if (!text) throw new Error(`维基文库上没有《${PAGE}》（或者抓取失败）`);

  // 只取 <onlyinclude> 里的正文，`{{album header}}` 是书的元数据
  const included = /<onlyinclude>([\s\S]*?)<\/onlyinclude>/.exec(text)?.[1] ?? text;
  const body = included.replace(/\{\{album header[\s\S]*?\n\}\}/g, '');

  const parts = body.split(/^==\s*(.+?)\s*==\s*$/m);
  const entries = [];
  for (let i = 1; i < parts.length; i += 2) {
    const entry = parseEntry(parts[i], parts[i + 1] ?? '');
    if (!entry.lines.length && !entry.page) continue;
    entries.push(entry);
  }

  // 转写页：`{{:青玉案 (辛棄疾)}}` —— 正文和题名 / 作者 / 朝代都在那个页面的 header 里
  const pages = [...new Set(entries.filter((e) => e.page).map((e) => e.page))];
  const pageText = new Map();
  const needPage = [];
  for (const t of pages) {
    const p = cacheName(RAW, 'page', t);
    const cached = readCache(p, REFRESH);
    if (cached === null) needPage.push(t);
    else if (cached) pageText.set(t, cached);
  }
  if (needPage.length) {
    console.log(`抓转写页 ${needPage.length} 个…`);
    const got = await fetchWikitext(needPage);
    for (const t of needPage) {
      const pageText1 = got.get(t) ?? null;
      writeCache(cacheName(RAW, 'page', t), pageText1);
      if (pageText1) pageText.set(t, pageText1);
    }
  }

  const out = [];
  for (const e of entries) {
    if (e.page) {
      const src = pageText.get(e.page);
      if (!src) continue;
      const hdrTitle = headerField(src, 'title');
      const hdrSection = headerField(src, 'section');
      const hdrAuthor = headerField(src, 'author');
      const lines = poemLines(/<poem>([\s\S]*?)<\/poem>/.exec(src)?.[1] ?? '');
      if (!lines.length) continue;
      const title = [hdrTitle, hdrSection || e.title].filter(Boolean).join('·');
      const author = hdrAuthor || e.author;
      out.push({
        title: title || e.title,
        author,
        dynasty: DYNASTY_OF.get(author) ?? '宋',
        lines,
      });
      continue;
    }
    if (!e.lines.length) continue;
    out.push({ title: e.title, author: e.author, dynasty: e.dynasty, lines: [...e.notes, ...e.lines] });
  }

  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  const authors = new Set(out.map((e) => e.author).filter(Boolean));
  const notes = out.filter((e) => /^[（(]/.test(e.lines[0] ?? '')).length;
  console.log(`\n宋词三百首: ${out.length} 首 / ${authors.size} 位作者 / ${notes} 首带词序`);
  console.log(`输出: ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB)`);
  console.log('样例:', JSON.stringify(out.find((e) => e.title.includes('·')) ?? out[0], null, 2));
}

await main();
