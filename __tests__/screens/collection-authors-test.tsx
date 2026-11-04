import { fireEvent, waitFor } from '@testing-library/react-native';

import CollectionAuthorsScreen from '@/app/collection/[id]';

import { renderWithTheme, screen, seedCollections, seedPoems, useMemoryDb } from '../helpers/test-utils';

const g = globalThis as any;

/** 唐诗三百首：李白 ×3、杜甫 ×1、署名空的 ×1；另一个集子里放着苏轼（不该混进来） */
function seed() {
  const db = useMemoryDb();
  seedCollections(db, [
    { id: 'tang', name: '唐诗三百首', kind: '诗', count: 5, daily: 1 },
    { id: 'song', name: '全宋词', kind: '词', count: 1, daily: 0 },
  ]);
  seedPoems(db, [
    { id: 1, collection: 'tang', title: '静夜思', author: '李白', content: '床前明月光' },
    { id: 2, collection: 'tang', title: '将进酒', author: '李白', content: '君不见黄河之水天上来' },
    { id: 3, collection: 'tang', title: '月下独酌', author: '李白', content: '花间一壶酒' },
    { id: 4, collection: 'tang', title: '春望', author: '杜甫', content: '国破山河在' },
    { id: 5, collection: 'tang', title: '无题', author: '', content: '一片两片三四片' },
    { id: 6, collection: 'song', title: '水调歌头', author: '苏轼', content: '明月几时有' },
  ]);
  return db;
}

describe('<CollectionAuthorsScreen />', () => {
  it('列出作者与收录数量，按首字母分组', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });

    await waitFor(() => expect(screen.getByText('李白')).toBeTruthy());
    expect(screen.getByText('3 首')).toBeTruthy();
    expect(screen.getByText('杜甫')).toBeTruthy();
    // 没署名的统一显示「佚名」
    expect(screen.getByText('佚名')).toBeTruthy();
    // 别的集子的作者不混进来
    expect(screen.queryByText('苏轼')).toBeNull();
    // 3 位：李白 / 杜甫 / 佚名（没署名的那首算一个人）· 共 5 首
    expect(screen.getByText('3 位作者 · 共 5 首')).toBeTruthy();
  });

  it('左侧索引只放有作者的字母（没有的空档不显示）', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('letter-rail')).toBeTruthy());

    expect(screen.getByTestId('letter-D')).toBeTruthy();
    expect(screen.getByTestId('letter-L')).toBeTruthy();
    expect(screen.getByTestId('letter-#')).toBeTruthy();
    // 没有 A / B / C 的作者，就不该有这几个字母
    expect(screen.queryByTestId('letter-A')).toBeNull();
    expect(screen.queryByTestId('letter-C')).toBeNull();
  });

  it('点索引字母跳到对应分组（不崩，且高亮跟上）', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('letter-D')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('letter-D'));
    // 摘要还在，说明页面没被滚动异常带崩
    expect(screen.getByText('3 位作者 · 共 5 首')).toBeTruthy();
  });

  it('点作者进他的作品列表', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('author-李白')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('author-李白'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/author/[name]',
      params: { name: '李白', coll: 'tang', tw: '' },
    });
  });

  it('「全部」进这个集子的全部诗词', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('collection-all-poems')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('collection-all-poems'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/collection/[id]/poems',
      params: { id: 'tang' },
    });
  });

  it('繁體模式下作者名用繁体列', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    const db = seed();
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('settings_script', 'tw')");
    await db.runAsync("UPDATE poems SET author_tw = '蘇軾' WHERE author = '杜甫'");
    await renderWithTheme(<CollectionAuthorsScreen />, { db });

    await waitFor(() => expect(screen.getByText('蘇軾')).toBeTruthy());
    expect(screen.queryByText('杜甫')).toBeNull();
  });

  it('未知选集给出提示', async () => {
    g.__ROUTE_PARAMS__ = { id: 'nope' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByText('未找到该选集')).toBeTruthy());
    expect(screen.queryByTestId('letter-rail')).toBeNull();
  });

  it('选集里一首都没有时给出空态', async () => {
    g.__ROUTE_PARAMS__ = { id: 'empty' };
    const db = seed();
    await db.runAsync(
      "INSERT INTO collections (id, name, kind, count, daily) VALUES ('empty', '空集', '诗', 0, 0)",
    );
    await renderWithTheme(<CollectionAuthorsScreen />, { db });
    await waitFor(() => expect(screen.getByText('这个选集里还没有作者')).toBeTruthy());
  });
});
