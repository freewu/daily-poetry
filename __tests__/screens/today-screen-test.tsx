import { fireEvent, waitFor } from '@testing-library/react-native';

import TodayScreen from '@/app/(tabs)/today';
import { dayNumber, prettyDate, shiftDayStr, todayStr, weekdayOf } from '@/lib/db';

import { asDb, renderWithTheme, screen, seedPoems, useMemoryDb } from '../helpers/test-utils';

const POOL = [
  { id: 1, title: '静夜思', author: '李白', content: '床前明月光\n疑是地上霜' },
  { id: 2, title: '春晓', author: '孟浩然', content: '春眠不觉晓\n处处闻啼鸟' },
  { id: 3, title: '登鹳雀楼', author: '王之涣', content: '白日依山尽\n黄河入海流' },
];

/** 与 lib/db 的确定性算法保持一致：offset = dayNumber % 池大小 */
function expectedTitle(date: string) {
  return POOL[dayNumber(date) % POOL.length].title;
}

function seed() {
  const db = useMemoryDb();
  seedPoems(db, POOL);
  return db;
}

describe('<TodayScreen />', () => {
  it('按日期取到当天那首诗，并显示公历 / 农历', async () => {
    await renderWithTheme(<TodayScreen />, { db: seed() });
    const today = todayStr();

    await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());
    expect(screen.getByText(expectedTitle(today))).toBeTruthy();
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
    await renderWithTheme(<TodayScreen />, { db: seed() });
    const today = todayStr();
    await waitFor(() => expect(screen.getByTestId('today-poem')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('day-prev'));
    const yesterday = shiftDayStr(today, -1);
    await waitFor(() =>
      expect(screen.getByText(expectedTitle(yesterday))).toBeTruthy(),
    );
    expect(
      screen.getByText(`${prettyDate(yesterday)} · ${weekdayOf(yesterday)}`),
    ).toBeTruthy();

    // 「后一天」回到今天
    await fireEvent.press(screen.getByTestId('day-next'));
    await waitFor(() =>
      expect(screen.getByText(expectedTitle(today))).toBeTruthy(),
    );
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
      const expected = pool[dayNumber('2024-09-17') % pool.length].title;

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
