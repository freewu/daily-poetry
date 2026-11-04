import { act, fireEvent, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import CardScreen from '@/app/card/[id]';

import { asDb, renderWithTheme, screen, seedPoems, useMemoryDb } from '../helpers/test-utils';

// 路由参数由用例控制，截图与相册都是原生能力，这里 mock 掉只看编排
let mockParams: { id?: string; date?: string } = { id: '1' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({
    push: jest.fn(),
    back: jest.fn(),
    replace: jest.fn(),
    canGoBack: () => true,
  }),
}));
jest.mock('react-native-view-shot', () => ({ captureRef: jest.fn() }));
jest.mock('expo-media-library', () => ({
  Album: { get: jest.fn(), create: jest.fn() },
  Asset: { create: jest.fn() },
  requestPermissionsAsync: jest.fn(),
}));

const g = globalThis as any;
const mockShot = jest.requireMock('react-native-view-shot') as { captureRef: jest.Mock };
const mockMl = jest.requireMock('expo-media-library') as {
  Album: { get: jest.Mock; create: jest.Mock };
  Asset: { create: jest.Mock };
  requestPermissionsAsync: jest.Mock;
};

function seeded() {
  const db = useMemoryDb();
  seedPoems(db, [
    {
      id: 1,
      title: '静夜思',
      content: '床前明月光，疑是地上霜。',
      title_tw: '靜夜思',
      content_tw: '床前明月光，疑是地上霜。',
    },
  ]);
  return db;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: '1' };
  mockShot.captureRef.mockResolvedValue('file:///cache/card.png');
  mockMl.Album.get.mockResolvedValue({ id: 'album' });
  mockMl.Asset.create.mockResolvedValue({ id: 'asset' });
  mockMl.requestPermissionsAsync.mockResolvedValue({ granted: true, status: 'granted' });
});

