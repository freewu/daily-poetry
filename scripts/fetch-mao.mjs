#!/usr/bin/env node
/**
 * fetch-mao.mjs — 知乎《毛泽东诗词大全（1-145）首》→ data/mao-poems.json
 *
 * 用法:
 *   node scripts/fetch-mao.mjs                      # 读 .data/mao/mao.html，写 data/mao-poems.json
 *   node scripts/fetch-mao.mjs --from <html>         # 指定存档页
 *   node scripts/fetch-mao.mjs --out <json>          # 指定输出
 *
 * 这份语料**没有可抓的 URL**：知乎对脚本一律 403（`zhuanlan.zhihu.com/p/620593015`
 * 返回反爬壳页，`api/v4/articles/…` 也是 403），所以语料是「浏览器存下来的离线 HTML
 * → 解析成 JSON」，HTML 本身不入库，只有 `data/mao-poems.json` 跟着仓库走
 * （`.data/` 是 gitignore 的，fresh clone 靠这份 JSON 也能建库）。
 *
 * 页面结构（知乎专栏正文全在 `<div class="RichText ztext Post-RichText">` 的 `<p>` 里）：
 *
 *   1. 《儿歌·应舞狮》          ← 编号 + 《体裁·题目》
 *   1902年正月                  ← 写作日期
 *   狮子眼鼓鼓，擦菜子煮豆腐。      ← 正文，两句一行（跟唐诗三百首一样）
 *
 * 编号后面还有几种变体，都得认：
 *   - `12. 五律` + 下一行 `登云麓宫联句`：体裁单独一行，题目在下一行
 *   - `43～45. 十六字令` + `三首`：一个编号段带 3 首，正文用「其一 / 其二 / 其三」分段
 *   - `106～113. 十六字令` + `八首`：同上，但**没有**「其N」，靠空行分 8 段
 *   - `26. 虞美人·枕上  赠杨开慧`：副题跟题目挤在一行，用两个空格隔开
 *   - `6. 七绝·咏蛙` + `1910年秋  独坐池塘如虎踞…`：日期和正文第一行挤在一起
 *
 * 输出的每一首是 `{title, author, dynasty, subtitle, lines}`：
 *   - title：`体裁·题目`（`七律·长征` / `沁园春·长沙`），组诗再缀 `·其N`
 *   - subtitle：写作日期（有副题就 `1923年 · 赠杨开慧`）—— 详情页「选自《毛泽东诗词》· 1923年」
 *   - dynasty 一律「现代」，author 一律「毛泽东」
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}
const SRC = resolve(arg('from', join(ROOT, '.data', 'mao', 'mao.html')));
const OUT = resolve(arg('out', join(ROOT, 'data', 'mao-poems.json')));

/** 编号行：`1. 《…》` / `70.五律` / `43～45. 十六字令` */
const ENTRY = /^(\d+)(?:～(\d+))?[.．、]\s*(\S.*)$/;
/** 写作日期：`1902年正月` / `1934年3月至1935年` / `1966年7月8日`（后面可能还跟着正文） */
const DATE = /^(\d{4}年[^，。！？；\s]*)(?:\s{2,}(.+))?$/;
/** 组诗分段标记 */
const PIECE = /^其([一二三四五六七八九十]+)$/;
/** 带标点的行肯定是正文（副题 `赠杨开慧` 这种不会带标点） */
const PUNCT = /[。，！？；、：]/;
/** 题目里单独的「三首」「八首」—— 组诗件数，拼进标题没意义（`其N` 已经说明了） */
const COUNT_ONLY = /^[一二三四五六七八九十]+首$/;
/** 标题里那几个得手工修的地方（原页面自己就不统一） */
const TITLE_FIX = new Map([
  ['七绝—戏改杜甫《咏怀古迹》其三', '七绝·戏改杜甫《咏怀古迹》其三'],
  ['二首纪念鲁迅八十寿辰', '纪念鲁迅八十寿辰'],
  ['读《封建论》——呈郭老', '读《封建论》呈郭老'],
  ['改张元千词悼董必武', '改张元干词悼董必武'],
]);
/** 末尾那段编者的「注明：…两首有可能是陈明远仿作」不是正文 */
const EDITOR_TAIL = /^(注[明释]?|说明)[：:]/;

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’', hellip: '…',
  mdash: '—', middot: '·', ensp: ' ', emsp: ' ',
};

