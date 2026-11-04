import { fireEvent, waitFor } from '@testing-library/react-native';
import { SectionList } from 'react-native';

import CollectionAuthorsScreen from '@/app/collection/[id]/authors';

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

  it('右侧索引只放有作者的字母（没有的空档不显示）', async () => {
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

  it('点索引字母真的去滚对应分组（而不是只换个高亮）', async () => {
    // 真机上的滚动靠 SectionList 自己，这里只断言「喂给它的分组下标对不对」
    const scrollTo = jest
      .spyOn(SectionList.prototype, 'scrollToLocation')
      .mockImplementation(() => {});
    try {
      g.__ROUTE_PARAMS__ = { id: 'tang' };
      await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
      await waitFor(() => expect(screen.getByTestId('letter-D')).toBeTruthy());

      // 分组顺序 D / L / #：点 # 应该去第 2 段（数组下标从 0 起）
      await fireEvent.press(screen.getByTestId('letter-#'));
      expect(scrollTo).toHaveBeenCalledWith({
        sectionIndex: 2,
        itemIndex: 0,
        viewPosition: 0,
        animated: true,
      });
      // 摘要还在，说明页面没被滚动异常带崩
      expect(screen.getByText('3 位作者 · 共 5 首')).toBeTruthy();
    } finally {
      scrollTo.mockRestore();
    }
  });

  it('跳不过去时不会把页面带崩（虚拟列表还没量好尺寸）', async () => {
    const scrollTo = jest
      .spyOn(SectionList.prototype, 'scrollToLocation')
      .mockImplementation(() => {
        throw new Error('scrollToIndex out of range');
      });
    try {
      g.__ROUTE_PARAMS__ = { id: 'tang' };
      await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
      await waitFor(() => expect(screen.getByTestId('letter-L')).toBeTruthy());
      await fireEvent.press(screen.getByTestId('letter-L'));
      expect(screen.getByText('3 位作者 · 共 5 首')).toBeTruthy();
    } finally {
      scrollTo.mockRestore();
    }
  });

  it('给 SectionList 喂了精确的 getItemLayout（跳转才不靠「平均行高」猜）', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
    const list = await waitFor(() => screen.getByTestId('author-list'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const layout = (list.props as any).getItemLayout as (
      data: unknown,
      index: number,
    ) => { index: number; length: number; offset: number };
    expect(typeof layout).toBe('function');

    // 三段（D / L / #），每段 = 标题 + 1 行 + 空尾部
    const head = layout(null, 0);
    const row = layout(null, 1);
    const foot = layout(null, 2);
    expect(head.length).toBeGreaterThan(0);
    expect(row.offset).toBe(head.offset + head.length);
    expect(foot.length).toBe(0);
    expect(foot.offset).toBe(row.offset + row.length);

    // 下一段（L）的标题紧接上一段的尾部，中间不留误差
    expect(layout(null, 3)).toMatchObject({ offset: foot.offset, length: head.length });
    // 最后一段（#）的标题：两段的「标题 + 1 行」
    expect(layout(null, 6).offset).toBe(2 * (head.length + row.length));
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

  it('「全部诗词」回到集子的诗词列表', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionAuthorsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('collection-all-poems')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('collection-all-poems'));
    // 一般是原路返回（列表页 → 作者页）；测试的 router 恒返回 canGoBack() = true
    expect(g.__ROUTER__.back).toHaveBeenCalled();
    expect(g.__ROUTER__.push).not.toHaveBeenCalled();
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
