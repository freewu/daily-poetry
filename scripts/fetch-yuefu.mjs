#!/usr/bin/env node
/**
 * fetch-yuefu.mjs — 从中文维基文库抓《乐府诗集》一百卷 → .data/yuefu/yuefu.json
 *
 * 用法:
 *   node scripts/fetch-yuefu.mjs            # 抓（已缓存的分卷不重复请求）
 *   node scripts/fetch-yuefu.mjs --refresh  # 丢掉缓存重抓
 *
 * 语料不走 chinese-poetry 仓库（那边没有乐府诗集），来源是维基文库：
 *   https://zh.wikisource.org/wiki/Category:樂府詩集
 * 每卷一个页面 `樂府詩集/001卷 … 100卷`，卷内两层标题：
 *   ==曲调（作者）==        ← 曲调 / 乐章名
 *   ===诗题===              ← 一首诗，正文在同一标题下
 * 少数卷（卷一）用 `{{:页面名}}` 转写，正文在独立页面里（`<poem>` 包着）。
 *
 * 分类页的卷列表并不完整（一百卷只列出九十九个），所以卷号直接按 001…100 生成，
 * 缺哪卷就跳过哪卷；批量请求偶尔会漏页面（见过 058 卷），缺的会单独补一次。
 * 抓下来的原文**不做简繁转换**（维基文库繁简混排，转换交给 build-db 的 variants()）。
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const DATA = resolve(ROOT, '.data', 'yuefu');
const RAW = join(DATA, 'raw');
const OUT = join(DATA, 'yuefu.json');
const REFRESH = process.argv.includes('--refresh');

const API = 'https://zh.wikisource.org/w/api.php';
const UA = 'daily-poetry-bot/1.0 (+https://github.com/freewu/daily-poetry)';
const VOL_COUNT = 100;
const BATCH = 50;

/** 朝代字（出现在标题旁的专名模板里，如「齊」「梁」「唐」） */
const DYNASTIES = [
  '漢', '汉', '後漢', '魏', '晉', '晋', '宋', '齊', '齐', '梁', '陳', '陈', '隋', '唐',
  '周', '秦', '吳', '吴', '蜀', '北魏', '北齊', '北周', '南朝', '五代', '元', '明', '清',
  // 先秦诸侯国（「【猗蘭操】魯·孔子」）
  '魯', '鲁', '楚', '衛', '卫', '燕', '鄭', '郑', '韓', '韩', '趙', '赵', '蔡', '曹', '越',
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** 卷次用中文（subtitle 显示「卷五十八 · 琴曲歌辞二」，跟原书一致） */
const CN_DIGITS = '〇一二三四五六七八九';
function cnNumber(n) {
  if (n <= 0) return String(n);
  if (n < 10) return CN_DIGITS[n];
  if (n === 10) return '十';
  if (n < 20) return `十${CN_DIGITS[n % 10]}`;
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  return `${CN_DIGITS[tens]}十${ones ? CN_DIGITS[ones] : ''}`;
}

async function api(params, attempt = 1) {
  const url = `${API}?${new URLSearchParams({ format: 'json', formatversion: '2', ...params })}`;
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (attempt >= 3) throw e;
    await sleep(800 * attempt);
    return api(params, attempt + 1);
  }
}

