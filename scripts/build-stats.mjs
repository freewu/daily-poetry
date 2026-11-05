#!/usr/bin/env node
// 预统计：assets/poetry.db → assets/stats.json
//
// 集子的「按作者 / 按词牌」两张表以前是页面现算的（作者走 GROUP BY，
// 词牌更狠 —— 得把整集 2.1 万首正文读进内存再数），现在建库时算一遍存成 JSON，
// 页面只做首字母分组渲染。
//
//   node scripts/build-stats.mjs          # 生成 / 覆盖 assets/stats.json
//   node scripts/build-stats.mjs --check   # 只校验现有文件是不是最新的（just dbcheck）
//
// 产物入库（约 280KB），`just db` 会顺带重新生成；
// `__tests__/assets/stats-test.ts` 负责盯着它别跟 poetry.db 走散。

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DB_FILE = path.join(ROOT, 'assets/poetry.db');
const OUT_FILE = path.join(ROOT, 'assets/stats.json');

/** 产物格式版本：跟 `src/lib/stats.ts` 的 `STATS_VERSION` 必须一致 */
export const STATS_VERSION = 1;

// ------------------------------------------------------------------ 词牌
// 跟 `src/lib/cipai.ts` **一模一样**的两条规则。改一处就得改两处 ——
// `__tests__/assets/stats-test.ts` 会用 TS 那边的实现重新算一遍对拍。
//
// `·`（U+00B7）取前段（『长相思·山一程』），`・`（U+30FB）取后段
// （全宋词写的是「别名・正名」，如『酹江月・念奴娇』）。
const VOLUME = /^卷\s*\d+\s*[·.、]?\s*/;
const TOPIC_SEP = '·';
const ALIAS_SEP = '・';

function cipaiFromText(text) {
  const name = text.trim();
  if (!name) return '';
  if (name.includes(ALIAS_SEP)) {
    const parts = name
      .split(ALIAS_SEP)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts[parts.length - 1] ?? '';
  }
  return name.split(TOPIC_SEP)[0].trim();
}

function cipaiFrom(title, subtitle) {
  const sub = (subtitle ?? '').trim().replace(VOLUME, '').trim();
  return cipaiFromText(sub || (title ?? ''));
}

/** 只有「词」这一类集子才统计词牌（元曲是曲牌，诗集根本没有） */
const isCiKind = (kind) => (kind ?? '').trim() === '词';

// ------------------------------------------------------------------ 统计
const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

function authorsOf(db, coll) {
  const rows = db
    .prepare(
      `SELECT COALESCE(author, '') AS name, COALESCE(MAX(author_tw), '') AS nameTw, COUNT(*) AS count
       FROM poems WHERE collection = ? GROUP BY author`,
    )
    .all(coll);
  return rows
    .map((r) => ({
      name: r.name,
      // 繁体跟简体一样就不写，省几百 KB 的无意义重复
      ...(r.nameTw && r.nameTw !== r.name ? { nameTw: r.nameTw } : {}),
      count: r.count,
    }))
    .sort(byName);
}

function cipaiOf(db, coll) {
  const rows = db
    .prepare('SELECT title, subtitle, title_tw, subtitle_tw FROM poems WHERE collection = ?')
    .all(coll);
  const stats = new Map();
  for (const row of rows) {
    const name = cipaiFrom(row.title, row.subtitle);
    if (!name) continue;
    const hit = stats.get(name);
    if (hit) {
      hit.count += 1;
      continue;
    }
    const tw = cipaiFrom(row.title_tw || row.title, row.subtitle_tw || row.subtitle);
    stats.set(name, {
      name,
      ...(tw && tw !== name ? { nameTw: tw } : {}),
      count: 1,
    });
  }
  return [...stats.values()].sort((a, b) => b.count - a.count || byName(a, b));
}

function buildStats(db) {
  const collections = {};
  const rows = db
    .prepare('SELECT id, kind, count FROM collections ORDER BY daily DESC, id')
    .all();
  for (const coll of rows) {
    collections[coll.id] = {
      total: coll.count,
      authors: authorsOf(db, coll.id),
      // 不是词集就永远空着：页面照着 `isCiKind()` 走，数据这边先给个空数组
      cipai: isCiKind(coll.kind) ? cipaiOf(db, coll.id) : [],
    };
  }
  return { version: STATS_VERSION, collections };
}

// ------------------------------------------------------------------ main
function main() {
  const check = process.argv.includes('--check');
  if (!existsSync(DB_FILE)) {
    console.error(`找不到 ${path.relative(ROOT, DB_FILE)}，先跑 \`just db\``);
    process.exit(1);
  }
  const db = new DatabaseSync(DB_FILE, { readOnly: true });
  const json = `${JSON.stringify(buildStats(db))}\n`;
  db.close();

  if (check) {
    const current = existsSync(OUT_FILE) ? readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== json) {
      console.error('assets/stats.json 与 poetry.db 不一致，跑一下 `just db`');
      process.exit(1);
    }
    console.log('assets/stats.json 是最新的');
    return;
  }
  writeFileSync(OUT_FILE, json);
  const stats = JSON.parse(json);
  const authors = Object.values(stats.collections).reduce((n, c) => n + c.authors.length, 0);
  const cipai = Object.values(stats.collections).reduce((n, c) => n + c.cipai.length, 0);
  console.log(
    `assets/stats.json ${(Buffer.byteLength(json) / 1024).toFixed(0)}KB — ` +
      `${Object.keys(stats.collections).length} 部集子 / ${authors} 位作者 / ${cipai} 个词牌`,
  );
}

main();
