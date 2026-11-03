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
import type { Script } from '@/lib/types';

interface ScriptCtxValue {
  script: Script;
  setScript: (s: Script) => void;
}

const ScriptContext = createContext<ScriptCtxValue | null>(null);

/** 简繁切换：选择正文用字，持久化到 meta.settings_script */
export function AppScriptProvider({ children }: { children: ReactNode }) {
  const db = useSQLiteContext();
  const [script, setScriptState] = useState<Script>('cn');

  useEffect(() => {
    let alive = true;
    getSetting(db, 'settings_script')
      .then((v) => {
        if (!alive) return;
        if (v === 'cn' || v === 'tw') setScriptState(v);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db]);

  const setScript = useCallback(
    (s: Script) => {
      setScriptState(s);
      setSetting(db, 'settings_script', s).catch(() => {});
    },
    [db],
  );

  const value = useMemo(() => ({ script, setScript }), [script, setScript]);

  return <ScriptContext.Provider value={value}>{children}</ScriptContext.Provider>;
}

export function useScript(): ScriptCtxValue {
  const ctx = useContext(ScriptContext);
  if (!ctx) throw new Error('useScript 必须在 AppScriptProvider 内使用');
  return ctx;
}
