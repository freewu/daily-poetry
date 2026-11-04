import {
  clearFavorites,
  dayNumber,
  favoriteCount,
  getCollection,
  getPoem,
  getSetting,
  historyDays,
  isFavorite,
  listCollections,
  listFavorites,
  pickPoemForDate,
  poemForDay,
  poemForOccasion,
  poemsOfCollection,
  prettyDate,
  rememberDay,
  searchPoems,
  setSetting,
  shiftDayStr,
  todayStr,
  toggleFavorite,
  weekdayOf,
} from '@/lib/db';
import { occasionFor, dayInfo } from '@/lib/lunar';
import type { CollectionMeta, Poem } from '@/lib/types';

import { asDb, seedCollections, seedPoems, useMemoryDb } from './helpers/memory-db';

describe('db/日期工具', () => {
  it('todayStr 是 YYYY-MM-DD', () => {
    expect(todayStr()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('dayNumber 以 1970-01-01 为 0', () => {
    expect(dayNumber('1970-01-01')).toBe(0);
    expect(dayNumber('1970-01-02')).toBe(1);
    expect(dayNumber('2024-01-01')).toBe(19723);
  });

  it('shiftDayStr 跨月跨界', () => {
    expect(shiftDayStr('2024-02-28', 1)).toBe('2024-02-29'); // 闰年
    expect(shiftDayStr('2023-02-28', 1)).toBe('2023-03-01');
    expect(shiftDayStr('2024-01-01', -1)).toBe('2023-12-31');
    expect(shiftDayStr('2024-12-31', 1)).toBe('2025-01-01');
  });

  it('weekdayOf / prettyDate', () => {
    expect(weekdayOf('2024-09-17')).toBe('周二');
    expect(weekdayOf('1970-01-01')).toBe('周四');
    expect(prettyDate('2024-09-17')).toBe('2024年9月17日');
  });
});

describe('db/设置 KV', () => {
  it('读不到时返回 null', async () => {
    const db = useMemoryDb();
    expect(await getSetting(asDb(db), 'settings_theme')).toBeNull();
  });

  it('写入后可读，重复写入是覆盖', async () => {
    const db = useMemoryDb();
    await setSetting(asDb(db), 'settings_theme', 'dark');
    expect(await getSetting(asDb(db), 'settings_theme')).toBe('dark');
    await setSetting(asDb(db), 'settings_theme', 'light');
    expect(await getSetting(asDb(db), 'settings_theme')).toBe('light');
  });
});

describe('db/每日一诗（确定性轮换）', () => {
  const pool = Array.from({ length: 5 }, (_, i) => ({
    id: i + 1,
    title: `日课其${i + 1}`,
    content: '一句\n二句',
  }));

  function seed() {
    const db = useMemoryDb();
    seedPoems(db, pool);
    // 非精选（daily = 0）不参与每日轮换
    seedPoems(db, [
      { id: 101, title: '非精选', content: '不参与\n轮换', daily: 0 },
    ]);
    return db;
  }

  it('同一日期永远同一首，不同日期换一首', async () => {
    const db = seed();
    const a = await poemForDay(asDb(db), '2024-09-17');
    const again = await poemForDay(asDb(db), '2024-09-17');
    expect(again?.id).toBe(a?.id);

    // 连看 10 天，5 首里总不会天天同一首
    const ids = new Set<number>();
    let date = '2024-09-17';
    for (let i = 0; i < 10; i++) {
      ids.add((await poemForDay(asDb(db), date))!.id);
      date = shiftDayStr(date, 1);
    }
    expect(ids.size).toBeGreaterThan(1);
  });

  it('分得清作者：gap 天内不重复（同一作者只有 2 首时也能连着排）', async () => {
    const db = useMemoryDb();
    seedPoems(db, [
      { id: 1, author: '李白', title: '甲', content: '甲' },
      { id: 2, author: '李白', title: '乙', content: '乙' },
      { id: 3, author: '杜甫', title: '丙', content: '丙' },
      { id: 4, author: '王维', title: '丁', content: '丁' },
    ]);
    let date = '2024-09-17';
    const authors: string[] = [];
    for (let i = 0; i < 30; i++) {
      authors.push((await poemForDay(asDb(db), date, 3))!.author);
      date = shiftDayStr(date, 1);
    }
    for (let i = 0; i < authors.length; i++) {
      // 回头看 3 天（含今天就是 3 天窗口）
      for (let k = 1; k < 3; k++) {
        if (i - k >= 0) expect(authors[i]).not.toBe(authors[i - k]);
      }
    }
  });

  it('作者名称里的空白不算另一个人', async () => {
    const db = useMemoryDb();
    seedPoems(db, [
      { id: 1, author: ' 李白 ', title: '甲', content: '甲' },
      { id: 2, author: '李白', title: '乙', content: '乙' },
      { id: 3, author: '杜甫', title: '丙', content: '丙' },
    ]);
    const a = await poemForDay(asDb(db), '2024-09-17', 3);
    const b = await poemForDay(asDb(db), '2024-09-18', 3);
    expect(a?.author.trim()).not.toBe(b?.author.trim());
  });

  it('换了冷却天数就是另一条序列（设置里的档位真的有用）', async () => {
    const db = seedWithAuthors();
    const soft: number[] = [];
    const hard: number[] = [];
    let date = '2024-09-17';
    for (let i = 0; i < 20; i++) {
      soft.push((await poemForDay(asDb(db), date, 0))!.id);
      hard.push((await poemForDay(asDb(db), date, 7))!.id);
      date = shiftDayStr(date, 1);
    }
    expect(soft).not.toEqual(hard);
  });

  function seedWithAuthors() {
    const db = useMemoryDb();
    seedPoems(
      db,
      Array.from({ length: 6 }, (_, i) => ({
        id: i + 1,
        author: ['李白', '杜甫', '王维', '孟浩然', '苏轼', '李清照'][i],
        title: `日课其${i + 1}`,
        content: '一句\n二句',
      })),
    );
    return db;
  }

  it('跨年（1970 之前的负天数）仍然落在精选池内', async () => {
    const db = seed();
    for (let i = 0; i < 40; i++) {
      const date = shiftDayStr('1969-12-01', i); // dayNumber 为负
      const p = await poemForDay(asDb(db), date);
      expect(p).not.toBeNull();
      expect(p?.daily).toBe(1);
    }
  });

  it('空库返回 null', async () => {
    const db = useMemoryDb();
    expect(await poemForDay(asDb(db), '2024-09-17')).toBeNull();
  });
});

describe('db/应景诗', () => {
  /** 两首题目含「中秋」+ 一首正文含「中秋」，用于验证两段式检索与年度轮换 */
  function seed() {
    const db = useMemoryDb();
    seedPoems(db, [
      { id: 1, title: '中秋月', content: '明月几时有\n把酒问青天' },
      { id: 2, title: '八月十五夜', content: '中秋佳月最端圆\n老桂花开' },
      { id: 3, title: '无题', content: '忆昔中秋\n共饮' },
      { id: 4, title: '春晓', content: '春眠不觉晓' },
    ]);
    return db;
  }

  it('题目命中优先于正文', async () => {
    const db = seed();
    const occ = occasionFor(dayInfo('2024-09-17'));
    const p = await poemForOccasion(asDb(db), '2024-09-17', occ!);
    expect([1, 2]).toContain(p?.id); // 命中题目两首之一，而不是正文那首
  });

  it('同一天稳定、来年换个种子（同一个节令不年年同一首）', async () => {
    const db = seed();
    const occ = occasionFor(dayInfo('2024-09-17'))!;
    const a = await poemForOccasion(asDb(db), '2024-09-17', occ);
    const again = await poemForOccasion(asDb(db), '2024-09-17', occ);
    expect(again?.id).toBe(a?.id);

    // 2025 年中秋（10-06）与 2024 年中秋不是同一天 → 种子不同
    const next = await poemForOccasion(asDb(db), '2025-10-06', occ);
    expect(next).not.toBeNull();
    expect([1, 2]).toContain(next?.id);
  });

  it('只有正文命中时退到正文检索', async () => {
    const db = useMemoryDb();
    seedPoems(db, [
      { id: 1, title: '无题', content: '端午临中夏\n时清日复长' },
      { id: 2, title: '别诗', content: '无关正文' },
    ]);
    const occ = occasionFor(dayInfo('2024-06-10'))!; // 端午节
    const p = await poemForOccasion(asDb(db), '2024-06-10', occ);
    expect(p?.id).toBe(1);
  });

  it('没有任何命中时返回 null', async () => {
    const db = useMemoryDb();
    seedPoems(db, [{ id: 1, title: '春晓', content: '春眠不觉晓' }]);
    const occ = occasionFor(dayInfo('2024-06-10'))!;
    expect(await poemForOccasion(asDb(db), '2024-06-10', occ)).toBeNull();
  });
});

describe('db/pickPoemForDate', () => {
  function seed() {
    const db = useMemoryDb();
    seedPoems(db, [
      { id: 1, title: '中秋月', content: '中秋' },
      { id: 2, title: '春晓', content: '春眠不觉晓' },
      { id: 3, title: '静夜思', content: '床前明月光' },
    ]);
    return db;
  }

  it('应景日且命中 → occasion: true', async () => {
    const db = seed();
    const pick = await pickPoemForDate(asDb(db), '2024-09-17', occasionFor(dayInfo('2024-09-17')));
    expect(pick.occasion).toBe(true);
    expect(pick.poem?.title).toBe('中秋月');
  });

  it('普通日子 → 回退经典轮换（occasion: false）', async () => {
    const db = seed();
    const pick = await pickPoemForDate(asDb(db), '2026-11-03', null);
    expect(pick.occasion).toBe(false);
    expect(pick.poem?.daily).toBe(1);
  });

  it('应景日但没有对应诗 → 回退经典轮换', async () => {
    const db = useMemoryDb();
    seedPoems(db, [{ id: 9, title: '静夜思', content: '床前明月光' }]);
    const pick = await pickPoemForDate(asDb(db), '2024-09-17', occasionFor(dayInfo('2024-09-17')));
    expect(pick.occasion).toBe(false);
    expect(pick.poem?.id).toBe(9);
  });
});

describe('db/检索与选集', () => {
  function seed() {
    const db = useMemoryDb();
    seedCollections(db, [
      { id: 'tang', name: '唐诗三百首', kind: '诗', count: 2, daily: 1 },
      { id: 'song', name: '全宋词', kind: '词', count: 1, daily: 0 },
    ]);
    seedPoems(db, [
      { id: 1, collection: 'tang', name: '唐诗三百首', title: '静夜思', author: '李白', content: '床前明月光', daily: 1 },
      { id: 2, collection: 'tang', name: '唐诗三百首', title: '春晓', author: '孟浩然', content: '春眠不觉晓', daily: 1 },
      { id: 3, collection: 'song', name: '全宋词', title: '水调歌头', author: '苏轼', content: '明月几时有', daily: 0 },
    ]);
    return db;
  }

  it('getPoem / 未知名', async () => {
    const db = seed();
    expect((await getPoem(asDb(db), 2))?.title).toBe('春晓');
    expect(await getPoem(asDb(db), 999)).toBeNull();
  });

  it('poemsOfCollection 按 id 升序', async () => {
    const db = seed();
    const ids = (await poemsOfCollection(asDb(db), 'tang')).map((p: Poem) => p.id);
    expect(ids).toEqual([1, 2]);
  });

  it('listCollections 精选集排在前面', async () => {
    const db = seed();
    const cols = await listCollections(asDb(db));
    expect(cols.map((c: CollectionMeta) => c.id)).toEqual(['tang', 'song']);
  });

  it('getCollection', async () => {
    const db = seed();
    expect((await getCollection(asDb(db), 'song'))?.name).toBe('全宋词');
    expect(await getCollection(asDb(db), 'nope')).toBeNull();
  });

  it('searchPoems 命中题目 / 作者 / 正文', async () => {
    const db = seed();
    const byTitle = await searchPoems(asDb(db), '静夜');
    expect(byTitle.map((p: Poem) => p.id)).toEqual([1]);
    const byAuthor = await searchPoems(asDb(db), '苏轼');
    expect(byAuthor.map((p: Poem) => p.id)).toEqual([3]);
    const byContent = await searchPoems(asDb(db), '明月');
    expect(byContent.map((p: Poem) => p.id)).toEqual([1, 3]);
  });

  it('searchPoems 去掉首尾空白、支持 limit、无结果为空数组', async () => {
    const db = seed();
    expect((await searchPoems(asDb(db), '  春  ')).length).toBe(1);
    expect((await searchPoems(asDb(db), '月', 1)).length).toBe(1);
    expect(await searchPoems(asDb(db), '不存在的词')).toEqual([]);
  });
});

describe('db/收藏与足迹', () => {
  function seed() {
    const db = useMemoryDb();
    seedPoems(db, [
      { id: 1, title: '静夜思', content: '床前明月光' },
      { id: 2, title: '春晓', content: '春眠不觉晓' },
    ]);
    return db;
  }

  it('toggleFavorite 收藏 / 取消收藏', async () => {
    const db = seed();
    expect(await isFavorite(asDb(db), 1)).toBe(false);
    expect(await toggleFavorite(asDb(db), 1)).toBe(true);
    expect(await isFavorite(asDb(db), 1)).toBe(true);
    expect(await toggleFavorite(asDb(db), 1)).toBe(false);
    expect(await isFavorite(asDb(db), 1)).toBe(false);
  });

  it('listFavorites 连表取诗，最新的在前', async () => {
    const db = seed();
    await toggleFavorite(asDb(db), 1);
    await toggleFavorite(asDb(db), 2);
    const list = await listFavorites(asDb(db));
    expect(list.map((p: Poem) => p.id)).toEqual([2, 1]);
    expect(await favoriteCount(asDb(db))).toBe(2);
  });

  it('clearFavorites 清空', async () => {
    const db = seed();
    await toggleFavorite(asDb(db), 1);
    await clearFavorites(asDb(db));
    expect(await favoriteCount(asDb(db))).toBe(0);
    expect(await listFavorites(asDb(db))).toEqual([]);
  });

  it('rememberDay 同一天只记一次', async () => {
    const db = seed();
    await rememberDay(asDb(db), '2024-09-17', 1);
    await rememberDay(asDb(db), '2024-09-17', 2);
    expect(await historyDays(asDb(db))).toBe(1);
    await rememberDay(asDb(db), '2024-09-18', 2);
    expect(await historyDays(asDb(db))).toBe(2);
  });
});
