// 每日一诗的作者冷却：设置档位 + 纯挑选器（日期 → 诗）。
// 要求是「gap 天内不重复同一位作者」，这条规矩由挑选过程本身保证，不是抽完再筛。

import {
  createDailyPicker,
  DAILY_FAVORITES,
  DAILY_SCOPE_KEY,
  DEFAULT_GAP,
  DEFAULT_GAP_KEY,
  GAP_OPTS,
  gapKeyOf,
  gapOf,
  hashString,
  isGapKey,
  offsetFor,
  parseDailyScope,
  serializeDailyScope,
  toggleDailyScope,
} from '@/lib/daily';

describe('GAP_OPTS', () => {
  it('五档：不限 / 3 / 7 / 14 / 30 天，默认 7', () => {
    expect(GAP_OPTS.map((o) => o.key)).toEqual(['0', '3', '7', '14', '30']);
    expect(GAP_OPTS.map((o) => o.gap)).toEqual([0, 3, 7, 14, 30]);
    expect(GAP_OPTS.every((o) => o.label && o.hint)).toBe(true);
    expect(DEFAULT_GAP_KEY).toBe('7');
    expect(DEFAULT_GAP).toBe(7);
  });
});

describe('isGapKey / gapKeyOf / gapOf', () => {
  it('只认五个档位键', () => {
    expect(isGapKey('7')).toBe(true);
    expect(isGapKey('8')).toBe(false);
    expect(isGapKey(7)).toBe(false);
    expect(isGapKey(null)).toBe(false);
  });

  it('库里的脏值退回默认档', () => {
    expect(gapKeyOf('14')).toBe('14');
    expect(gapKeyOf('abc')).toBe(DEFAULT_GAP_KEY);
    expect(gapKeyOf(null)).toBe(DEFAULT_GAP_KEY);
    expect(gapOf('30')).toBe(30);
    expect(gapOf('')).toBe(DEFAULT_GAP);
    expect(gapOf(undefined)).toBe(DEFAULT_GAP);
  });
});

describe('hashString / offsetFor', () => {
  it('同一个键永远同一个下标，落点在 [0, n)', () => {
    expect(hashString('2024-09-17|fest-zhongqiu|title')).toBe(
      hashString('2024-09-17|fest-zhongqiu|title'),
    );
    for (let i = 0; i < 50; i++) {
      const k = offsetFor(`seed-${i}`, 7);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThan(7);
    }
  });

  it('不同键会散到不同下标（不是永远 0）', () => {
    const hits = new Set(Array.from({ length: 50 }, (_, i) => offsetFor(`d${i}`, 5)));
    expect(hits.size).toBeGreaterThan(1);
  });

  it('n <= 0 时不炸，返回 0', () => {
    expect(offsetFor('x', 0)).toBe(0);
    expect(offsetFor('x', -3)).toBe(0);
  });
});

const ROMAN = ['李白', '杜甫', '王维', '孟浩然', '苏轼', '李清照', '陶渊明', '白居易'];

// ---------------------------------------------------------------- 精选诗集（设置里的范围）
const AVAILABLE = ['huajianji', 'tangshi', 'shijing'];
/** 能选的 = 所有集子 + 「我的收藏」；没选过时默认选建库时那几部精选 */
const ALL = [...AVAILABLE, DAILY_FAVORITES];

