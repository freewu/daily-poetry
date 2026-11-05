import {
  CACHE_KEEP,
  DAILY_CACHE_KEY,
  PREFETCH_DAYS,
  cachedIdOf,
  dailyPrefs,
  parseDailyCache,
  pickForDateCached,
  pickKeyOf,
  prefetchUpcomingDays,
  resetPrefetchForTest,
  withPick,
  type DailyCache,
} from '@/lib/daily-cache';
import { poemForDay, getSetting, setSetting, shiftDayStr, todayStr } from '@/lib/db';
import { dayInfo, occasionFor } from '@/lib/lunar';

import { asDb, seedPoems, useMemoryDb } from './helpers/memory-db';

const POOL = [
  { id: 1, title: '静夜思', author: '李白', content: '床前明月光\n疑是地上霜' },
  { id: 2, title: '春晓', author: '孟浩然', content: '春眠不觉晓\n处处闻啼鸟' },
  { id: 3, title: '登鹳雀楼', author: '王之涣', content: '白日依山尽\n黄河入海流' },
];

const classic = { push: 'classic' as const, gap: 7 as const };

/** 读 meta 里那份缓存（解析失败 = 测试自己写坏了，直接断言失败更好看） */
async function cacheOf(db: ReturnType<typeof useMemoryDb>): Promise<DailyCache> {
  return JSON.parse((await getSetting(asDb(db), DAILY_CACHE_KEY)) ?? '{}');
}

describe('daily-cache/纯函数', () => {
  it('parseDailyCache：脏数据一律当空，合法条目保留', () => {
    expect(parseDailyCache(null)).toEqual({});
    expect(parseDailyCache('')).toEqual({});
    expect(parseDailyCache('不是 JSON')).toEqual({});
    expect(parseDailyCache('[]')).toEqual({});
    expect(parseDailyCache('null')).toEqual({});
    expect(
      parseDailyCache(
        JSON.stringify({
          '2026-11-05': { id: 7, key: 'classic|7', themed: true },
          '2026-11-06': { id: 8, key: 'classic|7' },
          'bad-date': { id: 9, key: 'classic|7' },
          '2026-11-07': { id: '9', key: 'classic|7' },
          '2026-11-08': { key: 'classic|7' },
          '2026-11-09': null,
        }),
      ),
    ).toEqual({
      '2026-11-05': { id: 7, key: 'classic|7', themed: true },
      '2026-11-06': { id: 8, key: 'classic|7', themed: false },
    });
  });

  it('cachedIdOf：偏好指纹对不上就不用', () => {
    const cache: DailyCache = { '2026-11-05': { id: 3, key: 'classic|7', themed: false } };
    expect(cachedIdOf(cache, '2026-11-05', 'classic|7')).toBe(3);
    expect(cachedIdOf(cache, '2026-11-05', 'occasion|7')).toBeNull();
    expect(cachedIdOf(cache, '2026-11-05', 'classic|3')).toBeNull();
    expect(cachedIdOf(cache, '2026-11-06', 'classic|7')).toBeNull();
  });

  it('pickKeyOf 把两项偏好编进同一个指纹', () => {
    expect(pickKeyOf('classic', 7)).toBe('classic|7');
    expect(pickKeyOf('occasion', 30)).toBe('occasion|30');
  });

  it('withPick：丢掉旧指纹 / 过去的日期，最多留 CACHE_KEEP 条', () => {
    const stale: DailyCache = {
      '2026-11-01': { id: 1, key: 'occasion|7', themed: true },
      '2026-11-05': { id: 2, key: 'classic|7', themed: false },
      '2026-10-30': { id: 3, key: 'classic|7', themed: false },
    };
    expect(withPick(stale, '2026-11-06', { id: 4, themed: false }, 'classic|7', '2026-11-05')).toEqual({
      '2026-11-05': { id: 2, key: 'classic|7', themed: false },
      '2026-11-06': { id: 4, key: 'classic|7', themed: false },
    });

    let cache: DailyCache = {};
    for (let i = 0; i < CACHE_KEEP + 4; i++) {
      const date = `2026-11-${String(10 + i).padStart(2, '0')}`;
      cache = withPick(cache, date, { id: i, themed: false }, 'classic|7', '2026-11-05');
    }
    const days = Object.keys(cache).sort();
    expect(days).toHaveLength(CACHE_KEEP);
    expect(days[days.length - 1]).toBe(`2026-11-${String(10 + CACHE_KEEP + 3).padStart(2, '0')}`);
  });
});

