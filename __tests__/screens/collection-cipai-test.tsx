import { fireEvent, waitFor } from '@testing-library/react-native';

import CipaiPoemsScreen from '@/app/collection/[id]/cipai/[name]';
import CollectionCipaiScreen from '@/app/collection/[id]/cipai';

import { seedStats } from '../helpers/stats';
import { renderWithTheme, screen, seedCollections, seedPoems, useMemoryDb } from '../helpers/test-utils';

const g = globalThis as any;

/** 全宋词：浣溪沙 3 首、水调歌头 2 首、念奴娇 1 首；另有一首《浣溪沙慢》不是同一个词牌 */
function seed() {
  const db = useMemoryDb();
  seedCollections(db, [
    { id: 'tang', name: '唐诗三百首', kind: '诗', count: 1, daily: 1 },
    { id: 'song', name: '全宋词', kind: '词', count: 7, daily: 0 },
  ]);
  seedPoems(db, [
    { id: 1, collection: 'tang', name: '唐诗三百首', title: '静夜思', author: '李白', content: '床前明月光' },
    { id: 10, collection: 'song', name: '全宋词', kind: '词', title: '浣溪沙', author: '晏殊', content: '一曲新词酒一杯' },
    { id: 11, collection: 'song', name: '全宋词', kind: '词', title: '浣溪沙', author: '苏轼', content: '山下兰芽短浸溪' },
    { id: 12, collection: 'song', name: '全宋词', kind: '词', title: '浣溪沙', author: '秦观', content: '漠漠轻寒上小楼' },
    { id: 13, collection: 'song', name: '全宋词', kind: '词', title: '水调歌头', author: '苏轼', content: '明月几时有' },
    { id: 14, collection: 'song', name: '全宋词', kind: '词', title: '水调歌头', author: '辛弃疾', content: '我志在寥阔' },
    { id: 15, collection: 'song', name: '全宋词', kind: '词', title: '念奴娇', author: '苏轼', content: '大江东去' },
    // 名字里带「浣溪沙」但词牌不是它，检索的超集要靠精确比对筛掉
    { id: 16, collection: 'song', name: '全宋词', kind: '词', title: '浣溪沙慢', author: '周邦彦', content: '水竹旧院落' },
  ]);
  seedStats(db);
  return db;
}

describe('<CollectionCipaiScreen />（词牌统计：跟作者统计一个样子）', () => {
  it('按首字母分组，作品多的词牌在前，名字后面跟收录数', async () => {
    g.__ROUTE_PARAMS__ = { id: 'song' };
    await renderWithTheme(<CollectionCipaiScreen />, { db: seed() });

    await waitFor(() => expect(screen.getByText('4 个词牌 · 共 7 首')).toBeTruthy());
    expect(screen.getByTestId('cipai-浣溪沙')).toBeTruthy();
    expect(screen.getByText('3 首')).toBeTruthy();
    // 分组字母：浣 H、念 N、水 S、浣溪沙慢 也是 H
    expect(screen.getByTestId('section-H')).toBeTruthy();
    expect(screen.getByTestId('section-N')).toBeTruthy();
    expect(screen.getByTestId('section-S')).toBeTruthy();
    // 索引条也有（跟作者页同一套）
    expect(screen.getByTestId('letter-rail')).toBeTruthy();
  });

  it('点一个词牌进它的全部作品', async () => {
    g.__ROUTE_PARAMS__ = { id: 'song' };
    await renderWithTheme(<CollectionCipaiScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByTestId('cipai-念奴娇')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('cipai-念奴娇'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith({
      pathname: '/collection/[id]/cipai/[name]',
      params: { id: 'song', name: '念奴娇', tw: '' },
    });
  });

  it('诗集没有词牌，直说没有', async () => {
    g.__ROUTE_PARAMS__ = { id: 'tang' };
    await renderWithTheme(<CollectionCipaiScreen />, { db: seed() });
    await waitFor(() =>
      expect(screen.getByText('这个选集没有词牌（只有词集才有）')).toBeTruthy(),
    );
    expect(screen.getByText('0 个词牌 · 共 1 首')).toBeTruthy();
  });

  it('未知选集给出提示', async () => {
    g.__ROUTE_PARAMS__ = { id: 'nope' };
    await renderWithTheme(<CollectionCipaiScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByText('未找到该选集')).toBeTruthy());
  });
});

describe('<CipaiPoemsScreen />（一个词牌的全部作品）', () => {
  it('只列这个词牌的作品，数量对得上', async () => {
    g.__ROUTE_PARAMS__ = { id: 'song', name: '浣溪沙' };
    await renderWithTheme(<CipaiPoemsScreen />, { db: seed() });

    await waitFor(() => expect(screen.getByText('全宋词 · 共 3 首')).toBeTruthy());
    // PoemRow 把「朝代 · 作者 · 首句」放在同一个 Text 里，用正则匹配首句
    expect(screen.getByText(/一曲新词酒一杯/)).toBeTruthy();
    expect(screen.getByText(/山下兰芽短浸溪/)).toBeTruthy();
    expect(screen.getByText(/漠漠轻寒上小楼/)).toBeTruthy();
    // 《浣溪沙慢》是另一个词牌，不能算进来
    expect(screen.queryByText(/水竹旧院落/)).toBeNull();
    expect(screen.queryByText(/明月几时有/)).toBeNull();
  });

  it('繁体模式下题目用词牌名的繁體', async () => {
    g.__ROUTE_PARAMS__ = { id: 'song', name: '念奴娇', tw: '念奴嬌' };
    const db = seed();
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('settings_script', 'tw')");
    await renderWithTheme(<CipaiPoemsScreen />, { db });

    await waitFor(() => expect(screen.getByText('念奴嬌')).toBeTruthy());
    expect(screen.getByText('全宋词 · 共 1 首')).toBeTruthy();
  });

  it('词牌名对不上时给提示', async () => {
    g.__ROUTE_PARAMS__ = { id: 'song', name: '不存在的词牌' };
    await renderWithTheme(<CipaiPoemsScreen />, { db: seed() });
    await waitFor(() => expect(screen.getByText('这个词牌的作品没找到')).toBeTruthy());
  });
});
