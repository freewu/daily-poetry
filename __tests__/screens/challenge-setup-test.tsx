import { fireEvent, waitFor, within } from '@testing-library/react-native';

import ChallengeSetupScreen from '@/app/challenge/index';
import { saveChallengeRecord } from '@/lib/db';

import {
  asDb,
  renderWithTheme,
  screen,
  seedCollections,
  seedFavorites,
  seedPoems,
  useMemoryDb,
} from '../helpers/test-utils';

const g = globalThis as any;

/** 收藏 N 首；`song` 是给「换个来源」用的第二个池子 */
function seed(favorites = 3, songCount = 1) {
  const db = useMemoryDb();
  seedCollections(db, [
    { id: 'tang', name: '唐诗三百首', kind: '诗', count: 2, daily: 1 },
    { id: 'song', name: '全宋词', kind: '词', count: songCount, daily: 0 },
  ]);
  seedPoems(db, [
    { id: 1, collection: 'tang', name: '唐诗三百首', title: '静夜思', author: '李白', content: '床前明月光\n疑是地上霜' },
    { id: 2, collection: 'tang', name: '唐诗三百首', title: '登鹳雀楼', author: '王之涣', content: '白日依山尽\n黄河入海流' },
    { id: 3, collection: 'song', name: '全宋词', kind: '词', title: '浣溪沙', author: '晏殊', content: '一曲新词酒一杯' },
  ]);
  seedFavorites(db, [1, 2, 3].slice(0, favorites));
  return db;
}

describe('<ChallengeSetupScreen />（选题源 + 战绩）', () => {
  it('列出收藏与各集子，够出题的来源才会被默认选中', async () => {
    await renderWithTheme(<ChallengeSetupScreen />, { db: seed(3) });

    await waitFor(() => expect(screen.getByTestId('challenge-pool-tang')).toBeTruthy());
    // 收藏 3 首 < 4 首，出不了题，默认落到第一个够 4 首的来源（这里都不够）
    expect(screen.getByText('3 首 · 不够 4 首，出不了题')).toBeTruthy();
    expect(screen.getByText('2 首 · 不够 4 首，出不了题')).toBeTruthy();
    expect(screen.getByTestId('challenge-start')).toBeTruthy();
    expect(screen.getByText('选一个来源')).toBeTruthy();
  });

  it('不把及格 / 优秀的分数线摆在页面上', async () => {
    await renderWithTheme(<ChallengeSetupScreen />, { db: seed(4) });
    await waitFor(() => expect(screen.getByText('十题填空')).toBeTruthy());
    expect(screen.queryByText(/6\s*\/\s*10|8\s*\/\s*10/)).toBeNull();
    expect(screen.queryByText('诗仙下凡')).toBeNull();
  });

  it('收藏够四首就默认选收藏，按钮可以开局', async () => {
    const db = seed(3);
    seedFavorites(db, []);
    seedPoems(db, [
      { id: 4, collection: 'tang', name: '唐诗三百首', title: '江雪', author: '柳宗元', content: '千山鸟飞绝' },
    ]);
    seedFavorites(db, [1, 2, 3, 4]);
    await renderWithTheme(<ChallengeSetupScreen />, { db });

    await waitFor(() => expect(screen.getByText('收藏 · 4 首')).toBeTruthy());
    expect(screen.getByText('开始挑战 · 4 题')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('challenge-start'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/challenge/[pool]',
      params: { pool: 'favorites' },
    });
  });

  it('点别的来源就换成它，再开局带的是集子 id', async () => {
    const db = seed(0, 4);
    // 全宋词给到 4 首，够出题
    seedPoems(db, [
      { id: 5, collection: 'song', name: '全宋词', kind: '词', title: '浣溪沙', author: '苏轼', content: '山下兰芽短浸溪' },
      { id: 6, collection: 'song', name: '全宋词', kind: '词', title: '水调歌头', author: '苏轼', content: '明月几时有' },
      { id: 7, collection: 'song', name: '全宋词', kind: '词', title: '念奴娇', author: '苏轼', content: '大江东去' },
    ]);
    await renderWithTheme(<ChallengeSetupScreen />, { db });

    await waitFor(() => expect(screen.getByTestId('challenge-pool-song')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('challenge-pool-song'));
    await fireEvent.press(screen.getByTestId('challenge-start'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/challenge/[pool]',
      params: { pool: 'song' },
    });
  });

  it('没打过就说没打过', async () => {
    await renderWithTheme(<ChallengeSetupScreen />, { db: seed(0) });
    await waitFor(() => expect(screen.getByTestId('challenge-log-empty')).toBeTruthy());
  });

  it('打过就显示局数 / 最佳 / 平均，以及最近几局的时间与用时', async () => {
    const db = seed(0);
    await saveChallengeRecord(asDb(db), {
      at: new Date(2026, 10, 5, 14, 32).toISOString(),
      pool: 'tang',
      poolName: '唐诗三百首',
      total: 10,
      correct: 8,
      ms: 95_000,
    });
    await renderWithTheme(<ChallengeSetupScreen />, { db });

    await waitFor(() => expect(screen.getByTestId('challenge-log-row')).toBeTruthy());
    const row = within(screen.getByTestId('challenge-log-row'));
    expect(row.getByTestId('challenge-log-score').props.children.join('')).toBe('8/10');
    expect(row.getByText('唐诗三百首')).toBeTruthy();
    expect(row.getByText('11月5日 14:32 · 用时 1 分 35 秒')).toBeTruthy();
    expect(within(screen.getByTestId('challenge-summary')).getByText('平均答对')).toBeTruthy();
  });
});
