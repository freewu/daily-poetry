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
