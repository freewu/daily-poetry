// 今日页左右滑动翻日的判定（纯函数部分）。
//
// 真机手势本身没法在 Jest 里模拟（PanResponder 从原生 responder 系统拿位移），
// 所以把「算不算翻页、往哪翻」抽出来单测，手势接线靠 .maestro 兜底。
import { claimsSwipe, SWIPE_MIN_DX, swipeStep } from '@/lib/swipe';

describe('swipeStep 翻页方向', () => {
  it('向右滑 = 前一天，向左滑 = 后一天', () => {
    expect(swipeStep(80, 6)).toBe(-1);
    expect(swipeStep(-80, 6)).toBe(1);
  });

  it('位移太短不翻（轻蹭一下不算）', () => {
    expect(swipeStep(SWIPE_MIN_DX - 1, 0)).toBe(0);
    expect(swipeStep(-(SWIPE_MIN_DX - 1), 0)).toBe(0);
    expect(swipeStep(SWIPE_MIN_DX, 0)).toBe(-1);
  });

  it('竖向分量更大时不算翻页（那是上下滚动）', () => {
    expect(swipeStep(80, 120)).toBe(0);
    expect(swipeStep(-80, -120)).toBe(0);
    // 斜着滑但横向仍明显占优，照翻
    expect(swipeStep(-80, 20)).toBe(1);
  });

  it('刚好卡在竖向倍数上算滚动', () => {
    // |dy| * 1.5 >= |dx| → 60 * 1.5 = 90 >= 80
    expect(swipeStep(80, 60)).toBe(0);
    expect(swipeStep(-91, 60)).toBe(1);
  });

  it('脏数据（NaN / Infinity）一律不翻', () => {
    expect(swipeStep(Number.NaN, 0)).toBe(0);
    expect(swipeStep(80, Number.NaN)).toBe(0);
    expect(swipeStep(Number.POSITIVE_INFINITY, 0)).toBe(0);
  });

  it('门槛可以按需调整', () => {
    expect(swipeStep(-30, 0, 20)).toBe(1);
    expect(swipeStep(30, 0, 40)).toBe(0);
  });
});

describe('claimsSwipe 接管判定', () => {
  it('横向明显多于竖向才接管', () => {
    expect(claimsSwipe(18, 2)).toBe(true);
    expect(claimsSwipe(-30, 10)).toBe(true);
    expect(claimsSwipe(30, 40)).toBe(false);
  });

  it('起手就扶正（位移太小）不接管，免得抢掉点击', () => {
    expect(claimsSwipe(10, 0)).toBe(false);
    expect(claimsSwipe(0, 0)).toBe(false);
  });

  it('脏数据不接管', () => {
    expect(claimsSwipe(Number.NaN, 0)).toBe(false);
    expect(claimsSwipe(80, Number.NaN)).toBe(false);
  });
});