/** 一批页面（≤50）的 wikitext；缺失的页面不出现在返回值里 */
async function fetchWikitext(titles) {
  const out = new Map();
  for (let i = 0; i < titles.length; i += BATCH) {
    const batch = titles.slice(i, i + BATCH);
    const d = await api({
      action: 'query',
      prop: 'revisions',
      rvprop: 'content',
      rvslots: 'main',
      titles: batch.join('|'),
    });
    for (const p of d.query?.pages ?? []) {
      if (p.missing) continue;
      const content = p.revisions?.[0]?.slots?.main?.content;
      if (typeof content === 'string') out.set(p.title, content);
    }
    // 批量请求偶尔有页面没跟着回来（见过 058 卷），缺的单独补一次
    const gap = batch.filter((t) => !out.has(t));
    if (gap.length) {
      await sleep(200);
      const retry = await api({
        action: 'query',
        prop: 'revisions',
        rvprop: 'content',
        rvslots: 'main',
        titles: gap.join('|'),
      });
      for (const p of retry.query?.pages ?? []) {
        if (p.missing) continue;
        const content = p.revisions?.[0]?.slots?.main?.content;
        if (typeof content === 'string') out.set(p.title, content);
      }
    }
    if (i + BATCH < titles.length) await sleep(250);
  }
  return out;
}

const cacheName = (prefix, title) =>
  join(RAW, `${prefix}-${title.replace(/[^\p{Script=Han}\w.-]+/gu, '_')}.txt`);

function readCache(path) {
  if (REFRESH || !existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  return text.startsWith('\u0000') ? null : text; // \u0000 = 确认「该页不存在」
}

function writeCache(path, text) {
  writeFileSync(path, text ?? '\u0000');
}

// ---------------------------------------------------------------- 清洗

/** header / footer / 质量模板整块去掉（多行，带 } 收尾） */
function stripBlocks(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<\/?(?:onlyinclude|noinclude|includeonly|center|small|big|br|div|span)\b[^>]*>/g, '')
    .replace(/\{\{(?:header2?|footer|Textquality|PD-old|正体化)\b[\s\S]*?\}\}/g, '');
}

const DROP_TPL = new Set(['*', 'PUA', '？', '?', '*'.repeat(1)]);

/** 模板：`{{*|注}}` / `{{PUA|}}` / `{{？|左石右嵬}}` 丢；`{{另|甲|乙}}` 取甲；其余取末参 */
function stripTemplates(src) {
  let s = src;
  for (let i = 0; i < 12; i += 1) {
    const next = s.replace(/\{\{([^{}]*)\}\}/g, (_, body) => {
      const parts = body.split('|').map((x) => x.trim());
      const name = parts[0];
      if (DROP_TPL.has(name)) return '';
      if (name === '另') return parts[1] ?? '';
      return parts.length > 1 ? parts[parts.length - 1] : '';
    });
    if (next === s) break;
    s = next;
  }
  return s;
}

/** 行内标记：[[甲|乙]] → 乙，[[甲]] → 甲，-{云}- → 云，{魚且} → 去，'''粗体''' → 去 */
function stripInline(src) {
  return src
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/-\{([^{}]*)\}-/g, '$1')
    .replace(/\{[^{}]*\}/g, '')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '');
}

/**
 * 题解（不是诗）：`《宋書•樂志》曰：「…」`「謝希逸《琴論》曰：「…」」。
 * 判据是「书名号 + 曰/云 + 冒号」同现 —— 诗里不会这么写。
 */
