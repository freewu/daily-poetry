import type { SQLiteDatabase } from 'expo-sqlite';

import type { CollectionMeta, Poem } from './types';

export const DB_NAME = 'poetry.db';

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
  return db.getAllAsync<Poem>(
    `SELECT * FROM poems
     WHERE title LIKE ? OR author LIKE ? OR name LIKE ? OR content LIKE ?
     ORDER BY daily DESC, id LIMIT ?`,
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
