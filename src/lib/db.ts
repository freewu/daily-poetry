import type { SQLiteDatabase } from 'expo-sqlite';

import {
  CHALLENGE_LOG_KEY,
  parseLog,
  pushRecord,
  type ChallengeRecord,
} from './challenge';
import { cipaiOf } from './cipai';
import { createDailyPicker, DAILY_FAVORITES, DEFAULT_GAP, offsetFor, type DailyPicker } from './daily';
import type { CollectionMeta, DailyGap, Occasion, Poem } from './types';

export const DB_NAME = 'poetry.db';

/**
 * 随包数据库的结构版本，与 scripts/build-db.mjs 的 SCHEMA_VERSION 对应。
 * 不一致时（老版本安装、旧库缺繁体列、只多了新语料）启动会换用随包新库，
 * 收藏/足迹按「题目 + 作者 + 首句」重新对上（见 lib/db-bootstrap.ts）。
 */
export const DB_SCHEMA_VERSION = 8;

// ---------------------------------------------------------------- 设置 KV
export async function getSetting(db: SQLiteDatabase, key: string): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', key);
  return row?.value ?? null;
}

export async function setSetting(db: SQLiteDatabase, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
    key,
    value,
  );
}

// ---------------------------------------------------------------- 日期工具
export function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shiftDayStr(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d) + delta * 86400000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`;
}

/** 自 1970-01-01 起的天数（日期字符串按 UTC 计算，稳定可复现） */
export function dayNumber(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Math.floor(Date.UTC(y, m - 1, d) / 86400000);
}

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
export function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

export function prettyDate(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

// ---------------------------------------------------------------- 查询
export async function getPoem(db: SQLiteDatabase, id: number): Promise<Poem | null> {
  return db.getFirstAsync<Poem>('SELECT * FROM poems WHERE id = ?', id);
}

export async function listCollections(db: SQLiteDatabase): Promise<CollectionMeta[]> {
  return db.getAllAsync<CollectionMeta>('SELECT * FROM collections ORDER BY daily DESC, id');
}

export async function getCollection(db: SQLiteDatabase, id: string): Promise<CollectionMeta | null> {
  return db.getFirstAsync<CollectionMeta>('SELECT * FROM collections WHERE id = ?', id);
}

/**
 * 设置页「每日精选」的可选项：**所有**集子（精选的排前面、同档按收录数从多到少）
 * + 最后那个虚拟集子「我的收藏」。
 */
export interface DailyScopeOption {
  id: string;
  name: string;
  count: number;
  /** 1 = 建库时进精选池的那九部（没选过时默认就选这些） */
  daily: number;
}

export async function dailyScopeOptions(db: SQLiteDatabase): Promise<DailyScopeOption[]> {
  const colls = await db.getAllAsync<DailyScopeOption>(
    'SELECT id, name, count, daily FROM collections ORDER BY daily DESC, count DESC, id',
  );
  const fav = await favoriteCount(db);
  return [...colls, { id: DAILY_FAVORITES, name: '我的收藏', count: fav, daily: 0 }];
}

export async function poemsOfCollection(db: SQLiteDatabase, coll: string): Promise<Poem[]> {
  return db.getAllAsync<Poem>(
    'SELECT * FROM poems WHERE collection = ? ORDER BY id',
    coll,
  );
}

/** 某位作者在某个集子里的作品（按入库顺序，全集里就是编年次序） */
export async function poemsOfAuthor(
  db: SQLiteDatabase,
  coll: string,
  author: string,
): Promise<Poem[]> {
  return db.getAllAsync<Poem>(
    'SELECT * FROM poems WHERE collection = ? AND author = ? ORDER BY id',
    coll,
    author,
  );
}

/**
 * 某个词牌在某个集子里的全部作品。
 *
 * 词牌没有落库（见 `lib/cipai.ts`），所以先用题目 / 副题的 LIKE 抄个超集
 * （词牌一定出现在题目或副题里），再按 `cipaiOf()` 精确比对 ——
 * `title LIKE '%浣溪沙%'` 会把「和浣溪沙」这类题目一起抄进来，得筛掉。
 */
export async function poemsOfCipai(
  db: SQLiteDatabase,
  coll: string,
  cipai: string,
): Promise<Poem[]> {
  const name = cipai.trim();
  if (!name) return [];
  const like = `%${name}%`;
  const rows = await db.getAllAsync<Poem>(
    'SELECT * FROM poems WHERE collection = ? AND (title LIKE ? OR subtitle LIKE ?) ORDER BY id',
    coll,
    like,
    like,
  );
  return rows.filter((p) => cipaiOf(p) === name);
}

export async function searchPoems(db: SQLiteDatabase, q: string, limit = 100): Promise<Poem[]> {
  const like = `%${q.trim()}%`;
  // 简繁两套列都查：用户输简体或繁體都能命中（不需要任何转换表）
  return db.getAllAsync<Poem>(
    `SELECT * FROM poems
     WHERE title LIKE ? OR title_tw LIKE ?
        OR author LIKE ? OR author_tw LIKE ?
        OR name LIKE ? OR name_tw LIKE ?
        OR content LIKE ? OR content_tw LIKE ?
     ORDER BY daily DESC, id LIMIT ?`,
    like,
    like,
    like,
    like,
    like,
    like,
    like,
    like,
    limit,
  );
}

// ---------------------------------------------------------------- 每日一诗（确定性轮换）
/**
 * 挑诗器按「库实例 + 冷却天数 + 选集」缓存：一次 App 生命周期里只建一次。
 * 键里必须带选集 —— 换了集子就是另一条序列，共用一份挑选器会串味。
 */
const pickers = new WeakMap<SQLiteDatabase, Map<string, DailyPicker>>();

/**
 * 精选池里挑诗只需要这两列。
 *
 * `collections` 是要纳入的集子（可以混着 `DAILY_FAVORITES`）：
 * - 空 = 不限集子，整个精选池（`daily = 1` 那 1966 首）——老版本的行为；
 * - 集子整部纳入（全唐诗那 5.7 万首也在内，不只 `daily = 1`）；
 * - `DAILY_FAVORITES` 那一支走收藏表，收藏变动就换池子。
 *
 * 导出只为了能单测「池子里到底是哪几首」（尤其是选集与收藏重叠时的去重）。
 */
export async function dailyPoolRows(
  db: SQLiteDatabase,
  collections: string[],
): Promise<{ id: number; author: string }[]> {
  if (!collections.length) {
    return db.getAllAsync<{ id: number; author: string }>(
      'SELECT id, author FROM poems WHERE daily = 1 ORDER BY id',
    );
  }
  const colls = collections.filter((c) => c !== DAILY_FAVORITES);
  const withFav = colls.length !== collections.length;
  const parts: string[] = [];
  if (colls.length) {
    const marks = colls.map(() => '?').join(',');
    parts.push(`SELECT id, author FROM poems WHERE collection IN (${marks})`);
  }
  if (withFav) {
    parts.push(
      'SELECT p.id AS id, p.author AS author FROM favorites f JOIN poems p ON p.id = f.poem_id',
    );
  }
  // UNION（不是 UNION ALL）：同一首既在集子里又在收藏里时只算一次，
  // 否则它在池子里占比翻倍，作者冷却也会把它当两首。
  return db.getAllAsync<{ id: number; author: string }>(
    `${parts.join(' UNION ')} ORDER BY id`,
    ...colls,
  );
}

async function pickerFor(
  db: SQLiteDatabase,
  gap: DailyGap,
  collections: string[] = [],
): Promise<DailyPicker> {
  let byKey = pickers.get(db);
  if (!byKey) {
    byKey = new Map();
    pickers.set(db, byKey);
  }
  const key = `${gap}|${collections.join(',')}`;
  const hit = byKey.get(key);
  if (hit) return hit;
  let rows = await dailyPoolRows(db, collections);
  // 选集里的 id 全失效了（换库 / 语料重下），或者只勾了「我的收藏」而收藏是空的：
  // 退回整个精选池，宁可多给几首，也别让首页因为一条过期设置开天窗
  if (!rows.length && collections.length) rows = await dailyPoolRows(db, []);
  const picker = createDailyPicker(rows, gap);
  byKey.set(key, picker);
  return picker;
}

/**
 * 经典池里按日期取一首：同一日期永远同一首，`gap` 天内不重复同一位作者。
 * `collections` 是设置页勾的「精选诗集」（空 = 整个精选池）。
 */
export async function poemForDay(
  db: SQLiteDatabase,
  dateStr: string,
  gap: DailyGap = DEFAULT_GAP,
  collections: string[] = [],
): Promise<Poem | null> {
  const picker = await pickerFor(db, gap, collections);
  const id = picker.idFor(dayNumber(dateStr));
  return id == null ? null : getPoem(db, id);
}

// ---------------------------------------------------------------- 应景（节日 / 节气）
/**
 * 用节日 / 节气的名字检索相关诗（如立秋、清明、中秋），命中里**随机一首**：
 * 种子里带日期，所以同一天永远同一首，明年同一个节令换别首。
 * 两段式：先在题目里找明确“主题作”，题目无命中再退到正文。
 * 精选池（daily = 1）优先——池里有就用经典的，池里没有再用全库，
 * 否则 24 个节气里大半在池子里查无此人，应景等于没做。
 */
async function occasionTier(
  db: SQLiteDatabase,
  dateStr: string,
  occ: Occasion,
  col: 'title' | 'content',
): Promise<Poem | null> {
  // 节日名本身也算检索词（春节、元宵节…），再并上各节日自己的别名
  const terms = [occ.label, ...occ.keywords.filter((k) => k !== occ.label)];
  // 检索词均为汉字（无 % / _ 通配符冲突），无需转义
  const conds = terms.map(() => `${col} LIKE ?`).join(' OR ');
  const params = terms.map((t) => `%${t}%`);
  const c = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) n FROM poems WHERE ${conds}`,
    ...params,
  );
  const n = c?.n ?? 0;
  if (!n) return null;
  const offset = offsetFor(`${dateStr}|${occ.id}|${col}`, n);
  return (
    (await db.getFirstAsync<Poem>(
      `SELECT * FROM poems WHERE ${conds} ORDER BY daily DESC, id LIMIT 1 OFFSET ?`,
      ...params,
      offset,
    )) ?? null
  );
}

