// 每日一诗的「隔夜缓存」：打开 App 后顺手把明天（以及后天、大后天）的诗算好。
//
// 为什么需要它 —— 挑「今天」这首诗要算两件事：
//   1. 应景检索：节日 / 节气的名字在全库 `LIKE '%关键词%'` 扫一遍（5.7 万行，
//      前置通配符用不上索引），题目没命中还要再扫一遍正文；
//   2. 作者冷却轮换：把 daily 池从 1960 年逐日推到今天。
// 这两步都在首屏的必经路径上。于是改成：
//
//   App 打开 → 今天的诗：有缓存就是「一条 KV + 按 id 取诗」
//            → 首屏画完，后台把往后几天算好写回 meta，下次打开直接命中
//
// 缓存不改变结果：`poemForDay` / `poemForOccasion` 都是「日期 + 池子 + 偏好」的
// 纯函数，算与不算必须是同一首（`__tests__/daily-cache-test.ts` 盯着这条）。
//
// 存的只是 id + 偏好指纹（`push|gap`），不存正文：
// - 偏好变了（推送方式 / 作者间隔）指纹对不上，旧条目自动作废；
// - 换库（`src/lib/db-bootstrap.ts` 覆盖随包库）时 `meta` 整份替换，
//   **故意不把 `daily_picks` 放进 `KEPT_SETTINGS`** —— 旧 id 指向的是旧库的诗。
import type { SQLiteDatabase } from 'expo-sqlite';

import {
  getPoem,
  getSetting,
  pickPoemForDate,
  setSetting,
  shiftDayStr,
  todayStr,
  type DayPick,
} from './db';
import { gapOf } from './daily';
import { dayInfo, occasionFor } from './lunar';
import type { DailyGap, PushPref } from './types';

/** meta 里的 KV 键 */
export const DAILY_CACHE_KEY = 'daily_picks';
/** App 打开后在后台预取几天（1 = 只取明天） */
export const PREFETCH_DAYS = 3;
/** 缓存最多留几条（今天 + 预取的几天 + 翻页时顺手写进来的） */
export const CACHE_KEEP = 8;

export interface CachedPick {
  /** 诗 id（正文不进来，读的时候按 id 取） */
  id: number;
  /** 偏好指纹 `push|gap`：对不上就不用这条 */
  key: string;
  /** 是不是应景命中（对应 `DayPick.occasion`） */
  themed: boolean;
}

/** `'YYYY-MM-DD'` → 那天挑好的诗 */
export type DailyCache = Record<string, CachedPick>;

export interface DailyPrefs {
  push: PushPref;
  gap: DailyGap;
}

/** 偏好指纹：影响挑诗的就这两项 */
export function pickKeyOf(push: PushPref, gap: DailyGap): string {
  return `${push}|${gap}`;
}

const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** 解析 KV 里的串：脏数据一律当空（宁可重算一遍，也别拿错诗） */
export function parseDailyCache(raw: string | null | undefined): DailyCache {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const out: DailyCache = {};
  for (const [date, value] of Object.entries(parsed as Record<string, unknown>)) {
    if (!isDate(date)) continue;
    const pick = value as Partial<CachedPick> | null;
    if (!pick || typeof pick.id !== 'number' || typeof pick.key !== 'string') continue;
    out[date] = { id: pick.id, key: pick.key, themed: pick.themed === true };
  }
  return out;
}

/** 这一天有没有已经算好、且偏好没变的诗 */
export function cachedIdOf(cache: DailyCache, date: string, key: string): number | null {
  const hit = cache[date];
  return hit && hit.key === key ? hit.id : null;
}

/**
 * 写入一条并清理：
 * - 偏好指纹对不上的旧条目全丢（用户刚改了推送方式 / 作者间隔）
 * - 今天的日期之前的条目全丢（翻旧日子不占缓存）
 * - 只留最新的 `CACHE_KEEP` 条（ISO 日期串的字典序就是时间序）
 */
