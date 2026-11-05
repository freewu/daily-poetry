#!/usr/bin/env node
// 把 tool/harmony-template/ 渲染成工程里的 harmony/（鸿蒙工程是生成物，不进版本库）。
//
//   node tool/harmony-render.mjs --template tool/harmony-template --out harmony \
//     --bundle com.example.dailypoetry --label 每日诗词 --app-key main \
//     --version-name 1.1.0 --version-code 2 --rnoh 0.86.1 \
//     --sdk "5.0.0(12)" --model 5.0.0 --icon assets/images/icon.png [--force]
//
// 已存在时**只补缺的文件**，不覆盖（免得把用户在 DevEco 里改的签名配置冲掉）；
// 要整份重来加 --force。模板里 __XXX__ 是占位符，键见下方 PLACEHOLDERS。
import fs from 'node:fs';
import path from 'node:path';

const TEXT_EXT = new Set(['.json5', '.json', '.ets', '.ts', '.cpp', '.h', '.txt', '.md']);

const args = new Map();
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const next = process.argv[i + 1];
  if (next === undefined || next.startsWith('--')) args.set(a.slice(2), true);
  else {
    args.set(a.slice(2), next);
    i++;
  }
}

const need = (k) => {
  const v = args.get(k);
  if (v === undefined || v === true) {
    console.error(`✗ 缺参数 --${k}`);
    process.exit(1);
  }
  return String(v);
};

const template = path.resolve(need('template'));
const out = path.resolve(need('out'));
const force = args.get('force') === true;

const values = {
  __BUNDLE_NAME__: need('bundle'),
  __APP_LABEL__: need('label'),
  __APP_KEY__: need('app-key'),
  __VERSION_NAME__: need('version-name'),
  __VERSION_CODE__: need('version-code'),
  __RNOH_VERSION__: need('rnoh'),
  __COMPATIBLE_SDK__: need('sdk'),
  __HVIGOR_MODEL_VERSION__: need('model'),
};

const fill = (text) => {
  let s = text;
  for (const [k, v] of Object.entries(values)) s = s.split(k).join(v);
  return s;
};

const walk = (dir, base = '') => {
  const files = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = base ? path.join(base, ent.name) : ent.name;
    if (ent.isDirectory()) files.push(...walk(path.join(dir, ent.name), rel));
    else files.push(rel);
  }
  return files;
};

const copy = (src, dest, { text }) => {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (text) {
    const body = fill(fs.readFileSync(src, 'utf8'));
    // 资源目录下的 .json 是 restool 读的，**不是 JSON5**：尾逗号 / // 注释会让构建挂在
    // CompileResource（Error Code 11203002 "Failed to parse the JSON file"）。
    // 这里直接解析一遍，错在生成阶段就报。
    if (path.extname(dest).toLowerCase() === '.json') {
      try {
        JSON.parse(body);
      } catch (e) {
        console.error(`✗ ${path.relative(process.cwd(), dest)} 不是严格 JSON（restool 不认 JSON5）：${e.message}`);
        process.exit(1);
      }
    }
    fs.writeFileSync(dest, body);
  } else fs.copyFileSync(src, dest);
};

if (!fs.existsSync(template)) {
  console.error(`✗ 模板目录不存在：${template}`);
  process.exit(1);
}

let added = 0;
let skipped = 0;
for (const rel of walk(template)) {
  const src = path.join(template, rel);
  const dest = path.join(out, rel);
  if (fs.existsSync(dest) && !force) {
    skipped++;
    continue;
  }
  copy(src, dest, { text: TEXT_EXT.has(path.extname(rel).toLowerCase()) });
  added++;
}

// 图标：AppScope 的 app_icon + entry 的 icon（都用仓库里 just assets 生成的那张）
const icon = args.get('icon');
if (icon && fs.existsSync(icon)) {
  const targets = [
    path.join(out, 'AppScope/resources/base/media/app_icon.png'),
    path.join(out, 'entry/src/main/resources/base/media/icon.png'),
  ];
  for (const t of targets) {
    if (fs.existsSync(t) && !force) {
      skipped++;
      continue;
    }
    fs.mkdirSync(path.dirname(t), { recursive: true });
    fs.copyFileSync(icon, t);
    added++;
  }
} else {
  console.error('  ! 没找到 icon.png（先跑 just assets），鸿蒙工程会缺图标');
}

// rawfile：Release 的 JS bundle 落这里（调试时是空的）
fs.mkdirSync(path.join(out, 'entry/src/main/resources/rawfile'), { recursive: true });

console.log(`  ${path.relative(process.cwd(), out)}/ 生成完毕：新增/更新 ${added} 个文件，保留已有 ${skipped} 个`);
console.log(`  bundle=${values.__BUNDLE_NAME__} label=${values.__APP_LABEL__} sdk=${values.__COMPATIBLE_SDK__} rnoh=${values.__RNOH_VERSION__}`);
