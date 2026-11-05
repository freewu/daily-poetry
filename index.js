// 鸿蒙调试用的入口垫片。
//
// Expo 项目的入口是 package.json 的 `"main": "expo-router/entry"`（expo start / expo export
// 按这个路径解析）。但 RNOH 的 MetroJSBundleProvider 把 URL 写死成
// `http://localhost:8081/index.bundle?platform=harmony&dev=true&minify=false`，
// Metro 会按 URL 去项目根找 `index.js` —— 没有这个文件调试时就是 404。
//
// 所以补一个标准入口：`just harmony` 的 Metro 请求 /index.bundle 时落到这里，
// 再由它转给 expo-router。Android / iOS / Web 的入口仍是 expo-router/entry，不走这个文件。
require('expo-router/entry');