describe('<CardScreen />', () => {
  it('按 id 取诗，排成卡片', async () => {
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByTestId('share-card')).toBeTruthy());
    expect(screen.getByText('静夜思')).toBeTruthy();
    expect(screen.getByTestId('card-save')).toBeTruthy();
  });

  it('点「保存并分享」：截图 → 存相册 → 弹系统分享面板', async () => {
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByTestId('card-save')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('card-save'));

    await waitFor(() => expect(screen.getByTestId('card-result')).toBeTruthy());
    expect(screen.getByText('已保存到相册「每日诗词」')).toBeTruthy();
    expect(mockShot.captureRef).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ format: 'png', result: 'tmpfile', fileName: '每日一诗-静夜思' }),
    );
    expect(mockMl.Asset.create).toHaveBeenCalledWith('file:///cache/card.png', { id: 'album' });
    expect(g.__SHARING__.shareAsync).toHaveBeenCalledWith(
      'file:///cache/card.png',
      expect.objectContaining({ mimeType: 'image/png', dialogTitle: '每日一诗-静夜思' }),
    );
  });

  it('设备没有分享能力时只存相册，不弹面板', async () => {
    g.__SHARING__.isAvailableAsync.mockResolvedValueOnce(false);
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByTestId('card-save')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('card-save'));

    await waitFor(() => expect(screen.getByText('已保存到相册「每日诗词」')).toBeTruthy());
    expect(mockMl.Asset.create).toHaveBeenCalled();
    expect(g.__SHARING__.shareAsync).not.toHaveBeenCalled();
  });

  it('带 date 参数时文件名带日期、卡片印日期戳', async () => {
    mockParams = { id: '1', date: '2026-11-03' };
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByTestId('card-save')).toBeTruthy());
    expect(screen.getByText('每日一诗 · 2026年11月3日')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('card-save'));
    await waitFor(() =>
      expect(mockShot.captureRef).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ fileName: '每日一诗-静夜思-20261103' }),
      ),
    );
  });

  it('没有相册权限时给提示', async () => {
    mockMl.Asset.create.mockRejectedValue(new Error('no permission'));
    mockMl.requestPermissionsAsync.mockResolvedValue({ granted: false, status: 'denied' });
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByTestId('card-save')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('card-save'));

    await waitFor(() => expect(screen.getByTestId('card-result')).toBeTruthy());
    expect(screen.getByText('没有相册权限，去系统设置里允许后再试')).toBeTruthy();
    // 没存成，自然也不该分享
    expect(g.__SHARING__.shareAsync).not.toHaveBeenCalled();
  });

  it('截图失败时给提示，不会崩', async () => {
    mockShot.captureRef.mockRejectedValue(new Error('boom'));
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByTestId('card-save')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('card-save'));

    await waitFor(() => expect(screen.getByTestId('card-result')).toBeTruthy());
    expect(screen.getByText('保存失败，请再试一次')).toBeTruthy();
    expect(mockMl.Asset.create).not.toHaveBeenCalled();
  });

  it('卡片下方有字号滑块 / 用字 / 标点三个开关', async () => {
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByTestId('card-size')).toBeTruthy());
    expect(screen.getByTestId('card-script-cn')).toBeTruthy();
    expect(screen.getByTestId('card-script-tw')).toBeTruthy();
    expect(screen.getByTestId('card-punct-keep')).toBeTruthy();
    expect(screen.getByTestId('card-punct-space')).toBeTruthy();
  });

  it('拖字号滑块，卡片正文跟着变（不动阅读设置）', async () => {
    const db = seeded();
    await renderWithTheme(<CardScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('share-card')).toBeTruthy());

    await act(async () => {
      screen.getByTestId('card-size').props.onValueChange(26);
    });
    const body = () =>
      StyleSheet.flatten(screen.getByText('床前明月光，疑是地上霜。').props.style) as {
        fontSize?: number;
      };
    expect(body().fontSize).toBe(26);

    // 卡片页没有「松手才落库」这回事（压根不存），onSlidingComplete 只是兜底
    await act(async () => {
      screen.getByTestId('card-size').props.onSlidingComplete(31);
    });
    expect(body().fontSize).toBe(31);
    // 只影响这一张卡片，阅读设置原样
    expect(
      await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_font_size'"),
    ).toBeNull();
  });

  it('选「繁」用繁體，选「简」回简体（不改设置）', async () => {
    const db = seeded();
    await renderWithTheme(<CardScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('card-script-tw')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('card-script-tw'));
    await waitFor(() => expect(screen.getByText('靜夜思')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('card-script-cn'));
    await waitFor(() => expect(screen.getByText('静夜思')).toBeTruthy());
    expect(
      await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_script'"),
    ).toBeNull();
  });

  it('选「空」把标点换成空位，选「符」还原', async () => {
    const db = seeded();
    await renderWithTheme(<CardScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('card-punct-space')).toBeTruthy());
    expect(screen.getByText('床前明月光，疑是地上霜。')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('card-punct-space'));
    await waitFor(() => expect(screen.getByText('床前明月光 疑是地上霜')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('card-punct-keep'));
    await waitFor(() => expect(screen.getByText('床前明月光，疑是地上霜。')).toBeTruthy());
    expect(
      await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_punct'"),
    ).toBeNull();
  });

  it('没动过开关时，简繁 / 标点跟阅读设置走', async () => {
    const db = seeded();
    await asDb(db).runAsync(
      "INSERT INTO meta (key, value) VALUES ('settings_script','tw'), ('settings_punct','space')",
    );
    await renderWithTheme(<CardScreen />, { db });
    await waitFor(() => expect(screen.getByText('靜夜思')).toBeTruthy());
    expect(screen.getByText('床前明月光 疑是地上霜')).toBeTruthy();
  });

  it('id 查不到时给空态', async () => {
    mockParams = { id: '999' };
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByText('未找到这首诗词')).toBeTruthy());
    expect(screen.queryByTestId('card-save')).toBeNull();
  });
});