describe('daily-cache/读缓存', () => {
  it('没缓存就现算，并写回 meta（与 poemForDay 是同一首）', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    const today = todayStr();

    const pick = await pickForDateCached(asDb(db), today, classic);
    expect(pick.poem).toEqual(await poemForDay(asDb(db), today, 7));
    expect(pick.occasion).toBe(false);
    expect(await cacheOf(db)).toEqual({
      [today]: { id: pick.poem!.id, key: 'classic|7', themed: false },
    });
  });

  it('命中缓存时直接用缓存里的 id（不再跑一遍挑诗器）', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    const today = todayStr();
    // 默认轮换挑出来的肯定不是这一首，缓存里故意写另一首
    const wrong = (await poemForDay(asDb(db), today, 7))!.id === 1 ? 2 : 1;
    await setSetting(
      asDb(db),
      DAILY_CACHE_KEY,
      JSON.stringify({ [today]: { id: wrong, key: 'classic|7', themed: false } }),
    );

    expect((await pickForDateCached(asDb(db), today, classic)).poem!.id).toBe(wrong);
  });

  it('缓存指向已经不存在的诗 → 当没命中', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    const today = todayStr();
    await setSetting(
      asDb(db),
      DAILY_CACHE_KEY,
      JSON.stringify({ [today]: { id: 9999, key: 'classic|7', themed: false } }),
    );

    const pick = await pickForDateCached(asDb(db), today, classic);
    expect(pick.poem!.id).toBe((await poemForDay(asDb(db), today, 7))!.id);
    expect((await cacheOf(db))[today].id).toBe(pick.poem!.id);
  });

  it('偏好变了（作者间隔）→ 旧条目作废，重算后按新指纹写回', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    const today = todayStr();
    const wrong = (await poemForDay(asDb(db), today, 3))!.id === 1 ? 2 : 1;
    await setSetting(
      asDb(db),
      DAILY_CACHE_KEY,
      JSON.stringify({ [today]: { id: wrong, key: 'classic|7', themed: false } }),
    );

    const pick = await pickForDateCached(asDb(db), today, { push: 'classic', gap: 3 });
    expect(pick.poem!.id).toBe((await poemForDay(asDb(db), today, 3))!.id);
    expect(await cacheOf(db)).toEqual({
      [today]: { id: pick.poem!.id, key: 'classic|3', themed: false },
    });
  });

  it('应景偏好：节日当天取题目里带节令名的诗，并记下 themed', async () => {
    // 找一个真的节日 / 节气日，别在测试里手工维护一份农历表
    let date = todayStr();
    let occ = occasionFor(dayInfo(date));
    for (let i = 0; i < 400 && !occ; i++) {
      date = shiftDayStr(date, 1);
      occ = occasionFor(dayInfo(date));
    }
    expect(occ).not.toBeNull();

    const db = useMemoryDb();
    seedPoems(db, [...POOL, { id: 4, title: occ!.label, content: '应景一句\n再来一句' }]);

    const pick = await pickForDateCached(asDb(db), date, { push: 'occasion', gap: 7 });
    expect(pick.poem!.id).toBe(4);
    expect(pick.occasion).toBe(true);
    // 应景偏好下才写缓存；classic 偏好不会用这条
    const cached = await cacheOf(db);
    if (date >= todayStr()) {
      expect(cached[date]).toEqual({ id: 4, key: 'occasion|7', themed: true });
    }
    expect((await pickForDateCached(asDb(db), date, classic)).poem!.id).not.toBe(4);
  });

  it('往回翻的日子不写缓存（看完就过去了）', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    const yesterday = shiftDayStr(todayStr(), -1);

    const pick = await pickForDateCached(asDb(db), yesterday, classic);
    expect(pick.poem).not.toBeNull();
    expect(await cacheOf(db)).toEqual({});
  });

  it('dailyPrefs 读的是 settings_push / settings_daily_gap', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    expect(await dailyPrefs(asDb(db))).toEqual({ push: 'classic', gap: 7 });

    await setSetting(asDb(db), 'settings_push', 'occasion');
    await setSetting(asDb(db), 'settings_daily_gap', '30');
    expect(await dailyPrefs(asDb(db))).toEqual({ push: 'occasion', gap: 30 });
  });
});

describe('daily-cache/后台预取', () => {
  beforeEach(() => resetPrefetchForTest());

  it('把明后几天的诗算好写进 meta（与 poemForDay 同一首）', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    const today = todayStr();

    expect(await prefetchUpcomingDays(asDb(db), classic)).toBe(PREFETCH_DAYS);
    const cache = await cacheOf(db);
    for (let i = 1; i <= PREFETCH_DAYS; i++) {
      const date = shiftDayStr(today, i);
      expect(cache[date]).toEqual({
        id: (await poemForDay(asDb(db), date, 7))!.id,
        key: 'classic|7',
        themed: false,
      });
    }
    expect(cache[today]).toBeUndefined();
    expect(Object.keys(cache)).toHaveLength(PREFETCH_DAYS);
  });

  it('同一个库一整个会话只跑一次（每次 focus 都重算是白烧电）', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    expect(await prefetchUpcomingDays(asDb(db), classic)).toBe(PREFETCH_DAYS);
    expect(await prefetchUpcomingDays(asDb(db), classic)).toBe(0);
    resetPrefetchForTest();
    // 标记清了也不重复算：缓存里都有
    expect(await prefetchUpcomingDays(asDb(db), classic)).toBe(0);
  });

  it('预取之后打开那一天的页面直接命中缓存', async () => {
    const db = useMemoryDb();
    seedPoems(db, POOL);
    const tomorrow = shiftDayStr(todayStr(), 1);
    await prefetchUpcomingDays(asDb(db), classic);

    const loaded = await pickForDateCached(asDb(db), tomorrow, classic);
    expect(loaded.poem!.id).toBe((await cacheOf(db))[tomorrow].id);
    // 再把缓存换成别的诗，能改出来就说明「打开时确实读了缓存」
    const other = loaded.poem!.id === 1 ? 2 : 1;
    await setSetting(
      asDb(db),
      DAILY_CACHE_KEY,
      JSON.stringify({ ...(await cacheOf(db)), [tomorrow]: { id: other, key: 'classic|7', themed: false } }),
    );
    expect((await pickForDateCached(asDb(db), tomorrow, classic)).poem!.id).toBe(other);
  });
});