describe('精选诗集（每日池的范围）', () => {
  it('KV 键跟着设置名字走，「我的收藏」用虚拟集子 id', () => {
    expect(DAILY_SCOPE_KEY).toBe('settings_daily_collections');
    expect(DAILY_FAVORITES).toBe('favorites');
  });

  it('没存过 / 脏值 / 全部失效 → 退回默认那几部精选，池子不会空', () => {
    for (const raw of [null, undefined, '', '  ', 'nope,invalid']) {
      expect(parseDailyScope(raw, ALL, AVAILABLE)).toEqual(AVAILABLE);
    }
    // 没给默认值就当「全选」
    expect(parseDailyScope(null, ALL)).toEqual(ALL);
    // 库里一部集子都没有时也不炸（空 = 不限集子，整池）
    expect(parseDailyScope('tangshi', [])).toEqual([]);
  });

  it('只留能选的 id，顺序跟 available 一致', () => {
    expect(parseDailyScope('shijing,tangshi', ALL, AVAILABLE)).toEqual(['tangshi', 'shijing']);
    // 旧库里已经没了的 id 直接丢掉
    expect(parseDailyScope('gone,tangshi', ALL, AVAILABLE)).toEqual(['tangshi']);
    expect(parseDailyScope(' gone , shijing ', ALL, AVAILABLE)).toEqual(['shijing']);
    // 「我的收藏」也是合法选项
    expect(parseDailyScope(`${DAILY_FAVORITES},tangshi`, ALL, AVAILABLE)).toEqual([
      'tangshi',
      DAILY_FAVORITES,
    ]);
  });

  it('序列化按 available 排序：同一个选择永远同一个串', () => {
    expect(serializeDailyScope(['shijing', 'tangshi'], AVAILABLE)).toBe('tangshi,shijing');
    expect(serializeDailyScope([], AVAILABLE)).toBe('');
    // 与解析是一对：写进去再读回来是同一个选择
    const ids = ['huajianji', 'shijing'];
    expect(parseDailyScope(serializeDailyScope(ids, AVAILABLE), AVAILABLE)).toEqual(ids);
    expect(
      parseDailyScope(serializeDailyScope([DAILY_FAVORITES], ALL), ALL, AVAILABLE),
    ).toEqual([DAILY_FAVORITES]);
  });

  it('toggleDailyScope：勾上 / 取消，顺序稳定', () => {
    expect(toggleDailyScope(['tangshi'], 'shijing', AVAILABLE)).toEqual(['tangshi', 'shijing']);
    expect(toggleDailyScope(['tangshi', 'shijing'], 'tangshi', AVAILABLE)).toEqual(['shijing']);
    expect(toggleDailyScope(['huajianji', 'tangshi', 'shijing'], 'tangshi', AVAILABLE)).toEqual([
      'huajianji',
      'shijing',
    ]);
  });

  it('必须选择一个：最后一部点不掉', () => {
    expect(toggleDailyScope(['tangshi'], 'tangshi', AVAILABLE)).toEqual(['tangshi']);
    // 从脏值（当没选过 → 默认九部精选）出发也一样
    expect(toggleDailyScope(['gone'], 'gone', AVAILABLE)).toEqual(AVAILABLE);
    // 只剩「我的收藏」时也点不掉
    expect(toggleDailyScope([DAILY_FAVORITES], DAILY_FAVORITES, ALL, AVAILABLE)).toEqual([
      DAILY_FAVORITES,
    ]);
  });
});

/** 每位作者两首，够验证「同一位作者再来时换一首」 */
function rowsOf(authors: string[]) {
  return authors.flatMap((author, i) => [
    { id: i * 2 + 1, author },
    { id: i * 2 + 2, author },
  ]);
}

