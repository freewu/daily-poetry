import { act, fireEvent, waitFor } from '@testing-library/react-native';

import TodayScreen from '@/app/(tabs)/today';
import { poemForDay, prettyDate, shiftDayStr, todayStr, weekdayOf } from '@/lib/db';

import { asDb, renderWithTheme, screen, seedPoems, useMemoryDb } from '../helpers/test-utils';

const POOL = [
  { id: 1, title: '静夜思', author: '李白', content: '床前明月光\n疑是地上霜' },
  { id: 2, title: '春晓', author: '孟浩然', content: '春眠不觉晓\n处处闻啼鸟' },
  { id: 3, title: '登鹳雀楼', author: '王之涣', content: '白日依山尽\n黄河入海流' },
];

/** 当天该是哪首：直接问 db 层，省得在测试里复刻一遍挑选算法 */
async function expectedTitle(db: ReturnType<typeof seed>, date: string) {
  return (await poemForDay(asDb(db), date))!.title;
}

/**
 * 伪造一次手势。
 *
 * 直接调装上 View 的 responder props，而不是 `fireEvent(view, 'responderGrant')`：
 * RNTL 派发事件前会**无参**调一次 `onStartShouldSetResponder` / `onMoveShouldSetResponder`
 * 探路，PanResponder 的这两个包装对无参调用一律返回 false（它要的是原生给的事件），
 * 于是事件被当成「不可达」静默丢掉，测出来永远是「没反应」。
 *
 * 位移也得自己算：PanResponder 不从事件上读 dx/dy，而是从 responder 系统的
 * touchHistory 里累计，所以这里喂一份形状对得上的 touchHistory。
 */
async function swipe(el: { props: Record<string, any> }, dx: number, dy = 0) {
  const track = (x: number, y: number, ts: number) => ({
    touchBank: [
      {
        touchActive: true,
        startPageX: 200,
        startPageY: 300,
        startTimeStamp: 0,
        currentPageX: x,
        currentPageY: y,
        currentTimeStamp: ts,
        previousPageX: 200,
        previousPageY: 300,
        previousTimeStamp: 0,
      },
    ],
    numberActiveTouches: 1,
    indexOfSingleActiveTouch: 0,
    mostRecentTimeStamp: ts,
  });
  const ev = (h: unknown) => ({
    nativeEvent: { pageX: 200, pageY: 300, touches: [], changedTouches: [] },
    touchHistory: h,
  });
  await act(async () => {
    el.props.onResponderGrant(ev(track(200, 300, 0)));
    el.props.onResponderMove(ev(track(200 + dx, 300 + dy, 5)));
    el.props.onResponderRelease(ev(track(200 + dx, 300 + dy, 6)));
  });
}

function seed() {
  const db = useMemoryDb();
  seedPoems(db, POOL);
  return db;
}

