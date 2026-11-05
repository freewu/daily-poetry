// React Native CLI 的工程配置（`npx react-native …` 读这个文件）。
//
// 唯一目的：把 RNOH 的命令（bundle-harmony / run-harmony / clean-harmony …）挂进 RN CLI。
// 社区 CLI 只会从 package.json 的 dependencies 里找命令插件，而 RNOH 的 npm 包
// 有 140MB（含 .har），故意不写进 package.json —— 由 `just harmony-setup` 按需装到
// node_modules，所以这里用 try/require：没装鸿蒙工具链时 commands 为空，其余平台照旧。
let commands = [];
try {
  commands = require('@react-native-oh/react-native-harmony-cli').config.commands;
} catch {
  commands = [];
}

module.exports = {
  commands,
};