describe('createDailyPicker', () => {
  it('池子为空时返回 null', () => {
    expect(createDailyPicker([], 7).idFor(20000)).toBeNull();
  });

  it('同一日期永远同一首，且只会给池子里的诗', () => {
    const rows = rowsOf(ROMAN);
    const p = createDailyPicker(rows, 7);
    const a = p.idFor(20000);
    expect(a).toBe(p.idFor(20000));
    const ids = new Set(rows.map((r) => r.id));
    for (let d = 19000; d < 19060; d++) expect(ids.has(p.idFor(d)!)).toBe(true);
  });

  it('两台设备算出来的序列完全一样（日期 → 诗，可复现）', () => {
    const rows = rowsOf(ROMAN);
    const a = createDailyPicker(rows, 14);
    const b = createDailyPicker(rows, 14);
    for (let d = 15000; d < 15040; d++) expect(b.idFor(d)).toBe(a.idFor(d));
  });

  it('7 天内不出同一位作者', () => {
    const rows = rowsOf(ROMAN);
    const p = createDailyPicker(rows, 7);
    const authorOf = new Map(rows.map((r) => [r.id, r.author]));
    const authors: string[] = [];
    for (let d = 19000; d < 19120; d++) authors.push(authorOf.get(p.idFor(d)!)!);
    for (let i = 0; i < authors.length; i++) {
      for (let k = 1; k < 7 && i - k >= 0; k++) {
        expect(authors[i]).not.toBe(authors[i - k]);
      }
    }
  });

  it('冷却天数不同，选出来的序列也不同', () => {
    const rows = rowsOf(ROMAN);
    const soft = createDailyPicker(rows, 0);
    const hard = createDailyPicker(rows, 7);
    const a: number[] = [];
    const b: number[] = [];
    for (let d = 19000; d < 19040; d++) {
      a.push(soft.idFor(d)!);
      b.push(hard.idFor(d)!);
    }
    expect(a).not.toEqual(b);
  });

  it('不限（gap = 0）时相邻两天可以撞作者', () => {
    const rows = rowsOf(ROMAN.slice(0, 2));
    const p = createDailyPicker(rows, 0);
    const authorOf = new Map(rows.map((r) => [r.id, r.author]));
    let repeat = false;
    for (let d = 19000; d < 19030 && !repeat; d++) {
      repeat = authorOf.get(p.idFor(d)!) === authorOf.get(p.idFor(d + 1)!);
    }
    expect(repeat).toBe(true);
  });

  it('作者比冷却天数还少时退化成轮流，不会连着两天同一个人', () => {
    const rows = rowsOf(ROMAN.slice(0, 3));
    const p = createDailyPicker(rows, 30);
    const authorOf = new Map(rows.map((r) => [r.id, r.author]));
    const authors: string[] = [];
    for (let d = 19000; d < 19030; d++) authors.push(authorOf.get(p.idFor(d)!)!);
    for (let i = 1; i < authors.length; i++) expect(authors[i]).not.toBe(authors[i - 1]);
  });

  it('无名诗统一算「佚名」，冷却期内不连着出现', () => {
    const rows = [
      { id: 1, author: '' },
      { id: 2, author: '' },
      { id: 3, author: '李白' },
    ];
    const p = createDailyPicker(rows, 3);
    const ids: number[] = [];
    for (let d = 19000; d < 19030; d++) ids.push(p.idFor(d)!);
    // 两位「作者」（佚名 + 李白）三首诗：30 天里都露过面
    expect(new Set(ids)).toEqual(new Set([1, 2, 3]));
    // 两首无名诗算同一位作者 → 不相邻
    for (let i = 1; i < ids.length; i++) {
      expect([1, 2].includes(ids[i]) && [1, 2].includes(ids[i - 1])).toBe(false);
    }
  });

  it('作者名带空白算同一个人', () => {
    const p = createDailyPicker(
      [
        { id: 1, author: ' 李白 ' },
        { id: 2, author: '李白' },
        { id: 3, author: '杜甫' },
      ],
      2,
    );
    // 只有两个人 → 相邻两天必然换人（两首李白轮着出现也没关系）
    const seen: number[] = [];
    for (let d = 19000; d < 19020; d++) seen.push(p.idFor(d)!);
    expect(seen.filter((id) => id === 3).length).toBeGreaterThan(0);
    expect(seen.every((id) => id === 1 || id === 2 || id === 3)).toBe(true);
  });

  it('1970 年以前的日期按起点算，不会崩', () => {
    const p = createDailyPicker(rowsOf(ROMAN), 7);
    expect(p.idFor(-1)).toBe(p.idFor(-50000));
    expect(p.idFor(-50000)).not.toBeNull();
  });
});