function decode(text) {
  return text.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (m, name) => {
    if (name[0] === '#') {
      const code = name[1] === 'x' || name[1] === 'X'
        ? parseInt(name.slice(2), 16)
        : parseInt(name.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[name] ?? m;
  });
}

/** 段落文本：剥标签、去零宽空格（**不能收空格** —— 日期与正文、题目与副题都靠两个空格分隔） */
function textOf(html) {
  return decode(html.replace(/<[^>]+>/g, ''))
    .replace(/[\u200b\u200c\u200d]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

/** 知乎正文块：`<div class="RichText ztext Post-RichText …">` 到配对的那个 `</div>` */
function articleHtml(html) {
  const start = html.search(/<div class="RichText ztext/);
  if (start < 0) throw new Error('没找到知乎正文块（<div class="RichText ztext …">）');
  let depth = 0;
  for (const m of html.slice(start).matchAll(/<(\/?)div\b/g)) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return html.slice(start, start + m.index);
  }
  throw new Error('正文块没有闭合');
}

/** 正文块 → 段落数组（空串代表段间空行） */
function paragraphs(body) {
  return [...body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/g)].map((m) => textOf(m[1]));
}

/** `体裁·题目` 拆成 [体裁, 题目]；没有 `·` 时题目留空（在下一行） */
function splitTitle(raw) {
  const text = raw.replace(/^《(.*)》$/, '$1').trim();
  const cut = text.indexOf('·');
  if (cut < 0) {
    // `132. 七绝—戏改杜甫《咏怀古迹》其三`：偶尔用破折号当间隔号
    const dash = text.indexOf('—');
    if (dash > 0) return [text.slice(0, dash).trim(), text.slice(dash + 1).replace(/^—/, '').trim()];
    return [text.replace(/\s+/g, ''), ''];
  }
  return [text.slice(0, cut).replace(/\s+/g, ''), text.slice(cut + 1).trim()];
}

/** 半角标点改成全角（`横槊赋诗意飞扬,` 这种），只动汉字旁边的 */
const HALF_TO_FULL = { ',': '，', ';': '；', '?': '？', '!': '！', ':': '：' };
function fullWidth(text) {
  return text.replace(/([\u4e00-\u9fa5\u3000-\u303f])([,;?!:])/g, (_, a, b) => a + (HALF_TO_FULL[b] ?? b));
}

/** 一个编号块 → 若干首（组诗拆开），返回 `{title, subtitle, lines}` */
function parseEntry(no, rangeEnd, titleText, block) {
  const [genreRaw, inlineSubject] = splitTitle(titleText);
  const genre = genreRaw;
  // `虞美人·枕上  赠杨开慧`：题目和副题挤在一行，两个空格隔开
  const [inlineMain, ...inlineExtras] = inlineSubject.split(/\s{2,}/);
  let subject = TITLE_FIX.get(inlineMain) ?? inlineMain;
  const extras = [...inlineExtras]; // 副题（日期之前）/ 词序（日期之后）
  const body = [];
  let date = '';
  let seenDate = false;
  let seenBlank = false;

  for (const line of block) {
    if (!line) {
      seenBlank = true;
      body.push('');
      continue;
    }
    if (EDITOR_TAIL.test(line)) continue; // 末尾编者注
    const clean = fullWidth(line);
    if (!seenDate) {
      const dm = DATE.exec(clean);
      if (dm) {
        date = dm[1];
        seenDate = true;
        if (dm[2]) body.push(dm[2]); // 日期后面挤着的正文第一行
        continue;
      }
      // 日期之前、正文之前：先是题目（体裁单独一行时），再往后是副题（`赠杨开慧`）
      if (!subject) {
        subject = TITLE_FIX.get(clean) ?? clean;
        continue;
      }
      if (!body.length && !PUNCT.test(clean)) {
        extras.push(clean);
        continue;
      }
    }
    body.push(clean);
  }

  if (COUNT_ONLY.test(subject)) subject = '';
  const base = subject ? `${genre}·${subject}` : genre;

  // 组诗：`其一 / 其二` 分段；没有分段标记就按空行分（编号段说明了几首）
  const pieces = splitPieces(body, rangeEnd ? rangeEnd - no + 1 : 0);
  const subtitle = [date, ...extras].filter(Boolean).join(' · ');

  return pieces.map((lines, i) => ({
    title: pieces.length > 1 ? `${base}·其${NUMERALS[i] ?? i + 1}` : base,
    subtitle,
    lines,
  }));
}

const NUMERALS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 正文按「其N」拆；没有标记就按空行拆成 `expected` 段 */
function splitPieces(body, expected) {
  const clean = (ls) => ls.filter((l) => l.trim());
  const marker = body.findIndex((l) => PIECE.test(l));
  if (marker >= 0) {
    const out = [];
    let cur = null;
    for (const line of body) {
      if (PIECE.test(line)) {
        cur = [];
        out.push(cur);
      } else if (cur) {
        cur.push(line);
      }
    }
    return out.map(clean).filter((ls) => ls.length);
  }
  if (expected > 1) {
    const groups = [[]];
    for (const line of body) {
      if (!line) {
        if (groups.at(-1).length) groups.push([]);
        continue;
      }
      groups.at(-1).push(line);
    }
    const out = groups.map(clean).filter((ls) => ls.length);
    if (out.length === expected) return out;
  }
  const one = clean(body);
  return one.length ? [one] : [];
}

function parse(html) {
  const paras = paragraphs(articleHtml(html));
  const starts = [];
  for (let i = 0; i < paras.length; i += 1) {
    const m = ENTRY.exec(paras[i]);
    if (m) starts.push({ i, no: Number(m[1]), rangeEnd: m[2] ? Number(m[2]) : 0, title: m[3] });
  }
  if (!starts.length) throw new Error('一个编号块都没认出来');

  const poems = [];
  for (const [k, s] of starts.entries()) {
    const end = starts[k + 1]?.i ?? paras.length;
    const pieces = parseEntry(s.no, s.rangeEnd, s.title, paras.slice(s.i + 1, end));
    if (!pieces.length) {
      console.warn(`   – ${s.no}「${s.title}」正文为空，已跳过`);
      continue;
    }
    for (const p of pieces) {
      poems.push({ title: p.title, author: '毛泽东', dynasty: '现代', subtitle: p.subtitle, lines: p.lines });
    }
  }
  return poems;
}

function main() {
  if (!existsSync(SRC)) {
    throw new Error(
      `缺少存档页: ${SRC}\n` +
        '  知乎抓不动（403），这份语料只能从浏览器存下来的页面解析。\n' +
        '  把《毛泽东诗词大全（1-145）首》另存为 HTML 放到 .data/mao/mao.html 再跑一次；\n' +
        '  已经有 data/mao-poems.json 的话，建库不需要这一步。',
    );
  }
  const html = readFileSync(SRC, 'utf8');
  const poems = parse(html);
  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(poems, null, 2)}\n`);

  const authors = new Set(poems.map((p) => p.author));
  const dated = poems.filter((p) => p.subtitle).length;
  const years = poems.map((p) => Number(/^(\d{4})/.exec(p.subtitle)?.[1] ?? 0)).filter(Boolean);
  const chars = poems.reduce((n, p) => n + p.lines.join('').replace(/[，。！？；、：—”‘’“”]/g, '').length, 0);
  const claim = Number(/（1-(\d+)）/.exec(/<title>([^<]*)<\/title>/.exec(html)?.[1] ?? '')?.[1] ?? 0);
  console.log(
    `\n毛泽东诗词: ${poems.length} 首 / ${authors.size} 位作者 / ${dated} 首带写作日期` +
      `（${Math.min(...years)}–${Math.max(...years)}）/ ${chars} 字`,
  );
  if (claim && claim !== poems.length) {
    console.warn(`   ! 页面标题声称 ${claim} 首，实际解出 ${poems.length} 首（差 ${claim - poems.length}）`);
  }
  const longest = poems.reduce((a, b) => (b.lines.length > a.lines.length ? b : a));
  console.log(`  最长: ${longest.title}（${longest.lines.length} 行）`);
  console.log(`输出: ${OUT}`);
}

main();
