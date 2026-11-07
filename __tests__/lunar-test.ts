import { dayInfo, occasionFor, occasionTag } from '@/lib/lunar';

// 期望值均来自 lunar-javascript 的实际输出（六库对照），改算法时这些日子必须仍然对得上。
describe('lunar/dayInfo', () => {
  it('2024-09-17 是甲辰年八月十五（中秋）', () => {
    expect(dayInfo('2024-09-17')).toEqual({
      lunarDate: '八月十五',
      ganzhi: '甲辰年',
      festivals: ['中秋节'],
      jieqi: '',
    });
  });

  it('2024-02-04 是立春（节气日无节日）', () => {
    const info = dayInfo('2024-02-04');
    expect(info.jieqi).toBe('立春');
    expect(info.lunarDate).toBe('腊月廿五');
    expect(info.festivals).toEqual([]);
  });

  it('2023-01-22 是正月初一（春节）', () => {
    const info = dayInfo('2023-01-22');
    expect(info.lunarDate).toBe('正月初一');
    expect(info.festivals).toContain('春节');
    expect(info.ganzhi).toBe('癸卯年');
  });
});

describe('lunar/occasionFor', () => {
  it('中秋命中节日应景', () => {
    const occ = occasionFor(dayInfo('2024-09-17'));
    expect(occ).toMatchObject({ id: 'fest-zhongqiu', kind: 'festival', label: '中秋节' });
    expect(occ?.keywords).toContain('中秋');
  });

  it('端午命中节日应景', () => {
    expect(occasionFor(dayInfo('2024-06-10'))?.id).toBe('fest-duanwu');
  });

  it('重阳命中节日应景', () => {
    expect(occasionFor(dayInfo('2025-10-29'))?.id).toBe('fest-chongyang');
  });

  it('节气日命中节气应景', () => {
    const occ = occasionFor(dayInfo('2024-02-04'));
    expect(occ).toMatchObject({ id: 'term-立春', kind: 'term' });
  });

  it('普通日子没有应景', () => {
    expect(occasionFor(dayInfo('2026-11-03'))).toBeNull();
  });
});

describe('lunar/occasionTag', () => {
  it('节日比节气优先（跟应景推送一个口径）', () => {
    expect(occasionTag(dayInfo('2024-09-17'))).toEqual({ label: '中秋节', kind: 'festival' });
  });

  it('节气日给节气名', () => {
    expect(occasionTag(dayInfo('2026-11-07'))).toEqual({ label: '立冬', kind: 'term' });
    expect(occasionTag(dayInfo('2026-04-05'))).toEqual({ label: '清明', kind: 'term' });
  });

  it('农历库认得出、我们没收录的节日也照名字显示', () => {
    // 2026-01-26 腊八节（不在 FESTIVAL_OCCASIONS 里，也不是节气）
    expect(occasionTag(dayInfo('2026-01-26'))).toEqual({ label: '腊八节', kind: 'festival' });
  });

  it('既是节气又是（未收录的）节日时，节气优先 —— 跟应景推送用同一套', () => {
    // 2026-03-20 = 春分 + 龙头节；挑诗那边认的是春分，抬头不能跟它串
    expect(occasionTag(dayInfo('2026-03-20'))).toEqual({ label: '春分', kind: 'term' });
  });

  it('普通日子 → null', () => {
    expect(occasionTag(dayInfo('2026-11-03'))).toBeNull();
  });
});