const isScholia = (line) =>
  /^(?:[一二三四五六七八九十]曰|[（(]?《)/.test(line) ||
  (/[曰云][：:]/.test(line) && /[《》]/.test(line));

/** 一行正文：清洗 + 折叠空白（全角空格保留，它是乐府的「顿」） */
function cleanLine(raw) {
  const s = stripInline(stripTemplates(stripBlocks(raw)))
    .replace(/[\u00a0\t]/g, ' ')
    .replace(/ {2,}/g, '\u3000')
    .trim();
  return s;
}

/** 把整段正文拆成一行一句、两句一行的版面（超长句自己一行） */
function layoutLines(text) {
  const flat = text.replace(/\s*\n\s*/g, '').replace(/\u3000/g, ' ');
  const sentences = flat.split(/(?<=[。！？；?!])/).map((x) => x.trim()).filter(Boolean);
  if (!sentences.length) return [];
  const out = [];
  let buf = '';
  for (const part of sentences) {
    const next = buf ? buf + part : part;
    if (buf && (next.length > 28 || buf.length + part.length > 28)) {
      out.push(buf);
      buf = part;
    } else {
      buf = next;
      if (/[。！？?!]$/.test(buf) && buf.length >= 12) {
        out.push(buf);
        buf = '';
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}

// ---------------------------------------------------------------- 标题与作者

/** `==白雪歌{{*|{{ProperNoun|齊}}{{ProperNoun|徐孝嗣}}}}==` → 标题「白雪歌」+ 齊 / 徐孝嗣 */
function parseHeading(raw) {
  const properNouns = [...raw.matchAll(/\{\{ProperNoun\|([^{}|]+)\}\}/g)].map((m) => m[1].trim());
  // 括号里的作者：「宋明堂歌（謝莊）」「白頭吟（三首）」—— 后者是首数，不是作者
  const paren = [...raw.matchAll(/[（(]([^（）()]{1,12})[）)]/g)]
    .map((m) => m[1].trim())
    .filter((x) => x && !/^[一二三四五六七八九十百]+首$/.test(x) && !/[<>{}=]/.test(x));

  let dynasty = properNouns.find((x) => DYNASTIES.includes(x)) ?? '';
  let author = properNouns.filter((x) => x !== dynasty).pop() ?? '';
  if (!author && paren.length) {
    const last = paren[paren.length - 1];
    if (DYNASTIES.includes(last)) dynasty = last;
    else author = last;
  }

  // 「唐•白居易」「唐·李白」「晉·石崇」：专名模板 / 纯文本卷的标题里常带朝代前缀
  const prefixed = /^([\u4e00-\u9fa5]{1,3})\s*[•·・.]\s*(.+)$/.exec(author || cleanLine(raw));
  if (prefixed && DYNASTIES.includes(prefixed[1])) {
    dynasty = dynasty || prefixed[1];
    author = prefixed[2].trim();
  }

  const title = cleanLine(raw).replace(/[（(][^（）()]*[）)]\s*$/, '').trim();
  return { title, dynasty, author };
}

// ---------------------------------------------------------------- 卷解析

/** 卷内条目：一章可以没有 ===诗题===（`==白雪歌==` 下直接是正文） */
function parseVolume(text, volNo) {
  // header 里的 section 是卷名（「卷二　郊廟歌辭二」），stripBlocks 会把它整块删掉
  const headerSection = /^\|\s*section\s*=\s*(.+)$/m.exec(text)?.[1]?.trim() ?? '';
  const body = stripBlocks(text);
  // 「卷二　郊廟歌辭二」→「郊廟歌辭二」
  let series = cleanLine(headerSection).replace(/^卷[零一二三四五六七八九十百\d]+\s*/, '').trim();
  if (!series) {
    // 没 header 的卷（第五十八卷）开头是「卷五十八」+「琴曲歌辭二」两行
    const head = body.split('\n').slice(0, 6).map((l) => l.trim());
    series = head.find((l) => /^[\u4e00-\u9fa5]{2,12}$/.test(l) && !/^卷/.test(l)) ?? '';
  }

  const out = [];
  let chapter = '';
  let chapterOwner = { dynasty: '', author: '' };
  let lastTitle = ''; // `===同前===` 沿用上一首的题
  let cur = null;

  const flush = () => {
    if (!cur) return;
    const entry = cur;
    cur = null;
    // 转写页的正文才算数：同段里的「《汉书》曰…」是题解，不是诗
    const pieced = entry.transclusion ? '' : entry.pieces.join('');
    const lines = layoutLines(pieced);
    if (!lines.length && !entry.transclusion) return;
    out.push({
      volume: volNo,
      volumeLabel: `卷${cnNumber(volNo)}`,
      series,
      chapter: entry.chapter,
      chapterDynasty: entry.chapterDynasty,
      chapterAuthor: entry.chapterAuthor,
      title: entry.title,
      dynasty: entry.dynasty,
      author: entry.author,
      ...(entry.transclusion ? { transclusion: entry.transclusion } : {}),
      lines,
    });
  };

  for (const raw of body.split('\n')) {
    // 个别卷的标题少了尾部等号（`==唐郊天樂章`），补齐再按标题解析
    const line = raw
      .trim()
      .replace(/^(={2,6})\s*([^=].*?)\s*={0,6}$/, (_, eq, rest) => `${eq}${rest}${eq}`);
    if (!line) continue;
    if (/^\{\{(?:header2?|footer)\b/.test(line)) continue;

    // `===诗题===` 与 `====诗题====`（少数卷用到四级）：等号数决定层级
    const head = /^(={2,6})\s*([^=].*?)\s*\1$/.exec(line);
    if (head) {
      const level = head[1].length;
      const h = parseHeading(head[2]);
      if (level === 2) {
        flush();
        chapter = h.title;
        chapterOwner = { dynasty: h.dynasty, author: h.author };
        // 无 ===诗题=== 的卷：正文直接挂在 ==曲调== 下面
        cur = {
          chapter, chapterDynasty: h.dynasty, chapterAuthor: h.author,
          title: h.title, dynasty: h.dynasty, author: h.author, pieces: [],
        };
        continue;
      }
      if (level >= 3) {
        flush();
        const title = h.title === '同前' && lastTitle ? lastTitle : h.title;
        lastTitle = title;
        cur = {
          chapter,
          chapterDynasty: chapterOwner.dynasty,
          chapterAuthor: chapterOwner.author,
          title: title || chapter,
          dynasty: h.dynasty || chapterOwner.dynasty,
          author: h.author || chapterOwner.author,
          pieces: [],
        };
        continue;
      }
      flush();
      chapter = '';
      continue;
    }

    // 少数卷（第五十八卷）没维基化：`【詩題】朝代·作者` 一行一题，正文跟在后面
    const boxed = /^【(.+?)】\s*(.*)$/.exec(line);
    if (boxed) {
      flush();
      const title = boxed[1].replace(/[一二三四五六七八九十百]+首$/, '').trim();
      const h = parseHeading(boxed[2] || '');
      const resolved = title === '同前' && lastTitle ? lastTitle : title;
      lastTitle = resolved;
      chapter = resolved;
      chapterOwner = { dynasty: h.dynasty, author: h.author };
      cur = {
        chapter: resolved, chapterDynasty: h.dynasty, chapterAuthor: h.author,
        title: resolved, dynasty: h.dynasty, author: h.author, pieces: [],
      };
      continue;
    }

    // 维基语法：注疏(`:`) / 列表 / 表格 / 返回链接 / 解数标记
    if (/^[:*#;|!↑→─—]/.test(line)) continue;
    if (/^\{\{:.+\}\}$/.test(line)) {
      // 转写引用：正文在独立页面，记下来由主流程补
      if (cur) cur.transclusion = /^\{\{:(.+?)\}\}$/.exec(line)[1].trim();
      continue;
    }
    if (/^\{\{/.test(line)) continue; // 其余单行模板

    const text2 = cleanLine(line);
    if (!text2 || isScholia(text2)) continue;
    if (!cur) {
      // 卷首没有 ==曲调== 的零散段落（序、目录残行）：不当诗
      continue;
    }
    cur.pieces.push(text2);
  }
  flush();
  return out;
}

// ---------------------------------------------------------------- 转写页（<poem>）

function parseTransclusion(text) {
  // 转写页自带一份 header：`| author = 李白` / `| noauthor = 佚名` / `| times = 北宋`
  const field = (name) =>
    new RegExp(`^\\|[ \\t]*${name}[ \\t]*=[ \\t]*(.*)$`, 'm').exec(text)?.[1]?.trim() ?? '';
  const author = cleanLine(field('author')) || '';
  const noauthor = cleanLine(field('noauthor')) || '';
  const dynasty = cleanLine(field('times')) || '';

  const body = stripBlocks(text);
  const poem = /<poem>([\s\S]*?)<\/poem>/.exec(body)?.[1] ?? '';
  const source = poem || body.replace(/\{\{header[\s\S]*?\}\}/g, '');
  const lines = source
    .split('\n')
    .map((l) => cleanLine(l))
    .filter((l) => l && !/^[:*#;|!↑→─—]/.test(l) && !isScholia(l));
  // 转写页一行本来就是一两小句（「練時日　侯有望」），保住行内全角空格
  return {
    lines,
    author: author || (/^[\u4e00-\u9fa5]{2,6}$/.test(noauthor) ? '' : noauthor),
    dynasty,
  };
}

// ---------------------------------------------------------------- 主流程

async function main() {
  mkdirSync(RAW, { recursive: true });

  const volTitles = Array.from({ length: VOL_COUNT }, (_, i) => `樂府詩集/${String(i + 1).padStart(3, '0')}卷`);
  const texts = new Map();
  const missing = [];
  const toFetch = [];
  for (const title of volTitles) {
    const p = cacheName('vol', title);
    const cached = readCache(p);
    if (cached !== null) {
      if (cached) texts.set(title, cached);
      else missing.push(title);
    } else toFetch.push(title);
  }
  if (toFetch.length) {
    console.log(`抓分卷 ${toFetch.length} 个…`);
    const got = await fetchWikitext(toFetch);
    for (const title of toFetch) {
      const text = got.get(title) ?? null;
      writeCache(cacheName('vol', title), text);
      if (text) texts.set(title, text);
      else missing.push(title);
    }
  }

  const entries = [];
  for (let i = 1; i <= VOL_COUNT; i += 1) {
    const title = `樂府詩集/${String(i).padStart(3, '0')}卷`;
    const text = texts.get(title);
    if (!text) continue;
    entries.push(...parseVolume(text, i));
  }

  // 转写页：`{{:練時日}}`
  const pages = [...new Set(entries.filter((e) => e.transclusion).map((e) => e.transclusion))];
  const needPage = [];
  const pageText = new Map();
  for (const t of pages) {
    const p = cacheName('page', t);
    const cached = readCache(p);
    if (cached === null) needPage.push(t);
    else if (cached) pageText.set(t, cached);
  }
  if (needPage.length) {
    console.log(`抓转写页 ${needPage.length} 个…`);
    const got = await fetchWikitext(needPage);
    for (const t of needPage) {
      const text = got.get(t) ?? null;
      writeCache(cacheName('page', t), text);
      if (text) pageText.set(t, text);
    }
  }

  const out = [];
  for (const e of entries) {
    if (e.transclusion) {
      const text = pageText.get(e.transclusion);
      if (!text) continue;
      const page = parseTransclusion(text);
      if (!page.lines.length) continue;
      const { transclusion, ...rest } = e;
      void transclusion;
      out.push({
        ...rest,
        author: rest.author || page.author,
        dynasty: rest.dynasty || page.dynasty,
        lines: page.lines,
      });
    } else {
      out.push(e);
    }
  }

  writeFileSync(OUT, `${JSON.stringify(out)}\n`);
  const vols = new Set(out.map((e) => e.volume));
  const authors = new Set(out.map((e) => e.author).filter(Boolean));
  console.log(`\n乐府诗集: ${out.length} 首 / ${vols.size} 卷 / ${authors.size} 位署名作者`);
  if (missing.length) console.log(`缺失分卷: ${missing.join(', ')}`);
  console.log(`输出: ${OUT} (${(readFileSync(OUT).length / 1024).toFixed(0)} KB)`);
  const sample = out.find((e) => e.lines.length > 3) ?? out[0];
  console.log('样例:', JSON.stringify(sample, null, 2));
}

await main();