export function withPick(
  cache: DailyCache,
  date: string,
  pick: { id: number; themed: boolean },
  key: string,
  today: string,
): DailyCache {
  const out: DailyCache = {};
  for (const [day, hit] of Object.entries(cache)) {
    if (hit.key !== key || day < today) continue;
    out[day] = hit;
  }
  out[date] = { id: pick.id, key, themed: pick.themed };
  const keep = Object.keys(out).sort().slice(-CACHE_KEEP);
  const trimmed: DailyCache = {};
  for (const day of keep) trimmed[day] = out[day];
  return trimmed;
}

// ---------------------------------------------------------------- 读写（走 meta KV）
async function readCache(db: SQLiteDatabase): Promise<DailyCache> {
  return parseDailyCache(await getSetting(db, DAILY_CACHE_KEY));
}

async function writeCache(db: SQLiteDatabase, cache: DailyCache): Promise<void> {
  await setSetting(db, DAILY_CACHE_KEY, JSON.stringify(cache));
}

/** 推送偏好：设置页写的是 `settings_push` / `settings_daily_gap` */
export async function dailyPrefs(db: SQLiteDatabase): Promise<DailyPrefs> {
  const [sp, sg] = await Promise.all([
    getSetting(db, 'settings_push'),
    getSetting(db, 'settings_daily_gap'),
  ]);
  return { push: sp === 'occasion' ? 'occasion' : 'classic', gap: gapOf(sg) };
}

/**
 * 某一天该展示哪首诗：**先看缓存**，没命中再算一遍并写回。
 *
 * 缓存里记的 id 有可能指向已经不存在的诗（老库 / 数据被清），那就当没命中。
 * 只有今天及以后的日期才写缓存 —— 往回翻的日子看完就过去了。
 */
export async function pickForDateCached(
  db: SQLiteDatabase,
  date: string,
  prefs: DailyPrefs = { push: 'classic', gap: gapOf(null) },
): Promise<DayPick> {
  const key = pickKeyOf(prefs.push, prefs.gap);
  const cache = await readCache(db);
  const hit = cachedIdOf(cache, date, key);
  if (hit != null) {
    const poem = await getPoem(db, hit);
    if (poem) return { poem, occasion: cache[date]?.themed === true };
  }

  const occ = prefs.push === 'occasion' ? occasionFor(dayInfo(date)) : null;
  const pick = await pickPoemForDate(db, date, occ, prefs.gap);
  const today = todayStr();
  if (pick.poem && date >= today) {
    await writeCache(db, withPick(cache, date, { id: pick.poem.id, themed: pick.occasion }, key, today));
  }
  return pick;
}

// ---------------------------------------------------------------- 后台预取
let prefetched: WeakSet<SQLiteDatabase> = new WeakSet();

/** 测试用：清掉「这个库已经预取过」的标记 */
export function resetPrefetchForTest(): void {
  prefetched = new WeakSet();
}

/**
 * 把后面几天的诗先算好（调用方**不要 await**：这是首屏画完之后的背景活）。
 * 同一个库实例一整个会话只跑一次 —— 每次 focus 都重跑一遍等于白烧电。
 * 返回这次真的算了几首（测试用；已在缓存里的跳过）。
 */
export async function prefetchUpcomingDays(
  db: SQLiteDatabase,
  prefs: DailyPrefs,
  days: number = PREFETCH_DAYS,
): Promise<number> {
  if (prefetched.has(db)) return 0;
  prefetched.add(db);

  const key = pickKeyOf(prefs.push, prefs.gap);
  const today = todayStr();
  let cache = await readCache(db);
  let done = 0;
  for (let i = 1; i <= days; i++) {
    const date = shiftDayStr(today, i);
    if (cachedIdOf(cache, date, key) != null) continue;
    const occ = prefs.push === 'occasion' ? occasionFor(dayInfo(date)) : null;
    const pick = await pickPoemForDate(db, date, occ, prefs.gap);
    if (!pick.poem) continue;
    cache = withPick(cache, date, { id: pick.poem.id, themed: pick.occasion }, key, today);
    await writeCache(db, cache);
    done += 1;
  }
  return done;
}
