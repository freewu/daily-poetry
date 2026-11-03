// Jest 配置：jest-expo 预设（Android 平台）+ 与 tsconfig 对齐的路径别名。
//
//   npm test              # 全量单元 / 组件测试
//   npm test -- --watch   # 监听
//   npm run test:coverage # 覆盖率（coverage/lcov.info）
//
// 说明：jest-expo 的 android 预设会把 Platform.OS 固定为 android 并 mock
// 掉 Expo 原生模块，所以测试跑在 Node 上，无需模拟器；真机 / 模拟器上的
// 端到端用例见 .maestro/（`just e2e`）。
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo/android',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  moduleNameMapper: {
    // 顺序重要：@/assets/* 必须先于 @/*（否则会被映射到 src/assets）
    '^@/assets/(.*)$': '<rootDir>/assets/$1',
    '^@/(.*)$': '<rootDir>/src/$1',
    // .db 不是 Metro 认识的图片 / 字体类型，用占位 asset id 代替
    '\\.db$': '<rootDir>/__tests__/helpers/asset-stub.js',
  },
  testMatch: ['<rootDir>/__tests__/**/*-test.{ts,tsx}'],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/types/**',
    '!**/node_modules/**',
  ],
};
