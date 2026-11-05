// 集子的「按作者 / 按词牌」统计：建库时就算好，随包走 JSON。
//
// 数据来源是 `scripts/build-stats.mjs`（`just db` 会顺带跑），
// 页面不再自己 `GROUP BY author`，也不用为了数词牌把整集的正文读进内存。
// 想让它跟 poetry.db 走散 —— 有 `__tests__/assets/stats-test.ts` 盯着。
import RAW from '../../assets/stats.json';

import type { AuthorStat } from './authors';
import type { CipaiStat } from './cipai';

/** 产物格式版本（`scripts/build-stats.mjs` 的 `STATS_VERSION` 要跟它一致） */
export const STATS_VERSION = 1;

export interface CollectionStats {
  /** 这个集子的总首数（作者的 count 之和、词牌的 count 之和都不一定等于它） */
  total: number;
  /** 全部作者，按名字排好序；没署名的用空串（页面显示成「佚名」） */
  authors: AuthorStat[];
  /** 只有词集才有；诗集 / 曲集恒为空数组 */
  cipai: CipaiStat[];
}

interface StatsFile {
  version: number;
  collections: Record<string, CollectionStats>;
}

const FILE = RAW as unknown as StatsFile;

/**
 * 测试用的注入点：内存库里造的集子不可能出现在随包 JSON 里，
 * 用例用 `__tests__/helpers/stats.ts` 的 `seedStats()` 现算一份塞进来。
 * 传 `null` 恢复成随包数据。
 */
let override: Record<string, CollectionStats> | null = null;

export function setStatsForTest(map: Record<string, CollectionStats> | null): void {
  override = map;
}

/** 某个集子的统计；没这个集子（或它一首都没有）就是 `null` */
export function statsOf(collection: string): CollectionStats | null {
  const map = override ?? FILE.collections;
  return map[collection] ?? null;
}
