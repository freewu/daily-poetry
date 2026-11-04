import { makeSectionLayout, sectionsHeight } from '@/lib/section-layout';

// 三个人分组（D / L / #）：D 2 行、L 1 行、# 1 行
const COUNTS = [2, 1, 1];
const M = { row: 40, header: 26, top: 30 };
const layout = makeSectionLayout(COUNTS, M);

describe('makeSectionLayout（gives SectionList its exact offsets）', () => {
  it('每组占「标题 + n 行 + 空尾部」个格子，标题落在组起点', () => {
    // 扁平下标：0 = D 标题，1/2 = 两行，3 = 空尾部，4 = L 标题，…
    expect(layout(null, 0)).toEqual({ index: 0, length: 26, offset: 30 });
    expect(layout(null, 1)).toEqual({ index: 1, length: 40, offset: 56 });
    expect(layout(null, 2)).toEqual({ index: 2, length: 40, offset: 96 });
    // 尾部不渲染，高度 0，但下标要留着
    expect(layout(null, 3)).toEqual({ index: 3, length: 0, offset: 136 });
    // 下一组标题：30 + 26 + 2×40 = 136
    expect(layout(null, 4)).toEqual({ index: 4, length: 26, offset: 136 });
    expect(layout(null, 5)).toEqual({ index: 5, length: 40, offset: 162 });
    expect(layout(null, 6)).toEqual({ index: 6, length: 0, offset: 202 });
    // 最后一组 #：136 + 26 + 40 = 202
    expect(layout(null, 7)).toEqual({ index: 7, length: 26, offset: 202 });
    expect(layout(null, 8)).toEqual({ index: 8, length: 40, offset: 228 });
    expect(layout(null, 9)).toEqual({ index: 9, length: 0, offset: 268 });
  });

  it('总高度与逐格累加一致（分组的空尾部不占高度）', () => {
    expect(sectionsHeight(COUNTS, M)).toBe(30 + (26 + 2 * 40) + (26 + 40) + (26 + 40));
    expect(sectionsHeight(COUNTS, M)).toBe(268);
    expect(layout(null, 9).offset).toBe(sectionsHeight(COUNTS, M));
  });

  it('3000 位诗人也不会累计误差：每个标题的偏移都是精确前缀和', () => {
    // 全唐诗那种体量：一个分组上千行，靠「平均行高」估算会偏几百行
    const counts = [1200, 40, 1500, 3];
    const big = makeSectionLayout(counts, { row: 41, header: 26, top: 30 });
    let offset = 30;
    let index = 0;
    counts.forEach((n) => {
      expect(big(null, index)).toEqual({ index, length: 26, offset });
      // 最后一行
      const last = big(null, index + n);
      expect(last.offset).toBe(offset + 26 + (n - 1) * 41);
      offset += 26 + n * 41;
      index += n + 2;
    });
  });

  it('下标越界（sections 刚换、列表还按旧下标算）不抛错', () => {
    expect(layout(null, 999)).toEqual({ index: 999, length: 40, offset: 228 });
    expect(makeSectionLayout([], M)(null, 0)).toEqual({ index: 0, length: 40, offset: 0 });
  });

  it('top 是列表头部高度，第一组的标题要压在它下面', () => {
    const noTop = makeSectionLayout([2], { row: 40, header: 26 });
    expect(noTop(null, 0).offset).toBe(0);
    expect(makeSectionLayout([2], { row: 40, header: 26, top: 48 })(null, 0).offset).toBe(48);
  });
});
