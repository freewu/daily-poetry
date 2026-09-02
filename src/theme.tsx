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
import { useColorScheme } from 'react-native';

import { getSetting, setSetting } from '@/lib/db';
import type { ThemeMode } from '@/lib/types';

export interface ThemeColors {
  /** 页面底色（宣纸 / 墨底） */
  bg: string;
  /** 卡片底色 */
  card: string;
  text: string;
  sub: string;
  faint: string;
  line: string;
  accent: string;
  onAccent: string;
  /** 浅色强调底（标签等） */
  soft: string;
  softText: string;
}

export const palettes: Record<'light' | 'dark', ThemeColors> = {
  light: {
    bg: '#F4EDDA',
    card: '#FCF7EA',
    text: '#33291B',
    sub: '#85775C',
    faint: '#B9AA8C',
    line: '#E4D6BC',
    accent: '#A93226',
    onAccent: '#FBF3E0',
    soft: '#F1DED2',
    softText: '#8E2B1F',
  },
  dark: {
    bg: '#181510',
    card: '#221E15',
    text: '#E9DFC7',
    sub: '#A2977C',
    faint: '#6C6250',
    line: '#38301E',
    accent: '#C85A3E',
    onAccent: '#1B120C',
    soft: '#3A2A22',
    softText: '#E39B85',
  },
};

interface ThemeCtxValue {
  mode: ThemeMode;
  theme: 'light' | 'dark';
  colors: ThemeColors;
  setMode: (m: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeCtxValue | null>(null);

export function AppThemeProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const scheme = useColorScheme();
  const system = scheme === 'dark' ? 'dark' : 'light';

  const [mode, setModeState] = useState<ThemeMode>('auto');

  useEffect(() => {
    let alive = true;
    getSetting(db, 'settings_theme')
      .then((v) => {
        if (!alive) return;
        if (v === 'light' || v === 'dark' || v === 'auto') setModeState(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db]);

  const setMode = useCallback(
    (m: ThemeMode) => {
      setModeState(m);
      setSetting(db, 'settings_theme', m).catch(() => {});
    },
    [db],
  );

  const theme = mode === 'auto' ? system : mode;
  const colors = palettes[theme];
  const value = useMemo(
    () => ({ mode, theme, colors, setMode }),
    [mode, theme, colors, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeCtxValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme 必须在 AppThemeProvider 内使用');
  return ctx;
}
