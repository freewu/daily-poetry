import { fireEvent, waitFor } from '@testing-library/react-native';

import CardScreen from '@/app/card/[id]';

import { renderWithTheme, screen, seedPoems, useMemoryDb } from '../helpers/test-utils';

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

const mockShot = jest.requireMock('react-native-view-shot') as { captureRef: jest.Mock };
const mockMl = jest.requireMock('expo-media-library') as {
  Album: { get: jest.Mock; create: jest.Mock };
  Asset: { create: jest.Mock };
  requestPermissionsAsync: jest.Mock;
};

function seeded() {
  const db = useMemoryDb();
  seedPoems(db, [{ id: 1, title: '静夜思', content: '床前明月光\n疑是地上霜' }]);
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

  it('点「保存到相册」：截图 → 存相册 → 提示已保存', async () => {
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

  it('id 查不到时给空态', async () => {
    mockParams = { id: '999' };
    await renderWithTheme(<CardScreen />, { db: seeded() });
    await waitFor(() => expect(screen.getByText('未找到这首诗词')).toBeTruthy());
    expect(screen.queryByTestId('card-save')).toBeNull();
  });
});
