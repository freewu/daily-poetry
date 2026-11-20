import { rng } from './random';
import type { DailyGap, GapKey } from './types';

/**
 * 每日一诗的作者冷却。
 *
 * 语料是按作者排的（花间集里温庭筠 70 首连在一起），老算法「天数 % 池子大小」
 * 直接从同一段里连抽几天，于是连续好几天都是同一个人。现在改成：
 * 每天抽一个作者，最近 gap 天用过的作者跳过——「gap 天内不重复作者」是构造出来的，
 * 不是抽完再校验。
 */
export const GAP_OPTS: { key: GapKey; gap: DailyGap; label: string; hint: string }[] = [
  { key: '0', gap: 0, label: '不限', hint: '只管每天换一首，不限制作者' },
  { key: '3', gap: 3, label: '3 天', hint: '3 天内不重复同一位作者' },
  { key: '7', gap: 7, label: '7 天', hint: '7 天内不重复同一位作者（默认）' },
  { key: '14', gap: 14, label: '14 天', hint: '两周内不重复同一位作者' },
  { key: '30', gap: 30, label: '30 天', hint: '一个月内不重复同一位作者' },
];

export const DEFAULT_GAP_KEY: GapKey = '7';
export const DEFAULT_GAP: DailyGap = 7;

export function isGapKey(v: unknown): v is GapKey {
  return GAP_OPTS.some((o) => o.key === v);
}

/** 库里读出来的值 → 档位键；脏值退回默认（设置页的选中项） */
export function gapKeyOf(v: string | null | undefined): GapKey {
  return isGapKey(v) ? v : DEFAULT_GAP_KEY;
}

/** 库里读出来的值 → 冷却天数 */
export function gapOf(v: string | null | undefined): DailyGap {
  return GAP_OPTS.find((o) => o.key === gapKeyOf(v))!.gap;
}

// ---------------------------------------------------------------- 每日精选（每日池的范围）
/**
 * 「每日精选从哪几部集子里挑」存在 meta 的这个键里（逗号分隔的集子 id）。
 *
 * 池子以前是写死的（建库时 `DAILY_COLLECTIONS` 那九部，1966 首），现在设置页可以勾：
 * **所有集子都能选**（全唐诗 5.7 万首也能整部当日更池），外加一个虚拟集子
 * 「我的收藏」（`DAILY_FAVORITES`）。一部都不勾不行 —— 池子空了首页就开天窗，
 * 所以「至少留一个」由 `parseDailyScope()` / `toggleDailyScope()` 保证。
 */
export const DAILY_SCOPE_KEY = 'settings_daily_collections';

/** 「我的收藏」这个虚拟集子的 id（跟挑战出题池的 `CHALLENGE_FAVORITES` 是同一个值） */
export const DAILY_FAVORITES = 'favorites';

/**
 * 库里的串 + 能选的集子 → 选择。
 *
 * 只保留 `available` 里有的：换库 / 重下语料之后旧 id 可能已经不存在。
 * 筛完一部不剩（没存过、串是脏的、集子全没了）就当没选过，退回 `fallback` ——
 * 也就是建库时标了 `daily = 1` 的那九部（老版本「整个精选池」的行为）。
 * 连 `fallback` 都空（小库 / 测试库没有 collections 表数据）就返回空数组：
 * 空 = 不限集子，让 `poemForDay()` 自己退回 `daily = 1` 整个精选池。
 */
export function parseDailyScope(
  raw: string | null | undefined,
  available: string[],
  fallback: string[] = available,
): string[] {
  const chosen = new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  );
  const kept = available.filter((id) => chosen.has(id));
  if (kept.length) return kept;
  return fallback.filter((id) => available.includes(id));
}

/**
 * 选择 → 存进 meta 的串。按 `available` 的顺序写，同一个选择永远同一个串
 * （缓存指纹靠它对齐，顺序不同就是两个指纹）。
 */
export function serializeDailyScope(ids: string[], available: string[]): string {
  const chosen = new Set(ids);
  return available.filter((id) => chosen.has(id)).join(',');
}

