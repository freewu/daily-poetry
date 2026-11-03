// 随包 SQLite 数据的冒烟测试：assets/poetry.db 是 `just db` 的产物（不入库），
// 没有就先跑一次构建；这里校验的是「装进 APK 的那份数据」本身可用。
//
// 关注点：结构完整、每日池可轮换、应景检索真能命中、全新安装时收藏为空。
import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  dayNumber,
  DB_SCHEMA_VERSION,
  getSetting,
  pickPoemForDate,
  poemForDay,
  poemForOccasion,
  searchPoems,
  shiftDayStr,
} from '@/lib/db';
import { dayInfo, occasionFor } from '@/lib/lunar';
import type { Poem } from '@/lib/types';

import { asDb, openDbFile, type TestDb } from '../helpers/memory-db';

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
  console.warn('assets/poetry.db 不存在，请先执行 `just db`；已跳过数据校验');
}

describeDb('assets/poetry.db（随包数据）', () => {
  it('meta 里记录了语料范围 / 首数 / 构建时间', async () => {
    expect(await getSetting(asDb(db), 'dataset')).toBeTruthy();
    expect(await getSetting(asDb(db), 'poem_count')).toMatch(/^\d+$/);
    expect(await getSetting(asDb(db), 'built_at')).toBeTruthy();
  });

  it('库结构版本与 App 期望一致（否则启动会换库）', async () => {
    expect(await getSetting(asDb(db), 'schema_version')).toBe(String(DB_SCHEMA_VERSION));
  });

  it('诗词数与 meta 记录一致', async () => {
    const meta = Number(await getSetting(asDb(db), 'poem_count'));
    const row = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM poems');
    expect(row?.n).toBe(meta);
  });

  it('每首诗都有正文，且所属选集都存在', async () => {
    const empty = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE TRIM(content) = '' OR TRIM(title) = ''",
    );
    expect(empty?.n).toBe(0);

    const orphan = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) n FROM poems p LEFT JOIN collections c ON c.id = p.collection WHERE c.id IS NULL',
    );
    expect(orphan?.n).toBe(0);
  });

  it('每首都有繁体文本，繁体源保留原文、简体源由 OpenCC 转写', async () => {
    const empty = await db.getFirstAsync<{ n: number }>(
      "SELECT COUNT(*) n FROM poems WHERE TRIM(content_tw) = '' OR TRIM(title_tw) = ''",
    );
    expect(empty?.n).toBe(0);

    // 唐诗三百首是简体源 → cn→tw
    const cnSrc = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'tangshi' AND title = '静夜思'",
    );
    expect(cnSrc?.content).toContain('举头');
    expect(cnSrc?.content_tw).toContain('舉頭');

    // 全唐诗是繁体源 → 原文里的「髮」不会被转成简体再转回来
    const twSrc = await db.getFirstAsync<Poem>(
      "SELECT * FROM poems WHERE collection = 'quantangshi' AND content_tw LIKE '%白髮%' LIMIT 1",
    );
    expect(twSrc).not.toBeNull();
    expect(twSrc?.content).toContain('白发');
    expect(twSrc?.content_tw).toContain('白髮');
  });

  it('选集名 / 体裁也有繁体', async () => {
    const row = await db.getFirstAsync<{ name: string; name_tw: string; kind_tw: string }>(
      "SELECT name, name_tw, kind_tw FROM collections WHERE id = 'ci'",
    );
    expect(row).toEqual({ name: '全宋词', name_tw: '全宋詞', kind_tw: '詞' });
  });

  it('每日池非空，且一整年轮换不重复、不漏日', async () => {
    const pool = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) n FROM poems WHERE daily = 1',
    );
    const size = pool?.n ?? 0;
    expect(size).toBeGreaterThan(1000);

    const seen = new Set<number>();
    let date = '2024-01-01';
    for (let i = 0; i < size; i++) {
      const p = await poemForDay(asDb(db), date);
      expect(p).not.toBeNull();
      if (!p) return;
      expect(p.daily).toBe(1);
      seen.add(p.id);
      date = shiftDayStr(date, 1);
    }
    // 一个完整周期恰好覆盖整个精选池
    expect(seen.size).toBe(size);
  });

  it('同一日期取到同一首（可复现）', async () => {
    const date = '2024-09-17';
    const poolRow = await db.getFirstAsync<{ n: number }>(
      'SELECT COUNT(*) n FROM poems WHERE daily = 1',
    );
    const size = poolRow?.n ?? 1;
    const a = await poemForDay(asDb(db), date);
    const expected = await db.getFirstAsync<Poem>(
      'SELECT * FROM poems WHERE daily = 1 ORDER BY id LIMIT 1 OFFSET ?',
      (((dayNumber(date) % size) + size) % size),
    );
    expect(a?.id).toBe(expected?.id);
  });

  it('中秋 / 重阳 能在真实语料里命中应景诗（题目或正文含关键词）', async () => {
    const cases: { date: string; occId: string }[] = [
      { date: '2024-09-17', occId: 'fest-zhongqiu' },
      { date: '2025-10-29', occId: 'fest-chongyang' },
    ];
    for (const c of cases) {
      const occ = occasionFor(dayInfo(c.date));
      expect(occ?.id).toBe(c.occId);
      const p = await poemForOccasion(asDb(db), c.date, occ!);
      expect(p).not.toBeNull();
      expect(occ!.keywords.some((k) => `${p!.title}${p!.content}`.includes(k))).toBe(true);
    }
  });

  it('语料里没有对应诗时（如端午）退到经典轮换而不是空白', async () => {
    // 精选六集里没有出现「端午 / 端阳 / 重午 / 竞渡」的诗句，属于已知数据缺口
    const occ = occasionFor(dayInfo('2024-06-10'))!;
    expect(occ.id).toBe('fest-duanwu');
    expect(await poemForOccasion(asDb(db), '2024-06-10', occ)).toBeNull();

    const pick = await pickPoemForDate(asDb(db), '2024-06-10', occ);
    expect(pick.occasion).toBe(false);
    expect(pick.poem?.daily).toBe(1);
  });

  it('全文检索能搜到名篇', async () => {
    const hits = await searchPoems(asDb(db), '静夜思', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toContain('静夜思');
    expect(hits[0].author).toContain('李白');
  });

  it('繁体查询也能命中（简繁两列一起检索）', async () => {
    const hits = await searchPoems(asDb(db), '靜夜思', 5);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].title).toBe('静夜思');
  });

  it('全新安装的库没有被写脏（收藏 / 足迹为空）', async () => {
    expect(await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM favorites')).toEqual({ n: 0 });
    expect(await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) n FROM history')).toEqual({ n: 0 });
  });
});
