// 路由骨架：入口重定向、根布局（Splash / SQLiteProvider / 主题）、底栏四个 tab。
//
// 这几层本身没什么逻辑，但名字必须和文件对上（router 按文件名解析），
// 改错了在浏览器里也看不出来，用测试兜住。
import { waitFor } from '@testing-library/react-native';

import RootLayout from '@/app/_layout';
import TabsLayout from '@/app/(tabs)/_layout';
import Index from '@/app/index';

import { setTestDb, useMemoryDb } from '../helpers/memory-db';
import { renderWithTheme, screen } from '../helpers/test-utils';

const g = globalThis as {
  __REDIRECTED_TO__?: string;
  __SPLASH__?: { preventAutoHideAsync: jest.Mock; hideAsync: jest.Mock };
};

describe('入口 index', () => {
  it('重定向到今日', async () => {
    await renderWithTheme(<Index />);
    expect(g.__REDIRECTED_TO__).toBe('/today');
  });
});

describe('根布局', () => {
  it('挂载后隐藏启动图', async () => {
    setTestDb(useMemoryDb());
    await renderWithTheme(<RootLayout />);
    // 布局内部自己包了 AppThemeProvider，外面再套一层不影响结果
    await waitFor(() => expect(g.__SPLASH__?.hideAsync).toHaveBeenCalled());
  });
});

describe('底栏', () => {
  it('四个 tab 都在，顺序为 今日 / 诗词库 / 收藏 / 设置', async () => {
    await renderWithTheme(<TabsLayout />);
    expect(screen.getByTestId('tab-today')).toBeTruthy();
    expect(screen.getByTestId('tab-library')).toBeTruthy();
    expect(screen.getByTestId('tab-favorites')).toBeTruthy();
    expect(screen.getByTestId('tab-settings')).toBeTruthy();
    expect(screen.getByText('今日')).toBeTruthy();
    expect(screen.getByText('诗词库')).toBeTruthy();
    expect(screen.getByText('收藏')).toBeTruthy();
    expect(screen.getByText('设置')).toBeTruthy();
  });
});
