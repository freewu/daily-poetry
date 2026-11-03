import { useSQLiteContext } from 'expo-sqlite';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { getSetting, setSetting } from '@/lib/db';
import { BASE_FONT_SIZE, familyOf, isLayoutKey, scaleOf } from '@/lib/typography';
import type { FontKey, Layout, SizeKey } from '@/lib/types';

interface TypographyCtxValue {
  /** 字族档位 */
  font: FontKey;
  /** 字号档位 */
  size: SizeKey;
  /** 排版：横排 / 竖排 */
  layout: Layout;
  /** 竖排（自右向左逐列） */
  vertical: boolean;
  /** 解析后的 fontFamily，undefined = 系统默认 */
  family: string | undefined;
  /** 字号倍率（1 = 标准） */
  scale: number;
  /** 正文基准字号 × 倍率 */
  bodySize: number;
  setFont: (k: FontKey) => void;
  setSize: (k: SizeKey) => void;
  setLayout: (k: Layout) => void;
}

const TypographyContext = createContext<TypographyCtxValue | null>(null);

/**
 * 正文字体 / 字号 / 排版：持久化到 meta.settings_font、settings_font_size、
 * settings_layout（都在 KEPT_SETTINGS 白名单里，换库不丢）。
 */
export function AppTypographyProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [font, setFontState] = useState<FontKey>('system');
  const [size, setSizeState] = useState<SizeKey>('md');
  const [layout, setLayoutState] = useState<Layout>('horizontal');

  useEffect(() => {
    let alive = true;
    Promise.all([
      getSetting(db, 'settings_font'),
      getSetting(db, 'settings_font_size'),
      getSetting(db, 'settings_layout'),
    ])
      .then(([f, s, l]) => {
        if (!alive) return;
        if (f === 'system' || f === 'song' || f === 'kai') setFontState(f);
        if (s === 'sm' || s === 'md' || s === 'lg' || s === 'xl') setSizeState(s);
        if (isLayoutKey(l)) setLayoutState(l);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db]);

  const setFont = useCallback(
    (k: FontKey) => {
      setFontState(k);
      setSetting(db, 'settings_font', k).catch(() => {});
    },
    [db],
  );

  const setSize = useCallback(
    (k: SizeKey) => {
      setSizeState(k);
      setSetting(db, 'settings_font_size', k).catch(() => {});
    },
    [db],
  );

  const setLayout = useCallback(
    (k: Layout) => {
      setLayoutState(k);
      setSetting(db, 'settings_layout', k).catch(() => {});
    },
    [db],
  );

  const scale = scaleOf(size);
  const value = useMemo(
    () => ({
      font,
      size,
      layout,
      vertical: layout === 'vertical',
      family: familyOf(font),
      scale,
      bodySize: Math.round(BASE_FONT_SIZE * scale),
      setFont,
      setSize,
      setLayout,
    }),
    [font, size, layout, scale, setFont, setSize, setLayout],
  );

  return <TypographyContext.Provider value={value}>{children}</TypographyContext.Provider>;
}

export function useTypography(): TypographyCtxValue {
  const ctx = useContext(TypographyContext);
  if (!ctx) throw new Error('useTypography 必须在 AppTypographyProvider 内使用');
  return ctx;
}
