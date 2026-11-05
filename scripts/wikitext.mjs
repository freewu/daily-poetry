/**
 * wikitext.mjs — 中文维基文库的取页 / 缓存 / 清洗工具。
 *
 * 两个抓取脚本共用：`fetch-yuefu.mjs` 用取页 + wikitext 清洗，`fetch-songci300.mjs`
 * （古文岛，HTML）只借按页缓存那三件（`cacheName` / `readCache` / `writeCache`）。
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const API = 'https://zh.wikisource.org/w/api.php';
export const UA = 'daily-poetry-bot/1.0 (+https://github.com/freewu/daily-poetry)';
const BATCH = 50;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function api(params, attempt = 1) {
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
export async function fetchWikitext(titles) {
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

/** 缓存文件名：`<rawDir>/<prefix>-<标题>.txt`（标题里的斜杠 / 空格换成下划线） */
export const cacheName = (rawDir, prefix, title) =>
  join(rawDir, `${prefix}-${title.replace(/[^\p{Script=Han}\w.-]+/gu, '_')}.txt`);

/** 读缓存；返回 null = 没缓存过（要抓），'' = 缓存过且确认该页不存在 */
export function readCache(path, refresh = false) {
  if (refresh || !existsSync(path)) return null;
  const text = readFileSync(path, 'utf8');
  return text.startsWith('\u0000') ? '' : text;
}

/** 写缓存：`null` 表示页面不存在（下次不再请求） */
export function writeCache(path, text) {
  writeFileSync(path, text ?? '\u0000');
}

// ---------------------------------------------------------------- 清洗

/** header / footer / 质量模板整块去掉（多行，带 } 收尾） */
export function stripBlocks(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<ref[^>]*>[\s\S]*?<\/ref>/g, '')
    .replace(/<\/?(?:onlyinclude|noinclude|includeonly|center|small|big|br|div|span)\b[^>]*>/g, '')
    .replace(/\{\{(?:header2?|footer|Textquality|PD-old|正体化)\b[\s\S]*?\}\}/g, '');
}

const DROP_TPL = new Set(['*', 'PUA', '？', '?']);

/** 模板：`{{*|注}}` / `{{PUA|}}` / `{{？|左石右嵬}}` 丢；`{{另|甲|乙}}` 取甲；其余取末参 */
export function stripTemplates(src) {
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
export function stripInline(src) {
  return src
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/-\{([^{}]*)\}-/g, '$1')
    .replace(/\{[^{}]*\}/g, '')
    .replace(/'{2,}/g, '')
    .replace(/<[^>]+>/g, '');
}

/** 三步一起走：块级模板 → 行内模板 → 行内标记 */
export const stripWikitext = (src) => stripInline(stripTemplates(stripBlocks(src)));