describe('<TodayScreen />', () => {
  it('按日期取到当天那首诗，并显示公历 / 农历', async () => {
    const db = seed();
    await renderWithTheme(<TodayScreen />, { db });
    const today = todayStr();

    await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());
    expect(screen.getByText(await expectedTitle(db, today))).toBeTruthy();
    expect(screen.getByText('每日一诗')).toBeTruthy();
    expect(
      screen.getByText(`${prettyDate(today)} · ${weekdayOf(today)}`),
    ).toBeTruthy();
    expect(screen.getByText(/^农历/)).toBeTruthy();
  });

  it('把当天的诗记进「累计读诗天数」', async () => {
    const db = seed();
    await renderWithTheme(<TodayScreen />, { db });
    await waitFor(() =>
      expect(asDb(db).getAllAsync('SELECT date FROM history')).resolves.toEqual([
        { date: todayStr() },
      ]),
    );
  });

  it('前一天 / 后一天切换日期；未来不可前进', async () => {
    const db = seed();
    await renderWithTheme(<TodayScreen />, { db });
    const today = todayStr();
    await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('day-prev'));
    const yesterday = shiftDayStr(today, -1);
    const prevTitle = await expectedTitle(db, yesterday);
    await waitFor(() => expect(screen.getByText(prevTitle)).toBeTruthy());
    expect(
      screen.getByText(`${prettyDate(yesterday)} · ${weekdayOf(yesterday)}`),
    ).toBeTruthy();

    // 「后一天」回到今天
    await fireEvent.press(screen.getByTestId('day-next'));
    const todayTitle = await expectedTitle(db, today);
    await waitFor(() => expect(screen.getByText(todayTitle)).toBeTruthy());
  });

  it('左右滑动翻日：右滑前一天、左滑回今天，越不过今天', async () => {
    const db = seed();
    await renderWithTheme(<TodayScreen />, { db });
    const today = todayStr();
    await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());
    const area = screen.getByTestId('today-swipe');

    // 手指向右滑 → 前一天
    await swipe(area, 120);
    const yesterday = shiftDayStr(today, -1);
    await waitFor(() =>
      expect(
        screen.getByText(`${prettyDate(yesterday)} · ${weekdayOf(yesterday)}`),
      ).toBeTruthy(),
    );
    expect(screen.getByText(await expectedTitle(db, yesterday))).toBeTruthy();

    // 手指向左滑 → 回今天
    await swipe(screen.getByTestId('today-swipe'), -120);
    await waitFor(() =>
      expect(screen.getByText(`${prettyDate(today)} · ${weekdayOf(today)}`)).toBeTruthy(),
    );

    // 已经是今天，再往左滑也不会跑到「明天」
    await swipe(screen.getByTestId('today-swipe'), -120);
    expect(screen.getByText(`${prettyDate(today)} · ${weekdayOf(today)}`)).toBeTruthy();
  });

  it('竖向拖动 / 短距离滑动都不翻日（那是滚动和轻蹭）', async () => {
    const db = seed();
    await renderWithTheme(<TodayScreen />, { db });
    const today = todayStr();
    await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());
    const header = `${prettyDate(today)} · ${weekdayOf(today)}`;

    await swipe(screen.getByTestId('today-swipe'), 20, 160);
    await swipe(screen.getByTestId('today-swipe'), -20, 160);
    await swipe(screen.getByTestId('today-swipe'), 30);
    expect(screen.getByText(header)).toBeTruthy();
  });

  it('页面上有一行「左右滑动」提示', async () => {
    const db = seed();
    await renderWithTheme(<TodayScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());
    expect(screen.getByTestId('today-swipe-hint')).toBeTruthy();
  });

  it('设置里的作者间隔会被用上（不是死守 7 天）', async () => {
    const db = useMemoryDb();
    seedPoems(
      db,
      Array.from({ length: 8 }, (_, i) => ({
        id: i + 1,
        title: `日课其${i + 1}`,
        author: ['李白', '杜甫', '王维', '孟浩然', '苏轼', '李清照', '陶渊明', '白居易'][i],
        content: '一句\n二句',
      })),
    );
    await asDb(db).runAsync(
      "INSERT INTO meta (key, value) VALUES ('settings_daily_gap','30')",
    );

    await renderWithTheme(<TodayScreen />, { db });
    const today = todayStr();
    const wanted = (await poemForDay(asDb(db), today, 30))!.title;
    const ifIgnored = (await poemForDay(asDb(db), today, 7))!.title;

    await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());
    expect(screen.getByText(wanted)).toBeTruthy();
    if (wanted !== ifIgnored) expect(screen.queryByText(ifIgnored)).toBeNull();
  });

  it('应景优先：中秋当天推应景诗并打上标签', async () => {
    const db = useMemoryDb();
    seedPoems(db, [
      { id: 1, title: '中秋月', author: '苏轼', content: '暮云收尽溢清寒' },
      { id: 2, title: '春晓', author: '孟浩然', content: '春眠不觉晓' },
    ]);
    await asDb(db).runAsync(
      "INSERT INTO meta (key, value) VALUES ('settings_push', 'occasion')",
    );

    // 把系统时间固定在 2024-09-17（中秋）
    jest.useFakeTimers({ now: new Date('2024-09-17T09:00:00') });
    try {
      await renderWithTheme(<TodayScreen />, { db });
      await waitFor(() => expect(screen.getByText('中秋月')).toBeTruthy());
      expect(screen.getByText('中秋节 · 节日')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });

  it('经典轮换偏好下，中秋也按日期轮换（不被应景替换）', async () => {
    const db = useMemoryDb();
    const pool = [
      { id: 1, title: '静夜思', author: '李白', content: '床前明月光' },
      { id: 2, title: '春晓', author: '孟浩然', content: '春眠不觉晓' },
      { id: 3, title: '中秋月', author: '苏轼', content: '暮云收尽溢清寒' },
    ];
    seedPoems(db, pool);

    jest.useFakeTimers({ now: new Date('2024-09-17T09:00:00') });
    try {
      await renderWithTheme(<TodayScreen />, { db });
      const expected = (await poemForDay(asDb(db), '2024-09-17'))!.title;

      await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());
      expect(screen.getByText(expected)).toBeTruthy();
      // 节日标签照常展示，但推送内容走经典轮换
      expect(screen.getByText('中秋节 · 节日')).toBeTruthy();
      if (expected !== '中秋月') {
        expect(screen.queryByText('中秋月')).toBeNull();
      }
    } finally {
      jest.useRealTimers();
    }
  });
});
