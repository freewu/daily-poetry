/**
 * 左右滑动翻日（今日页）。
 *
 * 判定分两步，缺一不可：
 *
 * 1. `claimsSwipe()` —— 「要不要接管这次手势」。阈值放得比较低（16），
 *    只拦明显横向的拖动；竖向分量更大的一律留给 ScrollView，
 *    否则上下滚诗会被吞掉。
 * 2. `swipeStep()` —— 「松手时算不算翻页、往哪翻」。这里才用真正的门槛
 *    （56px），轻蹭一下不该翻日。
 *
 * 方向约定跟翻书一致：手指向右滑 = 回到前一天（-1），向左滑 = 前往后一天（+1）。
 */
export const SWIPE_MIN_DX = 56;

/** 竖向分量超过横向的这个倍数，就不当翻页（大概是上下滚动） */
export const SWIPE_DY_RATIO = 1.5;

/** 手势位移 → 翻几天：-1 前一天 / 0 不翻 / 1 后一天 */
export function swipeStep(dx: number, dy: number, minDx = SWIPE_MIN_DX): -1 | 0 | 1 {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return 0;
  if (Math.abs(dx) < minDx) return 0;
  if (Math.abs(dy) * SWIPE_DY_RATIO >= Math.abs(dx)) return 0;
  return dx > 0 ? -1 : 1;
}

/** 这一次移动值不值得接管（横向明显大于竖向） */
export function claimsSwipe(dx: number, dy: number): boolean {
  if (!Number.isFinite(dx) || !Number.isFinite(dy)) return false;
  return Math.abs(dx) > 16 && Math.abs(dy) * SWIPE_DY_RATIO < Math.abs(dx);
}
