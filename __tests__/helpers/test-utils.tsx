// 组件测试的公共入口：注入内存库 + 套上主题 / 简繁 / 字体字号三个 Provider。
//
// 这些 Provider 都会从库里读设置（settings_theme / settings_script /
// settings_font / settings_font_size），所以必须先 setTestDb()。
// RNTL 14 起 render / fireEvent / unmount 都是异步的，用例里记得 await。
import { render, screen, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { AppScriptProvider } from '@/script';
import { AppThemeProvider } from '@/theme';
import { AppTypographyProvider } from '@/typography';

import { setTestDb, useMemoryDb, type TestDb } from './memory-db';

export * from './memory-db';
export { screen };

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AppScriptProvider>
      <AppTypographyProvider>
        <AppThemeProvider>{children}</AppThemeProvider>
      </AppTypographyProvider>
    </AppScriptProvider>
  );
}

/** 用给定的内存库渲染组件（不传就新建一个空库） */
export async function renderWithTheme(
  ui: ReactElement,
  options?: RenderOptions & { db?: TestDb },
) {
  const { db: provided, ...renderOptions } = options ?? {};
  const db = provided ?? useMemoryDb();
  setTestDb(db);
  const view = await render(ui, { wrapper: Wrapper, ...renderOptions });
  return { db, ...view };
}