export async function poemForOccasion(
  db: SQLiteDatabase,
  dateStr: string,
  occ: Occasion,
): Promise<Poem | null> {
  const byTitle = await occasionTier(db, dateStr, occ, 'title');
  if (byTitle) return byTitle;
  return occasionTier(db, dateStr, occ, 'content');
}

export interface DayPick {
  poem: Poem | null;
  /** 是否为应景命中（否则为经典池轮换） */
  occasion: boolean;
}

/** 依推送偏好取当日诗：应景日优先应景，其余回退经典轮换 */
export async function pickPoemForDate(
  db: SQLiteDatabase,
  dateStr: string,
  occ: Occasion | null,
  gap: DailyGap = DEFAULT_GAP,
  collections: string[] = [],
): Promise<DayPick> {
  if (occ) {
    const themed = await poemForOccasion(db, dateStr, occ);
    // 查不到这个节日 / 节气的诗，就走平日的作者冷却轮换
    if (themed) return { poem: themed, occasion: true };
  }
  return { poem: await poemForDay(db, dateStr, gap, collections), occasion: false };
}

export async function rememberDay(db: SQLiteDatabase, dateStr: string, poemId: number): Promise<void> {
  await db.runAsync(
    'INSERT OR IGNORE INTO history (date, poem_id) VALUES (?, ?)',
    dateStr,
    poemId,
  );
}

