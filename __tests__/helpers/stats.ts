// 页面读的统计来自随包 JSON（真实语料，`assets/stats.json`），
// 但用例里的集子 / 诗词都是内存库里现造的，不可能在那个 JSON 里。
//
// 所以这里把「建库脚本该算的那份」用内存库现算一遍，塞进 `setStatsForTest()`：
// 形状与 `assets/stats.json` 完全一致（作者走 SQL，词牌走 `cipaiOf()`），
// 页面照旧只做分组渲染。真实数据是否跟 poetry.db 对得上，由
// `__tests__/assets/stats-test.ts` 单独验证。
import { countCipai, isCiKind } from '@/lib/cipai';
import { setStatsForTest, type CollectionStats } from '@/lib/stats';
import type { Poem } from '@/lib/types';

import type { TestDb } from './memory-db';

/** 按内存库现算一份统计并注入；返回注入的那份，方便用例直接断言 */
export function seedStats(db: TestDb, only?: string[]): Record<string, CollectionStats> {
  const collections = db.raw
    .prepare('SELECT id, kind FROM collections ORDER BY id')
    .all() as { id: string; kind: string }[];
  const map: Record<string, CollectionStats> = {};
  for (const coll of collections) {
    if (only && !only.includes(coll.id)) continue;
    const authors = (
      db.raw
        .prepare(
          `SELECT COALESCE(author, '') AS name, COALESCE(MAX(author_tw), '') AS nameTw,
                  COUNT(*) AS count
           FROM poems WHERE collection = ? GROUP BY author`,
        )
        .all(coll.id) as { name: string; nameTw: string; count: number }[]
    )
      .map((r) => ({
        name: r.name,
        ...(r.nameTw && r.nameTw !== r.name ? { nameTw: r.nameTw } : {}),
        count: r.count,
      }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    const poems = db.raw
      .prepare('SELECT * FROM poems WHERE collection = ?')
      .all(coll.id) as unknown as Poem[];
    map[coll.id] = {
      total: poems.length,
      authors,
      cipai: isCiKind(coll.kind) ? countCipai(poems) : [],
    };
  }
  setStatsForTest(map);
  return map;
}
