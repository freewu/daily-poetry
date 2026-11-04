// 卡片文件名 / 日期戳 / 存相册的编排逻辑。
// 相册那一层是原生模块，这里整体 mock 掉，只验「权限什么时候要、要几次」。
jest.mock('expo-media-library', () => ({
  Album: { get: jest.fn(), create: jest.fn() },
  Asset: { create: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}));
// 截图临时文件 → 干净文件名的那次复制
jest.mock('expo-file-system', () => {
  class MockFile {
    uri: string;
    exists = false;
    constructor(...parts: unknown[]) {
      this.uri = `file:///cache/${parts.map(String).join('/')}`;
    }
    delete() {}
    copy(dest: MockFile) {
      this.uri = dest.uri;
      return Promise.resolve();
    }
  }
  return { File: MockFile, Paths: { cache: 'file:///cache' } };
});

import { cardFileName, cardStamp, CARD_ALBUM } from '@/lib/card';
import { saveImageToLibrary, shareImage } from '@/lib/card-save';

// 工厂在 require 时才跑，所以 mock 里拿不到外面定义的常量，取出来用
const g = globalThis as any;
const mockMl = jest.requireMock('expo-media-library') as {
  Album: { get: jest.Mock; create: jest.Mock };
  Asset: { create: jest.Mock };
  requestPermissionsAsync: jest.Mock;
};

const granted = { granted: true, status: 'granted' };
const denied = { granted: false, status: 'denied' };
const album = { id: 'album-1' };

beforeEach(() => {
  jest.clearAllMocks();
  mockMl.Album.get.mockResolvedValue(album);
  mockMl.Asset.create.mockResolvedValue({ id: 'asset-1' });
  mockMl.requestPermissionsAsync.mockResolvedValue(granted);
});

describe('cardStamp', () => {
  it('把 YYYY-MM-DD 排成中文日期（月份不补零）', () => {
    expect(cardStamp('2026-11-03')).toBe('2026年11月3日');
    expect(cardStamp('2026-01-20')).toBe('2026年1月20日');
  });

  it('没传或格式不对就是空串', () => {
    expect(cardStamp()).toBe('');
    expect(cardStamp(null)).toBe('');
    expect(cardStamp('2026-1-3')).toBe('');
  });
});

describe('cardFileName', () => {
  it('题目 + 日期拼成相册里看到的名字', () => {
    expect(cardFileName({ id: 1, title: '静夜思', name: '唐诗三百首' }, '2026-11-03')).toBe(
      '每日一诗-静夜思-20261103',
    );
  });

  it('去掉空白和路径非法字符，没题目就退回 id', () => {
    expect(cardFileName({ id: 7, title: ' 春 晓/其一 ', name: '' })).toBe('每日一诗-春晓其一');
    expect(cardFileName({ id: 7, title: '', name: '' })).toBe('每日一诗-poem-7');
  });

  it('超长题目截到 24 字', () => {
    const long = '甲'.repeat(40);
    expect(cardFileName({ id: 1, title: long, name: '' })).toBe(`每日一诗-${'甲'.repeat(24)}`);
  });
});

describe('saveImageToLibrary', () => {
  const uri = 'file:///cache/card.png';
  const name = '每日一诗-静夜思';
  // 复制到缓存后拿到的新路径（mock 出来的 File 把「目录 + 文件名」拼起来）
  const clean = 'file:///cache/file:///cache/每日一诗-静夜思.png';

  it('有相册就直接存进去，文件名换成干净的', async () => {
    expect(await saveImageToLibrary(uri, { name })).toBe('saved');
    expect(mockMl.Asset.create).toHaveBeenCalledWith(clean, album);
    expect(mockMl.requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it('相册不存在时带着这张图一起建（空相册建不出来）', async () => {
    mockMl.Album.get.mockResolvedValue(null);
    mockMl.Album.create.mockResolvedValue(album);
    expect(await saveImageToLibrary(uri, { name })).toBe('saved');
    expect(mockMl.Album.create).toHaveBeenCalledWith(CARD_ALBUM, [clean]);
    expect(mockMl.Asset.create).not.toHaveBeenCalled();
  });

  it('建相册失败也把图存下来（退回默认目录）', async () => {
    mockMl.Album.get.mockResolvedValue(null);
    mockMl.Album.create.mockRejectedValue(new Error('nope'));
    expect(await saveImageToLibrary(uri, { name })).toBe('saved');
    expect(mockMl.Asset.create).toHaveBeenCalledWith(clean);
  });

  it('相册取不到也不挡着存', async () => {
    mockMl.Album.get.mockRejectedValue(new Error('nope'));
    expect(await saveImageToLibrary(uri, { name })).toBe('saved');
    expect(mockMl.Album.create).toHaveBeenCalledWith(CARD_ALBUM, [clean]);
  });

  it('第一次写失败 → 要权限 → 再写一次', async () => {
    mockMl.Asset.create
      .mockRejectedValueOnce(new Error('no permission'))
      .mockResolvedValue({ id: 'a' });
    expect(await saveImageToLibrary(uri, { name })).toBe('saved');
    expect(mockMl.requestPermissionsAsync).toHaveBeenCalledWith(true);
    expect(mockMl.Asset.create).toHaveBeenCalledTimes(2);
  });

  it('要了权限还是被拒 → denied', async () => {
    mockMl.Asset.create.mockRejectedValue(new Error('no permission'));
    mockMl.requestPermissionsAsync.mockResolvedValue(denied);
    expect(await saveImageToLibrary(uri, { name })).toBe('denied');
  });

  it('askFirst（iOS）：先授权再写，只写一次', async () => {
    expect(await saveImageToLibrary(uri, { askFirst: true, name })).toBe('saved');
    expect(mockMl.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(mockMl.Asset.create).toHaveBeenCalledTimes(1);
  });

  it('askFirst 时权限被拒 → 不尝试写', async () => {
    mockMl.requestPermissionsAsync.mockResolvedValue(denied);
    expect(await saveImageToLibrary(uri, { askFirst: true, name })).toBe('denied');
    expect(mockMl.Asset.create).not.toHaveBeenCalled();
  });

  it('askFirst 时写失败 → failed（不再重复要权限）', async () => {
    mockMl.Asset.create.mockRejectedValue(new Error('boom'));
    expect(await saveImageToLibrary(uri, { askFirst: true, name })).toBe('failed');
    expect(mockMl.requestPermissionsAsync).toHaveBeenCalledTimes(1);
  });
});

describe('shareImage', () => {
  const uri = 'file:///cache/每日一诗-静夜思.png';

  it('能分享时交给系统面板，PNG + 中文标题', async () => {
    expect(await shareImage(uri, { title: '每日一诗-静夜思' })).toBe(true);
    expect(g.__SHARING__.shareAsync).toHaveBeenCalledWith(uri, {
      mimeType: 'image/png',
      UTI: 'public.png',
      dialogTitle: '每日一诗-静夜思',
    });
  });

  it('没传标题就用默认的分享面板标题', async () => {
    await shareImage(uri);
    expect(g.__SHARING__.shareAsync).toHaveBeenCalledWith(
      uri,
      expect.objectContaining({ dialogTitle: '分享诗词卡片' }),
    );
  });

  it('设备不支持分享（web / 没有可分享的 App）→ false，不调面板', async () => {
    g.__SHARING__.isAvailableAsync.mockResolvedValueOnce(false);
    expect(await shareImage(uri)).toBe(false);
    expect(g.__SHARING__.shareAsync).not.toHaveBeenCalled();
  });

  it('分享面板报错也不抛（相册里已经存好了）', async () => {
    g.__SHARING__.shareAsync.mockRejectedValueOnce(new Error('nope'));
    expect(await shareImage(uri)).toBe(false);
  });
});
