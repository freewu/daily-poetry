// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // harmony/ 是 tool/harmony-template 渲染出来的鸿蒙工程（ArkTS，不归 expo lint 管）
    ignores: ['dist/*', 'dist-export/*', 'harmony/*', 'tool/harmony-template/*'],
  },
]);
