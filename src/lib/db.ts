import type { SQLiteDatabase } from 'expo-sqlite';

import type { CollectionMeta, Occasion, Poem } from './types';

export const DB_NAME = 'poetry.db';

/**
 * 随包数据库的结构版本，与 scripts/build-db.mjs 的 SCHEMA_VERSION 对应。
 * 不一致时（老版本安装、旧库缺繁体列）启动会换用随包新库，收藏/足迹按
 * 「题目 + 作者 + 首句」重新对上（见 lib/db-bootstrap.ts）。
 */
export const DB_SCHEMA_VERSION = 2;

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

export async function poemsOfCollection(db: SQLiteDatabase, coll: string): Promise<Poem[]> {
  return db.getAllAsync<Poem>(
    'SELECT * FROM poems WHERE collection = ? ORDER BY id',
    coll,
  );
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
async function dailyCount(db: SQLiteDatabase): Promise<number> {
  const r = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM poems WHERE daily = 1');
  return r?.n ?? 0;
}

export async function poemForDay(db: SQLiteDatabase, dateStr: string): Promise<Poem | null> {
  const pool = await dailyCount(db);
  if (!pool) return null;
  const n = dayNumber(dateStr);
  const offset = ((n % pool) + pool) % pool;
  return (
    (await db.getFirstAsync<Poem>(
      'SELECT * FROM poems WHERE daily = 1 ORDER BY id LIMIT 1 OFFSET ?',
      offset,
    )) ?? null
  );
}

// ---------------------------------------------------------------- 应景（节日 / 节气）
/**
 * 两段式检索：先在题目中找明确“主题作”（如《中秋月》《九月九日忆山东兄弟》）；
 * 题目无命中时再退到正文。命中按“年”轮换：同年同一节令/节日稳定，次年换一首。
 */
async function occasionTier(
  db: SQLiteDatabase,
  dateStr: string,
  occ: Occasion,
  col: 'title' | 'content',
): Promise<Poem | null> {
  // 检索词均为汉字（无 % / _ 通配符冲突），无需转义
  const conds = occ.keywords.map(() => `${col} LIKE ?`).join(' OR ');
  const params = occ.keywords.map((t) => `%${t}%`);
  const c = await db.getFirstAsync<{ n: number }>(
    `SELECT COUNT(*) n FROM poems WHERE daily = 1 AND (${conds})`,
    ...params,
  );
  const n = c?.n ?? 0;
  if (!n) return null;
  // 以“年”为单位的偏移：同一节令/节日，次年轮换到下一首
  const years = Math.floor(dayNumber(dateStr) / 365.2425);
  const offset = years % n;
  return (
    (await db.getFirstAsync<Poem>(
      `SELECT * FROM poems WHERE daily = 1 AND (${conds}) ORDER BY id LIMIT 1 OFFSET ?`,
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
): Promise<DayPick> {
  if (occ) {
    const themed = await poemForOccasion(db, dateStr, occ);
    if (themed) return { poem: themed, occasion: true };
  }
  return { poem: await poemForDay(db, dateStr), occasion: false };
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
