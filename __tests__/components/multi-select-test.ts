import { summaryOf } from '@/components/multi-select';

/**
 * 字段上那行摘要：只测纯函数，勾选手感在 `screens/settings-screen-test.tsx` 里走真实点击。
 */
describe('multi-select/摘要', () => {
  it('一部都没勾 → 未选择（正常走不到，脏数据兜底）', () => {
    expect(summaryOf([], 5)).toBe('未选择');
  });

  it('全勾 → 直接说「全部 N 部」，不列名字', () => {
    expect(summaryOf(['甲', '乙', '丙'], 3)).toBe('全部 3 部');
    expect(summaryOf(['甲'], 1)).toBe('全部 1 部');
  });

  it('一两部报名字，多了就「前两个 等 N 部」', () => {
    expect(summaryOf(['唐诗三百首'], 5)).toBe('唐诗三百首');
    expect(summaryOf(['花间集', '诗经'], 5)).toBe('花间集、诗经');
    expect(summaryOf(['花间集', '唐诗三百首', '诗经'], 5)).toBe('花间集、唐诗三百首 等 3 部');
  });
});