/**
 * 勾上 / 取消一部集子。取消到一部不剩时**原样返回**：
 * 「必须选择一个」这条规矩在这里，调用方（设置页）不用再拦一遍。
 * `fallback` 跟 `parseDailyScope()` 一样（没选过时选什么）。
 */
export function toggleDailyScope(
  ids: string[],
  id: string,
  available: string[],
  fallback: string[] = available,
): string[] {
  const chosen = parseDailyScope(ids.join(','), available, fallback);
  if (chosen.includes(id)) {
    if (chosen.length <= 1) return chosen;
    return chosen.filter((x) => x !== id);
  }
  return available.filter((x) => x === id || chosen.includes(x));
}

/** 无名诗的冷却身份（只用于去重，不展示） */
const ANON = '\u0000佚名';

/** 每日池里挑诗只需要这两列 */
export interface DailyPoem {
  id: number;
  author: string;
}

/**
 * 起点：1960-01-01。往前再走没有意义（App 里也翻不到），
 * 更早的日期一律按这一天处理，省得为负天数另外开一条分支。
 */
const ANCHOR = Math.floor(Date.UTC(1960, 0, 1) / 86400000);


/** 字符串 → 32 位种子（FNV-1a）：给「日期 + 节日」这类键用 */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** 按种子在 [0, n) 里挑一个下标：应景诗「随机一首」用 */
export function offsetFor(seed: string, n: number): number {
  if (n <= 0) return 0;
  return Math.floor(rng(hashString(seed))() * n);
}

/** 天号 → 32 位种子（乘个大质数，相邻日期彻底打散） */
function seedOf(day: number): number {
  return (Math.imul(day, 0x9e3779b1) ^ 0x5f3759df) >>> 0;
}

export interface DailyPicker {
  /** 这一天给哪一首（1970-01-01 起的天数）；池子为空时 null */
  idFor(day: number): number | null;
}

/**
 * 造一个「按日期 + 作者冷却」的挑诗器。纯函数式的：同样的池子 + 同样的 gap，
 * 任何设备任何时候算出来的序列都一样（日期 → 诗，可复现）。
 */
export function createDailyPicker(rows: DailyPoem[], gap: number): DailyPicker {
  // 作者 → 该作者的每日池诗。没署名的（花间集里有 300 多首）统一算一位「佚名」：
  // 它们本来就分不清是谁，没必要让连着几天都是无名氏。
  const groups: number[][] = [];
  const index = new Map<string, number>();
  for (const r of rows) {
    const key = r.author.trim() || ANON;
    let i = index.get(key);
    if (i === undefined) {
      i = groups.length;
      index.set(key, i);
      groups.push([]);
    }
    groups[i].push(r.id);
  }
  const A = groups.length;
  // 冷却在数字下标上做（Int32Array 比 Map 快一个量级，20 多年要逐天推）
  const last = new Int32Array(A).fill(-100000);
  const picks: number[] = [];
  // 作者比冷却天数还少时，能隔几天算几天（2 位作者要隔 7 天，实际就是轮流）
  const effGap = Math.min(gap, A);

  const pickDay = (day: number): number => {
    const r = rng(seedOf(day));
    let pick = Math.floor(r() * A);
    if (effGap > 0) {
      // 撞冷却的概率是 (effGap-1)/作者数，通常一次就中
      for (let t = 0; t < 64 && day - last[pick] < effGap; t++) pick = Math.floor(r() * A);
      if (day - last[pick] < effGap) {
        // 抽 64 次都没躲开（作者池刚好卡在边界）：退到最久没出现的那位
        for (let i = 0; i < A; i++) if (last[i] < last[pick]) pick = i;
      }
    }
    last[pick] = day;
    const group = groups[pick];
    // 同一位作者再来时换一首：用另一个种子取组内下标
    return group[Math.floor(rng(seedOf(day * 31 + 7))() * group.length)];
  };

  return {
    idFor(day) {
      if (!A) return null;
      const d = Math.max(day, ANCHOR);
      while (picks.length <= d - ANCHOR) picks.push(pickDay(picks.length + ANCHOR));
      return picks[d - ANCHOR] ?? null;
    },
  };
}
