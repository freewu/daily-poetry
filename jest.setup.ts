// 全局测试桩：把只能在设备上跑的原生模块换成可断言的内存实现。
//
// 每个用例通过 globalThis.__DB__ 注入一个内存数据库（见
// __tests__/helpers/memory-db.ts），组件里的 useSQLiteContext() 就能拿到它。

/* eslint-disable @typescript-eslint/no-explicit-any */

const g = globalThis as any;

// ---------------------------------------------------------------- expo-sqlite
jest.mock('expo-sqlite', () => ({
  useSQLiteContext: () => {
    if (!(globalThis as any).__DB__) {
      throw new Error('测试里请先调用 useMemoryDb() / setTestDb() 注入数据库');
    }
    return (globalThis as any).__DB__;
  },
  SQLiteProvider: ({ children }: any) => children,
  openDatabaseAsync: jest.fn(),
  openDatabaseSync: jest.fn(),
}));

// ---------------------------------------------------------------- expo-router
const router = {
  push: jest.fn(),
  replace: jest.fn(),
  back: jest.fn(),
  canGoBack: () => true,
  dismiss: jest.fn(),
  navigate: jest.fn(),
  setParams: jest.fn(),
};
g.__ROUTER__ = router;
g.__ROUTE_PARAMS__ = {};

jest.mock('expo-router', () => ({
  useRouter: () => (globalThis as any).__ROUTER__,
  useFocusEffect: (effect: () => void | (() => void)) => {
    // 屏幕用 useFocusEffect 拉数据；测试里退化成一次 mount 时执行
    const React = require('react');
    React.useEffect(() => effect(), [effect]);
  },
  useLocalSearchParams: () => (globalThis as any).__ROUTE_PARAMS__,
  Redirect: ({ href }: any) => {
    (globalThis as any).__REDIRECTED_TO__ = href;
    return null;
  },
  Stack: ({ children }: any) => children ?? null,
}));

// ---------------------------------------------------------------- expo-speech
const speech = {
  speak: jest.fn(),
  stop: jest.fn(),
  isSpeakingAsync: jest.fn(async () => false),
};
g.__SPEECH__ = speech;
jest.mock('expo-speech', () => ({
  speak: (...args: any[]) => (globalThis as any).__SPEECH__.speak(...args),
  stop: () => (globalThis as any).__SPEECH__.stop(),
  isSpeakingAsync: () => (globalThis as any).__SPEECH__.isSpeakingAsync(),
}));

// ---------------------------------------------------------------- expo-clipboard
const clipboard = { setStringAsync: jest.fn(async () => true) };
g.__CLIPBOARD__ = clipboard;
jest.mock('expo-clipboard', () => ({
  setStringAsync: (text: string) => (globalThis as any).__CLIPBOARD__.setStringAsync(text),
  getStringAsync: jest.fn(async () => ''),
}));

// ---------------------------------------------------------------- theme / 布局
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  const React = require('react');
  return {
    SafeAreaProvider: ({ children }: any) => children,
    SafeAreaConsumer: ({ children }: any) => children(inset),
    SafeAreaView: ({ children }: any) => children,
    useSafeAreaInsets: () => inset,
    useSafeAreaFrame: () => ({ x: 0, y: 0, width: 390, height: 844 }),
    initialWindowMetrics: { insets: inset, frame: { x: 0, y: 0, width: 390, height: 844 } },
    SafeAreaInsetsContext: React.createContext(inset),
  };
});

beforeEach(() => {
  g.__ROUTER__.push.mockClear();
  g.__ROUTER__.replace.mockClear();
  g.__ROUTER__.back.mockClear();
  g.__ROUTE_PARAMS__ = {};
  g.__SPEECH__.speak.mockClear();
  g.__SPEECH__.stop.mockClear();
  g.__CLIPBOARD__.setStringAsync.mockClear();
});
