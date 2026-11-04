import { waitFor } from '@testing-library/react-native';

import AuthorScreen from '@/app/author/[name]';

import { renderWithTheme, screen, seedCollections, seedPoems, useMemoryDb } from '../helpers/test-utils';

const g = globalThis as any;

function seed() {
  const db = useMemoryDb();
  seedCollections(db, [
    { id: 'tang', name: '唐诗三百首', kind: '诗', count: 3, daily: 1 },
    { id: 'song', name: '全宋词', kind: '词', count: 1, daily: 0 },
  ]);
  seedPoems(db, [
    { id: 1, collection: 'tang', title: '静夜思', author: '李白', content: '床前明月光' },
    { id: 2, collection: 'tang', title: '将进酒', author: '李白', content: '君不见黄河之水天上来' },
    { id: 3, collection: 'tang', title: '春望', author: '杜甫', content: '国破山河在' },
    { id: 4, collection: 'song', title: '水调歌头', author: '李白', content: '明月几时有', kind: '词' },
  ]);
  return db;
}

describe('<AuthorScreen />', () => {
  it('只列这位作者在这个集子里的作品，并标出数量', async () => {
    g.__ROUTE_PARAMS__ = { name: '李白', coll: 'tang', tw: '' };
    await renderWithTheme(<AuthorScreen />, { db: seed() });

    await waitFor(() => expect(screen.getByTestId('author-sub')).toBeTruthy());
    expect(screen.getByText('唐诗三百首 · 共 2 首')).toBeTruthy();
    expect(screen.getByText('静夜思')).toBeTruthy();
    expect(screen.getByText('将进酒')).toBeTruthy();
    // 别人的诗、别的集子的诗都不混进来
    expect(screen.queryByText('春望')).toBeNull();
    expect(screen.queryByText('水调歌头')).toBeNull();
  });

  it('标题就是作者名（繁體模式用繁体列）', async () => {
    g.__ROUTE_PARAMS__ = { name: '苏轼', coll: 'tang', tw: '蘇軾' };
    const db = seed();
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('settings_script', 'tw')");
    await renderWithTheme(<AuthorScreen />, { db });
    await waitFor(() => expect(screen.getByText('蘇軾')).toBeTruthy());
  });

  it('没署名的作者显示「佚名」', async () => {
    g.__ROUTE_PARAMS__ = { name: '', coll: 'tang', tw: '' };
    const db = seed();
    await db.runAsync("UPDATE poems SET author = '' WHERE id = 3");
    await renderWithTheme(<AuthorScreen />, { db });

    await waitFor(() => expect(screen.getByText('佚名')).toBeTruthy());
    expect(screen.getByText('春望')).toBeTruthy();
  });

  it('查不到作品时给出空态', async () => {
    g.__ROUTE_PARAMS__ = { name: '不存在的作者', coll: 'tang', tw: '' };
    await renderWithTheme(<AuthorScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByText('这位作者的作品没找到')).toBeTruthy());
  });
});
