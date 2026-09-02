#!/usr/bin/env node
/**
 * build-db.mjs — 把 chinese-poetry 语料导入 SQLite（assets/poetry.db）
 *
 * 用法:
 *   node scripts/build-db.mjs                # 精简语料（唐诗三百首/千家诗/诗经/楚辞/花间集/南唐词）
 *   node scripts/build-db.mjs --full         # 完整语料（+全宋词/元曲/古文观止/纳兰/曹操/幽梦影/论语/四书/蒙学）
 *   node scripts/build-db.mjs --data <dir>   # 指定语料目录（默认 .data/chinese-poetry）
 *   node scripts/build-db.mjs --out <file>   # 指定输出文件（默认 assets/poetry.db）
 *   node scripts/build-db.mjs --check        # 只校验已有 DB，不重建
 *
 * 语料中的繁体文本统一经 opencc-js（t→cn）转成简体后入库。
 */
import { existsSync, mkdirSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { Converter } from 'opencc-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const DATA_DIR = resolve(arg('data', join(ROOT, '.data', 'chinese-poetry')));
const OUT = resolve(arg('out', join(ROOT, 'assets', 'poetry.db')));
const FULL = process.argv.includes('--full');
const CHECK = process.argv.includes('--check');

const toCn = Converter({ from: 't', to: 'cn' });
const s = (x) => (typeof x === 'string' ? toCn(x).trim() : '');

/** 每日精选池：始终只用这些精选集 */
const DAILY_COLLECTIONS = new Set([
  'tangshi',
  'qianjiashi',
  'shijing',
  'chuci',
  'huajianji',
  'nantang',
]);

// ---------------------------------------------------------------- 语料适配

const dynOf = (text) => s(text || '');
const empty = (x) => !x || !x.trim();

function dynFromAuthorPrefix(author) {
  // “（唐）孟浩然” / “(宋) 苏轼”
  const m = /^\s*[（(]([^（）()]{1,8})[）)]\s*/.exec(author || '');
  if (!m) return { dynasty: '', author: s(author) };
  return { dynasty: s(m[1]), author: s(author.slice(m[0].length)) };
}

function loadJson(rel) {
  const p = join(DATA_DIR, rel);
  if (!existsSync(p)) throw new Error(`缺少语料文件: ${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

/** 唐诗三百首 / 千家诗：{title, content:[{type, content:[{chapter,subchapter,author,paragraphs}]}]} */
function parseTangQian(rel, coll, name, kind) {
  const d = loadJson(rel);
  const out = [];
  const groups = Array.isArray(d.content) ? d.content : [d];
  for (const g of groups) {
    const inner = g.content ?? g.paragraphs ?? [];
    for (const it of inner) {
      if (!Array.isArray(it.paragraphs) || !it.paragraphs.length) continue;
      const { dynasty, author } = dynFromAuthorPrefix(it.author);
      const title = !empty(it.subchapter) ? s(it.subchapter) : s(it.chapter);
      if (empty(title)) continue;
      out.push({ coll, name, kind, dynasty, author, title, subtitle: '', lines: it.paragraphs.map(s) });
    }
  }
  return out;
}

/** 诗经: [{title, chapter, section, content:[...]}] */
function parseShijing() {
  const arr = loadJson('诗经/shijing.json');
  const out = [];
  for (const it of arr) {
    if (!Array.isArray(it.content) || !it.content.length) continue;
    const subtitle = [s(it.chapter), s(it.section)].filter(Boolean).join('·');
    out.push({
      coll: 'shijing', name: '诗经', kind: '诗',
      dynasty: '先秦', author: '', title: s(it.title), subtitle, lines: it.content.map(s),
    });
  }
  return out;
}

/** 楚辞: [{title, section, author, content:[...]}] */
function parseChuci() {
  const arr = loadJson('楚辞/chuci.json');
  const out = [];
  for (const it of arr) {
    if (!Array.isArray(it.content) || !it.content.length) continue;
    out.push({
      coll: 'chuci', name: '楚辞', kind: '楚辞',
      dynasty: '先秦', author: s(it.author), title: s(it.title), subtitle: s(it.section),
      lines: it.content.map(s),
    });
  }
  return out;
}

/** 花间集 juan 文件（跳过 0-preface） */
function parseHuajian() {
  const dir = join(DATA_DIR, '五代诗词', 'huajianji');
  const files = readdirSync(dir).filter((f) => /^huajianji-\d+-juan\.json$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    const vol = /huajianji-(\d+)-juan/.exec(f)[1];
    const arr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const it of arr) {
      if (!Array.isArray(it.paragraphs) || !it.paragraphs.length) continue;
      const title = s(it.title || it.rhythmic || '');
      if (empty(title)) continue;
      out.push({
        coll: 'huajianji', name: '花间集', kind: '词', dynasty: '五代',
        author: s(it.author), title,
        subtitle: `卷${vol}${it.rhythmic && s(it.rhythmic) !== title ? '·' + s(it.rhythmic) : ''}`,
        lines: it.paragraphs.map(s),
      });
    }
  }
  return out;
}

/** 南唐词: poetrys.json [{rhythmic,title,author,paragraphs}] */
function parseNantang() {
  const arr = loadJson('五代诗词/nantang/poetrys.json');
  const out = [];
  for (const it of arr) {
    if (!Array.isArray(it.paragraphs) || !it.paragraphs.length) continue;
    const title = s(it.title || it.rhythmic || '');
    if (empty(title)) continue;
    out.push({
      coll: 'nantang', name: '南唐词', kind: '词', dynasty: '南唐',
      author: s(it.author), title, subtitle: s(it.rhythmic) || '',
      lines: it.paragraphs.map(s),
    });
  }
  return out;
}

/** 全宋词: ci.song.*.json [{author, rhythmic, paragraphs}] */
function parseCiSong() {
  const dir = join(DATA_DIR, '宋词');
  const files = readdirSync(dir).filter((f) => /^ci\.song\.\d+.*\.json$/.test(f)).sort();
  const out = [];
  for (const f of files) {
    const arr = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    for (const it of arr) {
      if (!Array.isArray(it.paragraphs) || !it.paragraphs.length) continue;
      const title = s(it.rhythmic || it.title || '');
      if (empty(title) && empty(s(it.author))) continue;
      out.push({
        coll: 'ci', name: '全宋词', kind: '词', dynasty: '宋',
        author: s(it.author), title, subtitle: '', lines: it.paragraphs.map(s),
      });
    }
  }
  return out;
}

/** 元曲: [{dynasty:'yuan'|'ming'|..., author, title, paragraphs}] */
function parseYuanqu() {
  const arr = loadJson('元曲/yuanqu.json');
  const dynMap = { yuan: '元', ming: '明', qing: '清' };
  const out = [];
  for (const it of arr) {
    if (!Array.isArray(it.paragraphs) || !it.paragraphs.length) continue;
    const raw = s(it.title || '');
    const title = empty(raw) ? '' : raw;
    const subtitle = '';
    out.push({
      coll: 'qu', name: '元曲', kind: '曲', dynasty: dynMap[it.dynasty] || s(it.dynasty),
      author: s(it.author), title, subtitle, lines: it.paragraphs.map(s),
    });
  }
  return out;
}

/** 古文观止: {content:[{title:卷, content:[{chapter,source,author,paragraphs}]}]} */
function parseGuwen() {
  const d = loadJson('蒙学/guwenguanzhi.json');
  const out = [];
  const volumes = Array.isArray(d.content) ? d.content : [];
  for (const vol of volumes) {
    const volName = s(vol.title || '');
    const list = Array.isArray(vol.content) ? vol.content : [];
    for (const it of list) {
      if (!Array.isArray(it.paragraphs) || !it.paragraphs.length) continue;
      let dynasty = '', author = s(it.author || '');
      const m = /^(.+?)[:：]\s*(.*)$/.exec(author);
      if (m && m[1].length <= 6) { dynasty = s(m[1]); author = s(m[2]); }
      out.push({
        coll: 'guwen', name: '古文观止', kind: '文', dynasty, author,
        title: s(it.chapter || ''), subtitle: [volName, s(it.source)].filter(Boolean).join(' · '),
        lines: it.paragraphs.map(s),
      });
    }
  }
  return out;
}

/** 纳兰性德: [{title, para, author}] */
function parseNalan() {
  const arr = loadJson('纳兰性德/纳兰性德诗集.json');
  const out = [];
  for (const it of arr) {
    const lines = (it.para ?? it.paragraphs ?? []);
    if (!Array.isArray(lines) || !lines.length) continue;
    out.push({
      coll: 'nalan', name: '纳兰性德词', kind: '词', dynasty: '清',
      author: s(it.author || '纳兰性德'), title: s(it.title || ''), subtitle: '', lines: lines.map(s),
    });
  }
  return out;
}

/** 曹操诗集: [{title, paragraphs}] */
function parseCaocao() {
  const arr = loadJson('曹操诗集/caocao.json');
  const out = [];
  for (const it of arr) {
    if (!Array.isArray(it.paragraphs) || !it.paragraphs.length) continue;
    out.push({
      coll: 'caocao', name: '曹操诗集', kind: '诗', dynasty: '东汉',
      author: '曹操', title: s(it.title || ''), subtitle: '', lines: it.paragraphs.map(s),
    });
  }
  return out;
}

/** 幽梦影: [{content, comment}] */
function parseYoumengying() {
  const arr = loadJson('幽梦影/youmengying.json');
  const out = [];
  let i = 0;
  for (const it of arr) {
    i += 1;
    const body = s(it.content || '');
    if (!body) continue;
    out.push({
      coll: 'youmengying', name: '幽梦影', kind: '文', dynasty: '清',
      author: '张潮', title: `幽梦影 · 第${i}则`, subtitle: '', lines: [body],
    });
  }
  return out;
}

/** 论语/大学/中庸/孟子: {chapter, paragraphs} 或 [{chapter, paragraphs}] */
function parseClassic(rel, coll, name, author, dynasty) {
  const d = loadJson(rel);
  const list = Array.isArray(d) ? d : [d];
  const out = [];
  for (const it of list) {
    if (!Array.isArray(it.paragraphs) || !it.paragraphs.length) continue;
    out.push({
      coll, name, kind: '文', dynasty, author,
      title: s(it.chapter || ''), subtitle: '', lines: it.paragraphs.map(s),
    });
  }
  return out;
}

/** 声律启蒙: {title: 卷, content:[{chapter, paragraphs:[段...]}]} 每段一行超长 —— 拆成 一联一行 */
function parseShenglv() {
  const d = loadJson('蒙学/shenglvqimeng.json');
  const out = [];
  for (const vol of Array.isArray(d.content) ? d.content : []) {
    const volName = s(vol.title || '');
    for (const it of vol.content ?? []) {
      const chapter = s(it.chapter || '');
      const lines = (it.paragraphs ?? []).map(s);
      // 每段本身包含若干“联”，保留段落内换行为顿开，不强行拆句
      for (let i = 0; i < lines.length; i += 1) {
        out.push({
          coll: 'shenglv', name: '声律启蒙', kind: '蒙学', dynasty: '清',
          author: '车万育', title: `${volName} · ${chapter} · ${i + 1}`,
          subtitle: `${volName} ${chapter}`, lines: [lines[i]],
        });
      }
    }
  }
  return out;
}

/** 蒙学短文: 全文一段一条；若 content 为 {chapter,paragraphs}[] 则按章拆条 */
function parseMengxue(rel, coll, name, author, dynasty) {
  const d = loadJson(rel);
  const content = d.content;
  if (Array.isArray(content) && content.length && content[0] && typeof content[0] === 'object') {
    return content.map((it, i) => ({
      coll, name, kind: '蒙学', dynasty, author,
      title: s(it.chapter || `${name} · ${i + 1}`), subtitle: '',
      lines: (it.paragraphs ?? []).map(s),
    })).filter((r) => r.lines.length);
  }
  const lines = (d.paragraphs ?? (Array.isArray(content) ? content : []) ?? []).map(s);
  if (!lines.length) return [];
  return [{
    coll, name, kind: '蒙学', dynasty, author,
    title: s(d.title || name), subtitle: '', lines,
  }];
}

// ---------------------------------------------------------------- 汇总配置

/** 返回 [rows, {name, kind}]；rows 为原始行 */
const PARSERS = (full) => [
  [() => parseTangQian('蒙学/tangshisanbaishou.json', 'tangshi', '唐诗三百首', '诗'), 'tangshi'],
  [() => parseTangQian('蒙学/qianjiashi.json', 'qianjiashi', '千家诗', '诗'), 'qianjiashi'],
  [parseShijing, 'shijing'],
  [parseChuci, 'chuci'],
  [parseHuajian, 'huajianji'],
  [parseNantang, 'nantang'],
  ...(full ? [
    [parseCiSong, 'ci'],
    [parseYuanqu, 'qu'],
    [parseGuwen, 'guwen'],
    [parseNalan, 'nalan'],
    [parseCaocao, 'caocao'],
    [parseYoumengying, 'youmengying'],
    [() => parseClassic('论语/lunyu.json', 'lunyu', '论语', '孔子及弟子', '春秋'), 'lunyu'],
    [() => parseClassic('四书五经/daxue.json', 'daxue', '大学', '曾参', '春秋'), 'daxue'],
    [() => parseClassic('四书五经/zhongyong.json', 'zhongyong', '中庸', '子思', '战国'), 'zhongyong'],
    [() => parseClassic('四书五经/mengzi.json', 'mengzi', '孟子', '孟子及其弟子', '战国'), 'mengzi'],
    [parseShenglv, 'shenglv'],
    [() => parseMengxue('蒙学/sanzijing-new.json', 'sanzijing', '三字经', '王应麟', '宋'), 'sanzijing'],
    [() => parseMengxue('蒙学/baijiaxing.json', 'baijiaxing', '百家姓', '', ''), 'baijiaxing'],
    [() => parseMengxue('蒙学/qianziwen.json', 'qianziwen', '千字文', '周兴嗣', '南朝'), 'qianziwen'],
    [() => parseMengxue('蒙学/dizigui.json', 'dizigui', '弟子规', '李毓秀', '清'), 'dizigui'],
  ] : []),
];

// ---------------------------------------------------------------- 写库

function build() {
  const rows = [];
  const colMeta = new Map(); // coll -> {name, kind, count}
  for (const [parser, coll] of PARSERS(FULL)) {
    const before = rows.length;
    let batch;
    try {
      batch = parser();
    } catch (e) {
      console.error(`   ✗ ${coll}: ${e.message}`);
      throw e;
    }
    for (const r of batch) {
      if (!r.lines.length) continue;
      const lines = r.lines.filter((l) => !empty(l));
      if (!lines.length) continue;
      const name = r.name || coll;
      rows.push({
        collection: coll,
        name,
        kind: r.kind || '诗',
        dynasty: r.dynasty || '',
        author: r.author || '',
        title: r.title || '',
        subtitle: r.subtitle || '',
        content: lines.join('\n'),
        daily: DAILY_COLLECTIONS.has(coll) ? 1 : 0,
      });
    }
    colMeta.set(coll, { name: rows[before]?.name ?? coll, count: rows.length - before });
    console.log(`   ✓ ${coll}: +${rows.length - before} 首`);
  }
  if (!rows.length) throw new Error('没有导入任何诗词！请检查语料目录。');

  mkdirSync(dirname(OUT), { recursive: true });
  const db = new DatabaseSync(OUT);
  db.exec(`
    PRAGMA journal_mode=OFF;
    PRAGMA synchronous=OFF;
    DROP TABLE IF EXISTS poems;
    DROP TABLE IF EXISTS collections;
    DROP TABLE IF EXISTS favorites;
    DROP TABLE IF EXISTS history;
    DROP TABLE IF EXISTS meta;
    CREATE TABLE poems (
      id         INTEGER PRIMARY KEY,
      collection TEXT NOT NULL,
      name       TEXT NOT NULL,
      kind       TEXT NOT NULL,
      dynasty    TEXT NOT NULL DEFAULT '',
      author     TEXT NOT NULL DEFAULT '',
      title      TEXT NOT NULL DEFAULT '',
      subtitle   TEXT NOT NULL DEFAULT '',
      content    TEXT NOT NULL,
      daily      INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX idx_poems_collection ON poems(collection);
    CREATE INDEX idx_poems_daily ON poems(daily, id);
    CREATE TABLE collections (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      kind TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      daily INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE favorites (
      poem_id INTEGER PRIMARY KEY,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE history (
      date TEXT PRIMARY KEY,
      poem_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
    );
    CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
  `);

  const ins = db.prepare(`INSERT INTO poems
    (collection,name,kind,dynasty,author,title,subtitle,content,daily)
    VALUES (?,?,?,?,?,?,?,?,?)`);
  db.exec('BEGIN');
  for (const r of rows) {
    ins.run(r.collection, r.name, r.kind, r.dynasty, r.author, r.title, r.subtitle, r.content, r.daily);
  }
  db.exec('COMMIT');

  const colIns = db.prepare('INSERT INTO collections (id,name,kind,count,daily) VALUES (?,?,?,?,?)');
  db.exec('BEGIN');
  for (const [coll, { name, count }] of colMeta) {
    colIns.run(coll, name, rows.find((r) => r.collection === coll)?.kind ?? '诗', count,
      DAILY_COLLECTIONS.has(coll) ? 1 : 0);
  }
  db.exec('COMMIT');

  const metaIns = db.prepare('INSERT INTO meta (key,value) VALUES (?,?)');
  db.exec('BEGIN');
  metaIns.run('schema_version', '1');
  metaIns.run('dataset', FULL ? 'full' : 'standard');
  metaIns.run('built_at', new Date().toISOString());
  metaIns.run('poem_count', String(rows.length));
  metaIns.run('daily_count', String(rows.filter((r) => r.daily).length));
  db.exec('COMMIT');

  // 统计
  const st = db.prepare(`SELECT collection, COUNT(*) n, SUM(daily) d FROM poems GROUP BY collection`).all();
  const total = rows.length;
  const daily = rows.filter((r) => r.daily).length;
  const sizeMb = (statSync(OUT).size / 1024 / 1024).toFixed(2);
  db.close();

  console.log('\n数据库已生成:');
  console.log(`  文件: ${OUT} (${sizeMb} MB)`);
  for (const r of st) console.log(`  ${r.collection.padEnd(12)} ${String(r.n).padStart(6)} 首  daily=${r.d}`);
  console.log(`  合计: ${total} 首（每日精选池 ${daily} 首）`);
}

function check() {
  if (!existsSync(OUT)) throw new Error(`数据库不存在: ${OUT}，请先运行 just db`);
  const db = new DatabaseSync(OUT, { readOnly: true });
  const total = db.prepare('SELECT COUNT(*) n FROM poems').get().n;
  const daily = db.prepare('SELECT COUNT(*) n FROM poems WHERE daily=1').get().n;
  const fav = db.prepare('SELECT COUNT(*) n FROM favorites').get().n;
  const meta = Object.fromEntries(db.prepare('SELECT key,value FROM meta').all().map((r) => [r.key, r.value]));
  const sample = db.prepare('SELECT id,collection,title,author,substr(content,1,40) c FROM poems WHERE daily=1 ORDER BY id LIMIT 1').get();
  db.close();
  console.log('DB 校验 OK:');
  console.log(`  dataset=${meta.dataset ?? '?'}  built_at=${meta.built_at ?? '?'}`);
  console.log(`  poems=${total}  daily_pool=${daily}  favorites=${fav}`);
  console.log('  样例:', JSON.stringify(sample));
  if (!total || !daily) throw new Error('DB 为空或每日池为空');
}

if (CHECK) {
  check();
} else {
  console.log(`语料目录: ${DATA_DIR}`);
  console.log(`模式: ${FULL ? 'full（完整语料）' : 'standard（精选语料）'}`);
  build();
}
