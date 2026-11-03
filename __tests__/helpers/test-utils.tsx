// 组件测试的公共入口：注入内存库 + 套上纸墨主题 / 简繁两个 Provider。
//
// 两个 Provider 都会从库里读设置（settings_theme / settings_script），
// 所以必须先 setTestDb()。
// RNTL 14 起 render / fireEvent / unmount 都是异步的，用例里记得 await。
import { render, screen, type RenderOptions } from '@testing-library/react-native';
import type { ReactElement, ReactNode } from 'react';

import { AppScriptProvider } from '@/script';
import { AppThemeProvider } from '@/theme';

import { setTestDb, useMemoryDb, type TestDb } from './memory-db';

export * from './memory-db';
export { screen };

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <AppScriptProvider>
      <AppThemeProvider>{children}</AppThemeProvider>
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
