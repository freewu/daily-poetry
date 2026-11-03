import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import SettingsScreen from '@/app/(tabs)/settings';

import { asDb, renderWithTheme, screen, seedPoems, useMemoryDb } from '../helpers/test-utils';

const g = globalThis as any;

async function seed() {
  const db = useMemoryDb();
  seedPoems(db, [
    { id: 1, title: '静夜思', content: '床前明月光' },
    { id: 2, title: '春晓', content: '春眠不觉晓' },
    { id: 3, title: '登鹳雀楼', content: '白日依山尽' },
  ]);
  await asDb(db).runAsync("INSERT INTO favorites (poem_id) VALUES (1), (2)");
  await asDb(db).runAsync("INSERT INTO history (date, poem_id) VALUES ('2024-09-17', 1)");
  await asDb(db).runAsync("INSERT INTO meta (key, value) VALUES ('dataset','standard')");
  await asDb(db).runAsync("INSERT INTO meta (key, value) VALUES ('poem_count','1396')");
  return db;
}

describe('<SettingsScreen />', () => {
  it('显示收藏数、读诗天数与语料信息', async () => {
    await renderWithTheme(<SettingsScreen />, { db: await seed() });
    await waitFor(() => expect(screen.getByText('2 首')).toBeTruthy());
    expect(screen.getByText('1 天')).toBeTruthy();
    expect(screen.getByText('诗歌词曲全库')).toBeTruthy();
    expect(screen.getByText('1396 首')).toBeTruthy();
    expect(screen.getByText(/每日诗词 v/)).toBeTruthy();
  });

  it('切换推送偏好并落库', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByText('经典轮换')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('push-occasion'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_push'"))
        .toEqual({ value: 'occasion' }),
    );
    expect(screen.getByText('恰逢节日 / 节气当天，先推应景之作')).toBeTruthy();
  });

  it('切换正文字体并落库', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('script-tw')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('script-tw'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_script'"))
        .toEqual({ value: 'tw' }),
    );
    expect(screen.getByText('正文用傳統繁體（保留語料原文）')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('script-cn'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_script'"))
        .toEqual({ value: 'cn' }),
    );
  });

  it('切换字体并落库，预览跟着换字族', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('font-song')).toBeTruthy());

    // 默认系统字体：预览不带 fontFamily
    expect(screen.getByTestId('font-preview').props.children.props.style.fontFamily).toBeUndefined();

    await fireEvent.press(screen.getByTestId('font-song'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_font'"))
        .toEqual({ value: 'song' }),
    );
    expect(screen.getByTestId('font-preview').props.children.props.style.fontFamily).toBe('serif');
    expect(screen.getByText('衬线体，横细竖粗、起收有顿，接近刻本')).toBeTruthy();
  });

  it('切换字号并落库，预览跟着放大', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('size-xl')).toBeTruthy());
    expect(screen.getByTestId('font-preview').props.children.props.style.fontSize).toBe(19);

    await fireEvent.press(screen.getByTestId('size-xl'));
    await waitFor(async () =>
      expect(
        await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_font_size'"),
      ).toEqual({ value: 'xl' }),
    );
    expect(screen.getByTestId('font-preview').props.children.props.style.fontSize).toBe(
      Math.round(19 * 1.3),
    );
    expect(screen.getByText('正文字号 27，适合长辈阅读')).toBeTruthy();
  });

  it('切换朗读语速并落库，「试听」用新语速朗读', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('rate-fast')).toBeTruthy());

    await fireEvent.press(screen.getByTestId('rate-fast'));
    await waitFor(async () =>
      expect(
        await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_tts_rate'"),
      ).toEqual({ value: 'fast' }),
    );
    expect(screen.getByText('1.2× 语速，赶时间用')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('rate-preview'));
    expect(g.__SPEECH__.speak).toHaveBeenCalledWith(
      '床前明月光，疑是地上霜。',
      expect.objectContaining({ language: 'zh-CN', rate: 1.2 }),
    );
  });

  it('打开设置时读回已存的字体 / 字号 / 语速', async () => {
    const db = await seed();
    await asDb(db).runAsync(
      "INSERT INTO meta (key, value) VALUES ('settings_font','song'), ('settings_font_size','lg'), ('settings_tts_rate','slow')",
    );
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByText('正文字号 24，适合小屏长读')).toBeTruthy());
    expect(screen.getByText('0.7× 语速，一句一句听得清')).toBeTruthy();
    expect(screen.getByTestId('font-preview').props.children.props.style.fontFamily).toBe('serif');
  });

  it('切换主题并落库', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });

    await fireEvent.press(screen.getByTestId('theme-dark'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_theme'"))
        .toEqual({ value: 'dark' }),
    );

    await fireEvent.press(screen.getByTestId('theme-light'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_theme'"))
        .toEqual({ value: 'light' }),
    );
  });

  it('点「收藏的诗词」进收藏页', async () => {
    await renderWithTheme(<SettingsScreen />, { db: await seed() });
    await waitFor(() => expect(screen.getByTestId('settings-favorites')).toBeTruthy());
    await fireEvent.press(screen.getByTestId('settings-favorites'));
    expect(g.__ROUTER__.push).toHaveBeenCalledWith('/favorites');
  });

  it('清空收藏需要二次确认，确认后收藏数与列表一起清空', async () => {
    const db = await seed();
    const alertSpy = jest
      .spyOn(Alert, 'alert')
      .mockImplementation((_title, _msg, buttons) => {
        // 模拟用户点「清空」（destructive 那一项）
        buttons?.find((b) => b.style === 'destructive')?.onPress?.();
      });

    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByText('2 首')).toBeTruthy());

    await fireEvent.press(screen.getByText('清空收藏'));
    expect(alertSpy).toHaveBeenCalled();

    await waitFor(() => expect(screen.getByText('暂无')).toBeTruthy());
    expect(db.raw.prepare('SELECT COUNT(*) n FROM favorites').get()).toEqual({ n: 0 });
    alertSpy.mockRestore();
  });
});
