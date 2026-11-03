// 主题 Provider：默认跟随系统、持久化到 settings、scheme 变化即时生效。
//
// 系统的浅色 / 深色由 useColorScheme 决定，这里把它换成可写的全局变量，
// 方便逐条用例切换（jest-expo 已把 Appearance 换成可 mock 的实现，但直接
// 替换 hook 更稳当）。
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: () => (globalThis as { __SCHEME__?: 'light' | 'dark' }).__SCHEME__ ?? 'light',
}));

import { act, fireEvent, render } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { palettes, useTheme } from '@/theme';

import { asDb, renderWithTheme, screen, useMemoryDb } from './helpers/test-utils';

const g = globalThis as { __SCHEME__?: 'light' | 'dark' };

/** 把 Provider 里的状态摊平成可断言的文本 / 按钮 */
function Probe() {
  const { mode, theme, colors, setMode } = useTheme();
  return (
    <>
      <Text testID="probe">{`${mode}/${theme}/${colors.bg}`}</Text>
      <Pressable testID="to-dark" onPress={() => setMode('dark')} />
      <Pressable testID="to-auto" onPress={() => setMode('auto')} />
    </>
  );
}

beforeEach(() => {
  g.__SCHEME__ = 'light';
});

describe('<AppThemeProvider />', () => {
  it('库里没有设置时默认跟随系统', async () => {
    await renderWithTheme(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent(`auto/light/${palettes.light.bg}`);
  });

  it('系统为深色时 auto 取深色调色板', async () => {
    g.__SCHEME__ = 'dark';
    await renderWithTheme(<Probe />);
    expect(screen.getByTestId('probe')).toHaveTextContent(`auto/dark/${palettes.dark.bg}`);
  });

  it('挂载时读取已保存的模式', async () => {
    const db = useMemoryDb();
    await asDb(db).runAsync("INSERT INTO meta (key, value) VALUES ('settings_theme','dark')");
    await renderWithTheme(<Probe />, { db });
    expect(await screen.findByText(`dark/dark/${palettes.dark.bg}`)).toBeTruthy();
  });

  it('setMode 立即生效并写入设置', async () => {
    const db = useMemoryDb();
    await renderWithTheme(<Probe />, { db });

    await fireEvent.press(screen.getByTestId('to-dark'));
    expect(screen.getByTestId('probe')).toHaveTextContent(`dark/dark/${palettes.dark.bg}`);
    expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_theme'"))
      .toEqual({ value: 'dark' });

    // 系统明明是深色，切回 auto 后仍然跟随系统（结果等价，但 mode 变了）
    g.__SCHEME__ = 'dark';
    await act(async () => {
      await fireEvent.press(screen.getByTestId('to-auto'));
    });
    expect(screen.getByTestId('probe')).toHaveTextContent(`auto/dark/${palettes.dark.bg}`);
    expect(await asDb(db).getFirstAsync("SELECT value FROM meta WHERE key = 'settings_theme'"))
      .toEqual({ value: 'auto' });
  });

  it('库里存了非法值时忽略，保持 auto', async () => {
    const db = useMemoryDb();
    await asDb(db).runAsync("INSERT INTO meta (key, value) VALUES ('settings_theme','neon')");
    await renderWithTheme(<Probe />, { db });
    expect(screen.getByTestId('probe')).toHaveTextContent(`auto/light/${palettes.light.bg}`);
  });
});

describe('useTheme', () => {
  it('Provider 外使用会报错', async () => {
    const Bare = () => {
      useTheme();
      return null;
    };
    // RNTL 14 的 render 是异步的（并发渲染），错误以 rejection 形式抛出
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(render(<Bare />)).rejects.toThrow(/AppThemeProvider/);
    } finally {
      spy.mockRestore();
    }
  });
});
