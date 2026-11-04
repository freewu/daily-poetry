/**
 * SectionList 的「精确坐标」：`getItemLayout` 需要的是**扁平下标**上的
 * `{index, length, offset}`，而分组在列表里其实是「1 个标题 + n 行 + 1 个空尾部」。
 *
 * 为什么非得给 `getItemLayout`：没有它，`scrollToLocation` 只要目标还在渲染窗口外
 * 就直接失败，RN 只能拿 `_averageCellLength`（已量过的那么几十个格子的平均值）
 * 去估位置 —— 而「标题 26px / 作者行 44px」混在一起的平均值，乘以全唐诗那 3700 个
 * 扁平下标，误差是几百行。表现就是：点了字母，高亮换了，列表却停在别处。
 * 把每行的**固定高度**写死 + 这份前缀和，跳转就是一次精确的 `scrollTo`。
 */
export interface SectionMetrics {
  /** 一条作者行的高度（含上下留白） */
  row: number;
  /** 一个分组标题的高度 */
  header: number;
  /** 列表头部（「N 位作者 · 共 M 首 / 全部诗词」那一行）的高度 */
  top?: number;
}

export interface CellMetrics {
  index: number;
  length: number;
  offset: number;
}

/**
 * 按「每组有多少行」生成 `getItemLayout`。
 * 下标口径与 VirtualizedSectionList 一致：每组占 `1 + n + 1` 个格子，
 * 尾部那一格不渲染（高度 0），但下标要留着。
 */
export function makeSectionLayout(
  counts: readonly number[],
  { row, header, top = 0 }: SectionMetrics,
): (data: unknown, index: number) => CellMetrics {
  // 各分组标题在内容容器里的偏移
  const starts: number[] = [];
  let total = top;
  for (const n of counts) {
    starts.push(total);
    total += header + n * row;
  }

  return (_data: unknown, index: number): CellMetrics => {
    let rest = index;
    for (let s = 0; s < counts.length; s++) {
      const n = counts[s];
      const cells = n + 2;
      if (rest < cells) {
        const start = starts[s];
        if (rest === 0) return { index, length: header, offset: start };
        if (rest <= n) return { index, length: row, offset: start + header + (rest - 1) * row };
        return { index, length: 0, offset: start + header + n * row };
      }
      rest -= cells;
    }
    // 越界只在「sections 刚换、列表还按旧下标算」的那一帧出现，
    // 给个收敛的值就行：抛错了会让整页白屏，而下一帧就正常了。
    return { index, length: row, offset: Math.max(0, total - row) };
  };
}

/** 列表总高度：给测试和调试用（RN 那边量的是真实内容高度） */
export function sectionsHeight(counts: readonly number[], { row, header, top = 0 }: SectionMetrics) {
  return counts.reduce((h, n) => h + header + n * row, top);
}