export async function historyDays(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM history');
  return r?.n ?? 0;
}

// ---------------------------------------------------------------- 收藏
export async function isFavorite(db: SQLiteDatabase, poemId: number): Promise<boolean> {
  const r = await db.getFirstAsync<{ n: number }>(
    'SELECT COUNT(*) n FROM favorites WHERE poem_id = ?',
    poemId,
  );
  return (r?.n ?? 0) > 0;
}

export async function toggleFavorite(db: SQLiteDatabase, poemId: number): Promise<boolean> {
  const fav = await isFavorite(db, poemId);
  if (fav) {
    await db.runAsync('DELETE FROM favorites WHERE poem_id = ?', poemId);
  } else {
    await db.runAsync(
      "INSERT INTO favorites (poem_id) VALUES (?) ON CONFLICT(poem_id) DO NOTHING",
      poemId,
    );
  }
  return !fav;
}

export async function clearFavorites(db: SQLiteDatabase): Promise<void> {
  await db.runAsync('DELETE FROM favorites');
}

export async function listFavorites(db: SQLiteDatabase): Promise<Poem[]> {
  return db.getAllAsync<Poem>(
    `SELECT p.* FROM favorites f
     JOIN poems p ON p.id = f.poem_id
     ORDER BY f.created_at DESC, p.id DESC`,
  );
}

export async function favoriteCount(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM favorites');
  return r?.n ?? 0;
}

// ---------------------------------------------------------------- 挑战（出题池 / 战绩）
/** 收藏这个「虚拟集子」的 id：挑战页与路由参数都用它 */
export const CHALLENGE_FAVORITES = 'favorites';

/**
 * 出题池：随机捞 `limit` 首。
 * 不能整份读进来 —— 全唐诗 5.7 万首，光一局十题没必要把几 MB 正文塞进内存。
 * 十首诗里挑十句挖空，干扰项也在这批句子里选，四十首足够。
 *
 * 外层再 `ORDER BY id`：`ORDER BY RANDOM()` 的行序是随机的，而 `buildChallenge()`
 * 的洗牌依赖入参顺序 —— 同一批诗不同行序会出不同的题，测试就没法断言了。
 */
export async function challengePoems(
  db: SQLiteDatabase,
  poolId: string,
  limit = 40,
): Promise<Poem[]> {
  const n = Math.max(1, Math.floor(limit));
  if (poolId === CHALLENGE_FAVORITES) {
    return db.getAllAsync<Poem>(
      `SELECT * FROM (
         SELECT p.* FROM favorites f
         JOIN poems p ON p.id = f.poem_id
         ORDER BY RANDOM() LIMIT ?
       ) ORDER BY id`,
      n,
    );
  }
  return db.getAllAsync<Poem>(
    `SELECT * FROM (
       SELECT * FROM poems WHERE collection = ? ORDER BY RANDOM() LIMIT ?
     ) ORDER BY id`,
    poolId,
    n,
  );
}

/** 战绩（最近几局）：存在 meta 的 KV 里，跟设置共用一张表 */
export async function challengeLog(db: SQLiteDatabase): Promise<ChallengeRecord[]> {
  return parseLog(await getSetting(db, CHALLENGE_LOG_KEY));
}

/** 记一局并返回新的战绩列表 */
export async function saveChallengeRecord(
  db: SQLiteDatabase,
  rec: ChallengeRecord,
): Promise<ChallengeRecord[]> {
  const next = pushRecord(await challengeLog(db), rec);
  await setSetting(db, CHALLENGE_LOG_KEY, JSON.stringify(next));
  return next;
}
