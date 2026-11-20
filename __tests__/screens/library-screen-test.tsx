import { fireEvent, waitFor } from '@testing-library/react-native';

import LibraryScreen from '@/app/(tabs)/library';

import {
  asDb,
  renderWithTheme,
  screen,
  seedCollections,
  seedPoems,
  useMemoryDb,
} from '../helpers/test-utils';

const g = globalThis as any;

function seed() {
  const db = useMemoryDb();
  seedCollections(db, [
    { id: 'tang', name: '唐诗三百首', kind: '诗', count: 2, daily: 1 },
    { id: 'song', name: '全宋词', kind: '词', count: 1, daily: 0 },
  ]);
  seedPoems(db, [
    { id: 1, collection: 'tang', name: '唐诗三百首', title: '静夜思', author: '李白', content: '床前明月光' },
    { id: 2, collection: 'tang', name: '唐诗三百首', title: '春晓', author: '孟浩然', content: '春眠不觉晓' },
    { id: 3, collection: 'song', name: '全宋词', kind: '词', title: '水调歌头', author: '苏轼', content: '明月几时有' },
  ]);
  return db;
}

describe('<LibraryScreen />', () => {
  it('列出全部选集（集名 / 体裁 / 数量）', async () => {
    await renderWithTheme(<LibraryScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByText('唐诗三百首')).toBeTruthy());
    expect(screen.getByText('全宋词')).toBeTruthy();
    expect(screen.getByText('共 2 首')).toBeTruthy();
    expect(screen.getByText('每日精选')).toBeTruthy();
  });

  it('没勾过时，「每日精选」小字跟着建库时那几部走', async () => {
    await renderWithTheme(<LibraryScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('daily-tang')).toBeTruthy());
    expect(screen.queryByTestId('daily-song')).toBeNull();
  });

  it('设置里改了勾选，「每日精选」小字跟着换（不是建库时的 daily 列）', async () => {
    const db = seed();
    // 全宋词建库时 daily = 0，但用户在设置里只勾了它
    await asDb(db).runAsync(
      "INSERT OR REPLACE INTO meta (key, value) VALUES ('settings_daily_collections','song')",
    );
    await renderWithTheme(<LibraryScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('daily-song')).toBeTruthy());
    expect(screen.queryByTestId('daily-tang')).toBeNull();
  });

  it('点选集进列表页', async () => {
    await renderWithTheme(<LibraryScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('collection-tang')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('collection-tang'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/collection/[id]',
      params: { id: 'tang' },
    });
  });

  it('输入关键词做全文检索，并显示命中数量', async () => {
    await renderWithTheme(<LibraryScreen />, { db: seed() });
    await fireEvent.changeText(screen.getByTestId('search-input'), '明月');

    await waitFor(() => expect(screen.getByText('找到 2 首与「明月」相关')).toBeTruthy());
    expect(screen.getByText('静夜思')).toBeTruthy();
    expect(screen.getByText('水调歌头')).toBeTruthy();
    expect(screen.queryByText('春晓')).toBeNull();
  });

  it('无命中时给出空态', async () => {
    await renderWithTheme(<LibraryScreen />, { db: seed() });
    await fireEvent.changeText(screen.getByTestId('search-input'), '不存在的词');

    await waitFor(() => expect(screen.getByText('找到 0 首与「不存在的词」相关')).toBeTruthy());
    expect(screen.getByTestId('search-empty')).toBeTruthy();
  });

  it('点检索结果进诗词详情', async () => {
    await renderWithTheme(<LibraryScreen />, { db: seed() });
    await fireEvent.changeText(screen.getByTestId('search-input'), '春眠');
    await waitFor(() => expect(screen.getByTestId('poem-row-2')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('poem-row-2'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/poem/[id]',
      params: { id: '2' },
    });
  });
});
