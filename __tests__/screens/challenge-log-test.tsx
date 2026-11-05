import { waitFor, within } from '@testing-library/react-native';

import ChallengeLogScreen from '@/app/challenge/log';
import { saveChallengeRecord } from '@/lib/db';

import {
  asDb,
  renderWithTheme,
  screen,
  seedCollections,
  seedPoems,
  useMemoryDb,
} from '../helpers/test-utils';

function seed() {
  const db = useMemoryDb();
  seedCollections(db, [{ id: 'tang', name: '唐诗三百首', kind: '诗', count: 2, daily: 1 }]);
  seedPoems(db, [
    { id: 1, collection: 'tang', name: '唐诗三百首', title: '静夜思', author: '李白', content: '床前明月光' },
    { id: 2, collection: 'tang', name: '唐诗三百首', title: '江雪', author: '柳宗元', content: '千山鸟飞绝' },
  ]);
  return db;
}

describe('<ChallengeLogScreen />（战绩）', () => {
  it('没打过就说没打过', async () => {
    await renderWithTheme(<ChallengeLogScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('challenge-log-empty')).toBeTruthy());
    expect(screen.queryByTestId('challenge-summary')).toBeNull();
  });

  it('打过就显示局数 / 最佳 / 平均，以及每局的时间与用时', async () => {
    const db = seed();
    await saveChallengeRecord(asDb(db), {
      at: new Date(2026, 10, 5, 14, 32).toISOString(),
      pool: 'tang',
      poolName: '唐诗三百首',
      total: 10,
      correct: 8,
      ms: 95_000,
    });
    await renderWithTheme(<ChallengeLogScreen />, { db });

    await waitFor(() => expect(screen.getByTestId('challenge-log-row')).toBeTruthy());
    const row = within(screen.getByTestId('challenge-log-row'));
    expect(row.getByTestId('challenge-log-score').props.children.join('')).toBe('8/10');
    expect(row.getByText('唐诗三百首')).toBeTruthy();
    expect(row.getByText('11月5日 14:32 · 用时 1 分 35 秒')).toBeTruthy();
    expect(within(screen.getByTestId('challenge-summary')).getByText('平均答对')).toBeTruthy();
    expect(screen.getByText('战绩')).toBeTruthy();
  });

  it('新的排最前：多局按记录顺序列出', async () => {
    const db = seed();
    const rec = (correct: number, day: number) => ({
      at: new Date(2026, 10, day, 9, 0).toISOString(),
      pool: 'tang',
      poolName: '唐诗三百首',
      total: 10,
      correct,
      ms: 60_000,
    });
    // 先记旧的一局，再记新的（pushRecord 把新的放最前）
    await saveChallengeRecord(asDb(db), rec(4, 3));
    await saveChallengeRecord(asDb(db), rec(9, 4));
    await renderWithTheme(<ChallengeLogScreen />, { db });

    await waitFor(() => expect(screen.getAllByTestId('challenge-log-row')).toHaveLength(2));
    const scores = screen
      .getAllByTestId('challenge-log-score')
      .map((n) => n.props.children.join(''));
    expect(scores).toEqual(['9/10', '4/10']);
  });
});
