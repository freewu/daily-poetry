// `assets/stats.json` 与 `assets/poetry.db` 的对拍。
//
// 这份统计是建库时算好、随包走的（`scripts/build-stats.mjs`），页面**不再现算** ——
// 于是「改了语料忘了重新生成」「两条词牌规则改了一条」这类问题只能在这里发现：
// 左边是产物，右边是用 TS 实现（`src/lib/cipai.ts`，页面对词牌的唯一权威）现算一遍。
//
// 生成：`just db`（= build-db + build-stats）；校验：`node scripts/build-stats.mjs --check`。
import { existsSync } from 'node:fs';
import path from 'node:path';

import { countCipai, isCiKind, type CipaiStat } from '@/lib/cipai';
import { STATS_VERSION, setStatsForTest, statsOf } from '@/lib/stats';
import type { Poem } from '@/lib/types';

import CollectionAuthorsScreen from '@/app/collection/[id]/authors';
import CollectionCipaiScreen from '@/app/collection/[id]/cipai';

import { openDbFile, setTestDb, type TestDb } from '../helpers/memory-db';
import { renderWithTheme, screen } from '../helpers/test-utils';

const g = globalThis as any;

const DB_FILE = path.resolve(__dirname, '../../assets/poetry.db');
const hasDb = existsSync(DB_FILE);

let db: TestDb;

beforeAll(() => {
  if (hasDb) db = openDbFile(DB_FILE);
});

afterAll(() => {
  db?.close();
});

const describeDb = hasDb ? describe : describe.skip;

if (!hasDb) {
  // eslint-disable-next-line no-console
  console.warn('assets/poetry.db 不存在，请先执行 `just db`；已跳过统计产物校验');
}

const byName = (a: { name: string }, b: { name: string }) =>
  a.name < b.name ? -1 : a.name > b.name ? 1 : 0;

/** 词牌统计去掉 `nameTw: undefined` 这种写法差异，统一成「有才写」 */
const tidy = (rows: CipaiStat[]) =>
  rows.map((r) => (r.nameTw ? r : { name: r.name, count: r.count })).sort(byName);

describeDb('assets/stats.json（随包统计）', () => {
  it('版本号与代码一致（改了形状就一起升）', () => {
    expect(STATS_VERSION).toBe(1);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../../assets/stats.json');
    expect(raw.version).toBe(STATS_VERSION);
  });

  it('集子一个不多一个不少', async () => {
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM collections ORDER BY id');
    const ids = rows.map((r) => r.id);
    for (const id of ids) expect(statsOf(id)).not.toBeNull();
    expect(statsOf('nope')).toBeNull();
    // 反过来 JSON 里也不该有库里没有的集子
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const raw = require('../../assets/stats.json');
    expect(Object.keys(raw.collections).sort()).toEqual(ids);
  });

  it('每部集子的总首数对得上', async () => {
    const rows = await db.getAllAsync<{ id: string; count: number }>(
      'SELECT id, count FROM collections',
    );
    for (const row of rows) {
      expect(statsOf(row.id)?.total).toBe(row.count);
      const real = await db.getFirstAsync<{ n: number }>(
        'SELECT COUNT(*) n FROM poems WHERE collection = ?',
        row.id,
      );
      expect(statsOf(row.id)?.total).toBe(real?.n);
    }
  });

  it('作者统计：名字 / 作品数 / 繁体署名跟库里一模一样', async () => {
    const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM collections');
    for (const { id } of rows) {
      const fromDb = (
        await db.getAllAsync<{ name: string; nameTw: string; count: number }>(
          `SELECT COALESCE(author, '') AS name, COALESCE(MAX(author_tw), '') AS nameTw,
                  COUNT(*) AS count
           FROM poems WHERE collection = ? GROUP BY author`,
          id,
        )
      )
        .map((r) => ({
          name: r.name,
          ...(r.nameTw && r.nameTw !== r.name ? { nameTw: r.nameTw } : {}),
          count: r.count,
        }))
        .sort(byName);

      const fromJson = [...(statsOf(id)?.authors ?? [])].sort(byName);
      expect(fromJson).toEqual(fromDb);
    }
  });

  it('词牌统计：跟 cipai.ts 现算的结果一模一样（两条规则各自独立实现过）', async () => {
    const rows = await db.getAllAsync<{ id: string; kind: string }>(
      'SELECT id, kind FROM collections',
    );
    for (const { id, kind } of rows) {
      const stats = statsOf(id);
      if (!isCiKind(kind)) {
        // 诗集 / 曲集不该有词牌数据
        expect(stats?.cipai).toEqual([]);
        continue;
      }
      const poems = await db.getAllAsync<Poem>('SELECT * FROM poems WHERE collection = ?', id);
      expect(tidy(stats?.cipai ?? [])).toEqual(countCipai(poems).sort(byName));
    }
  });

  it('词牌名是简体、繁体另存一列（页面按简繁切换）', () => {
    const ci = statsOf('ci');
    expect(ci?.cipai.length).toBeGreaterThan(500);
    // 全宋词是繁体语料，简体词牌名跟繁體名字必然有不少不一样的
    expect(ci?.cipai.some((c) => c.nameTw && c.nameTw !== c.name)).toBe(true);
    expect(ci?.cipai.every((c) => c.name && c.count > 0)).toBe(true);
  });

  // 下面两条把「随包 JSON」真的送到页面上过一遍：字段名对不上（JSON 的 key
  // 与 `CollectionStats` 不一致）这种事 tsc 管不着（`stats.json` 是 as 进来的），
  // 只能靠真数据渲染一次发现。
  it('词牌页用随包数据能画出全宋词的 884 个词牌（不读正文）', async () => {
    setStatsForTest(null);
    setTestDb(db);
    g.__ROUTE_PARAMS__ = { id: 'ci' };
    await renderWithTheme(<CollectionCipaiScreen />, { db });
    expect(await screen.findByText(/884 个词牌/)).toBeTruthy();
    // 字母条也是从这份数据里长出来的（列表只画头几组，浣溪沙那组还没渲染）
    expect(screen.getByTestId('letter-H')).toBeTruthy();
  });

  it('作者页用随包数据能画出全唐诗的 3650 位作者', async () => {
    setStatsForTest(null);
    setTestDb(db);
    g.__ROUTE_PARAMS__ = { id: 'quantangshi' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db });
    expect(await screen.findByText(/3650 位作者 · 共 57599 首/)).toBeTruthy();
    expect(screen.getByTestId('letter-L')).toBeTruthy();
  });
});
