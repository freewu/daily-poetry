import { fireEvent, waitFor } from '@testing-library/react-native';

import CollectionPoemsScreen from '@/app/collection/[id]';
import PoemScreen from '@/app/poem/[id]';

import { renderWithTheme, screen, seedCollections, seedPoems, useMemoryDb } from '../helpers/test-utils';

const g = globalThis as any;

function seed() {
  const db = useMemoryDb();
  seedCollections(db, [
    { id: 'tang', name: '唐诗三百首', kind: '诗', count: 2, daily: 1 },
    { id: 'song', name: '全宋词', kind: '词', count: 2, daily: 0 },
  ]);
  seedPoems(db, [
    { id: 1, collection: 'tang', name: '唐诗三百首', title: '静夜思', author: '李白', content: '床前明月光' },
    { id: 2, collection: 'tang', name: '唐诗三百首', title: '春晓', author: '孟浩然', content: '春眠不觉晓' },
    { id: 3, collection: 'song', name: '全宋词', kind: '词', title: '水调歌头', author: '苏轼', content: '明月几时有' },
    { id: 4, collection: 'song', name: '全宋词', kind: '词', title: '念奴娇', author: '苏轼', content: '大江东去' },
  ]);
  return db;
}

describe('<PoemScreen />', () => {
  it('按 id 展示诗词，并把可复制 / 可收藏的操作栏带出来', async () => {
    g.__ROUTE_PARAMS__ = { id: '2' };
    await renderWithTheme(<PoemScreen />, { db: seed() });

    await waitFor(() => expect(screen.getByText('春晓')).toBeTruthy());
    expect(screen.getByText('唐 · 孟浩然')).toBeTruthy();
    expect(screen.getByText('选自《唐诗三百首》')).toBeTruthy();
    expect(screen.getByTestId('act-favorite')).toBeTruthy();
    expect(screen.getByTestId('act-speak')).toBeTruthy();
    expect(screen.getByTestId('act-copy')).toBeTruthy();
  });

  it('id 不存在时给出提示', async () => {
    g.__ROUTE_PARAMS__ = { id: '999' };
    await renderWithTheme(<PoemScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByText('未找到这首诗词')).toBeTruthy());
    expect(screen.queryByTestId('act-favorite')).toBeNull();
  });

  it('带 date 参数进入「每日一诗」模式，可前后翻日', async () => {
    g.__ROUTE_PARAMS__ = { date: '2024-09-17' };
    await renderWithTheme(<PoemScreen />, { db: seed() });

    await waitFor(() => expect(screen.getByText('2024-09-17 · 每日一诗')).toBeTruthy());
    expect(screen.getByText('前一天')).toBeTruthy();

    await fireEvent.press(screen.getByText('前一天'));
    await waitFor(() => expect(screen.getByText('2024-09-16 · 每日一诗')).toBeTruthy());
  });

  it('返回按钮走 router.back()', async () => {
    g.__ROUTE_PARAMS__ = { id: '1' };
    await renderWithTheme(<PoemScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('screen-back')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('screen-back'));
    expect(g.__ROUTER__.back).toHaveBeenCalled();
  });
});

describe('<CollectionPoemsScreen />（集子的落点：全部诗词）', () => {
  it('列出该选集的全部诗词与数量', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionPoemsScreen />, { db: seed() });

    await waitFor(() => expect(screen.getByText('唐诗三百首')).toBeTruthy());
    expect(screen.getByText('诗 · 共 2 首')).toBeTruthy();
    expect(screen.getByText('静夜思')).toBeTruthy();
    expect(screen.getByText('春晓')).toBeTruthy();
    expect(screen.queryByText('水调歌头')).toBeNull();
  });

  it('右上「按作者」进作者统计', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionPoemsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('collection-authors-link')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('collection-authors-link'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/collection/[id]/authors',
      params: { id: 'tang' },
    });
  });

  it('诗集只有「按作者」，没有「按词牌」', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionPoemsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByText('诗 · 共 2 首')).toBeTruthy());
    expect(screen.getByTestId('collection-authors-link')).toBeTruthy();
    expect(screen.queryByTestId('collection-cipai-link')).toBeNull();
  });

  it('词集多一个「按词牌」入口，进词牌统计', async () => {
    g.__ROUTE_PARAMS__ = { id: 'song' };
    await renderWithTheme(<CollectionPoemsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('collection-cipai-link')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('collection-cipai-link'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/collection/[id]/cipai',
      params: { id: 'song' },
    });
  });

  it('未知选集给出提示', async () => {
    g.__ROUTE_PARAMS__ = { id: 'nope' };
    await renderWithTheme(<CollectionPoemsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByText('未找到该选集')).toBeTruthy());
  });
});
