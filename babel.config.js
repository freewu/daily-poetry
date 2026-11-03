// Babel 配置：Metro 与 Jest 共用（jest-expo 的 babel-jest 需要显式配置才会
// 应用 babel-preset-expo，否则 node_modules 里带 Flow 注解的文件解析失败）。
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
