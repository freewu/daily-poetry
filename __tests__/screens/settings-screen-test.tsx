import { fireEvent, waitFor } from '@testing-library/react-native';
import { Alert, StyleSheet, type TextStyle } from 'react-native';

import SettingsScreen from '@/app/(tabs)/settings';

import { asDb, renderWithTheme, screen, seedPoems, useMemoryDb } from '../helpers/test-utils';

const g = globalThis as any;
const HAD_VOICES = g.__SPEECH__.voices;

afterEach(() => {
  // 模拟「没有 TTS 引擎」的用例会把 voices 置空，用完改回来
  g.__SPEECH__.voices = HAD_VOICES;
});

/** 预览正文的样式（PoemLines 传的是数组，flatten 一下好断言） */
function previewStyle(): TextStyle {
  return StyleSheet.flatten(screen.getByTestId('font-preview').props.style) as TextStyle;
}

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

  it('作者间隔默认 7 天，改了会落库', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByText('作者间隔')).toBeTruthy());
    expect(screen.getByText('7 天内不重复同一位作者（默认）')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('gap-30'));
    await waitFor(async () =>
      expect(
        await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_daily_gap'"),
      ).toEqual({ value: '30' }),
    );
    expect(screen.getByText('一个月内不重复同一位作者')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('gap-0'));
    await waitFor(async () =>
      expect(
        await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_daily_gap'"),
      ).toEqual({ value: '0' }),
    );
    expect(screen.getByText('只管每天换一首，不限制作者')).toBeTruthy();
  });

  it('已存的作者间隔会被读出来（脏值退回默认 7 天）', async () => {
    const db = await seed();
    await asDb(db).runAsync(
      "INSERT INTO meta (key, value) VALUES ('settings_daily_gap','14')",
    );
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByText('两周内不重复同一位作者')).toBeTruthy());

    const db2 = await seed();
    await asDb(db2).runAsync(
      "INSERT INTO meta (key, value) VALUES ('settings_daily_gap','whatever')",
    );
    await renderWithTheme(<SettingsScreen />, { db: db2 });
    await waitFor(() => expect(screen.getByText('7 天内不重复同一位作者（默认）')).toBeTruthy());
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
    expect(previewStyle().fontFamily).toBeUndefined();

    await fireEvent.press(screen.getByTestId('font-song'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_font'"))
        .toEqual({ value: 'song' }),
    );
    expect(previewStyle().fontFamily).toBe('serif');
    expect(screen.getByText('衬线体，横细竖粗、起收有顿，接近刻本')).toBeTruthy();
  });

  it('切换排版并落库，预览从横排变竖排', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('layout-vertical')).toBeTruthy());

    // 默认横排：预览是一整段文本
    expect(screen.getByText('床前明月光，\n疑是地上霜。\n举头望明月，\n低头思故乡。')).toBeTruthy();
    expect(screen.queryByTestId('poem-vertical')).toBeNull();

    await fireEvent.press(screen.getByTestId('layout-vertical'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_layout'"))
        .toEqual({ value: 'vertical' }),
    );
    expect(screen.getByText('自右向左竖读，仿古籍版式')).toBeTruthy();
    expect(screen.getByTestId('poem-vertical')).toBeTruthy();
    expect(screen.getByText('床\n前\n明\n月\n光\n，')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('layout-horizontal'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_layout'"))
        .toEqual({ value: 'horizontal' }),
    );
  });

  it('切换字号并落库，预览跟着放大', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('size-xl')).toBeTruthy());
    expect(previewStyle().fontSize).toBe(19);

    await fireEvent.press(screen.getByTestId('size-xl'));
    await waitFor(async () =>
      expect(
        await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_font_size'"),
      ).toEqual({ value: 'xl' }),
    );
    expect(previewStyle().fontSize).toBe(Math.round(19 * 1.3));
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

  it('切换标点并落库，预览只剩句读空白', async () => {
    const db = await seed();
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByTestId('punct-space')).toBeTruthy());

    // 默认保留标点
    expect(screen.getByText('床前明月光，\n疑是地上霜。\n举头望明月，\n低头思故乡。')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('punct-space'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_punct'"))
        .toEqual({ value: 'space' }),
    );
    expect(screen.getByText('标点换成空格，每个标点留一个空位（仅影响显示）')).toBeTruthy();
    expect(screen.getByText('床前明月光\n疑是地上霜\n举头望明月\n低头思故乡')).toBeTruthy();

    await fireEvent.press(screen.getByTestId('punct-keep'));
    await waitFor(async () =>
      expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_punct'"))
        .toEqual({ value: 'keep' }),
    );
    expect(screen.getByText('按语料原文排版，逗号句号都在')).toBeTruthy();
  });

  it('打开设置时读回已存的字体 / 字号 / 语速', async () => {
    const db = await seed();
    await asDb(db).runAsync(
      "INSERT INTO meta (key, value) VALUES ('settings_font','song'), ('settings_font_size','lg'), ('settings_tts_rate','slow')",
    );
    await renderWithTheme(<SettingsScreen />, { db });
    await waitFor(() => expect(screen.getByText('正文字号 24，适合小屏长读')).toBeTruthy());
    expect(screen.getByText('0.7× 语速，一句一句听得清')).toBeTruthy();
    expect(previewStyle().fontFamily).toBe('serif');
  });

  it('系统没有语音合成时整段「朗读」都不显示（语速 / 试听一起收）', async () => {
    g.__SPEECH__.voices = [];
    await renderWithTheme(<SettingsScreen />, { db: await seed() });
    await waitFor(() => expect(screen.getByTestId('theme-dark')).toBeTruthy());

    // 「朗读」标题、语速档位、试听全部不出现
    expect(screen.queryByText('朗读')).toBeNull();
    expect(screen.queryByTestId('rate-normal')).toBeNull();
    expect(screen.queryByTestId('rate-preview')).toBeNull();
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
