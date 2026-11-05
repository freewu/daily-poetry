import { attributionOf } from './format';
import { rng, shuffled } from './random';
import type { Poem } from './types';

/**
 * 诗词挑战：从集子 / 收藏里抽几首诗，挖掉其中一句，四选一把它补回来。
 *
 * 全部是纯函数（同一个种子出同一份题），页面只管渲染和记分。
 * 出题只碰 `content`（简体正文）—— 空的挖空行、标点位置都从它派生；
 * 需要繁体时调用方先把 `localizePoem()` 过的诗传进来。
 */

/** 一局多少题 */
export const CHALLENGE_SIZE = 10;
/** 每题几个选项 */
export const CHALLENGE_OPTIONS = 4;
/** 挖空句的字数范围：太短（4 字以下）猜得出，太长选项排不下 */
export const BLANK_MIN = 5;
export const BLANK_MAX = 16;
/** 参与出题的最少诗数（再少连干扰项都凑不齐） */
export const CHALLENGE_MIN_POOL = 4;
/** 题干里的空位（固定四个全角下划线，不透露答案长短） */
export const BLANK = '＿＿＿＿';

/**
 * 及格 / 优秀的正确率（十题制即 6 题 / 8 题）。
 *
 * 门槛只在代码里：页面**不显示**这几档的分数线，低分一律只给一句「加油」——
 * 说清「几题算及格」等于把规则摆到玩家脸上，玩起来像考试。
 * 所以 `RANKS[*].hint` 里也别写题数（`challenge-test` 盯着这条）。
 */
export const PASS_RATE = 0.6;
export const GOOD_RATE = 0.8;

export type RankKey = 'fail' | 'pass' | 'good' | 'immortal';

export interface Rank {
  key: RankKey;
  /** 结果页的大字 */
  label: string;
  /** 结果页的小字 */
  hint: string;
}

export const RANKS: Record<RankKey, Rank> = {
  fail: { key: 'fail', label: '加油', hint: '多读几首，下一局再来' },
  pass: { key: 'pass', label: '及格', hint: '腹中已有几分诗书' },
  good: { key: 'good', label: '优秀', hint: '只差一两句，可称才子' },
  immortal: { key: 'immortal', label: '诗仙下凡', hint: '谪仙人也，一气呵成' },
};

export interface ChallengeQuestion {
  poemId: number;
  /** 诗题（没题目就用集名，跟列表行一致） */
  title: string;
  /** 「朝代 · 作者」 */
  attribution: string;
  /** 题干：正文按行，挖掉的那一行里空位已换成 `BLANK` */
  lines: string[];
  /** 被挖空的行下标（渲染时标出来） */
  blankLine: number;
  /** 正确答案（挖掉的那一句） */
  answer: string;
  /** 四个候选项，含正确答案 */
  options: string[];
  /** 正确项在 `options` 里的下标 */
  answerIndex: number;
}

export interface ChallengeRecord {
  /** 参与时间（ISO 字符串） */
  at: string;
  /** 来源 id：`favorites` 或集子 id */
  pool: string;
  /** 来源名（收藏 / 全唐诗…），集名改了也照旧留当时的样子 */
  poolName: string;
  total: number;
  correct: number;
  /** 用时（毫秒） */
  ms: number;
}

/** 战绩存在 `meta` 里（KV），不建表：只有「最近几局」要看 */
export const CHALLENGE_LOG_KEY = 'challenge_log';
export const CHALLENGE_LOG_MAX = 20;

/** 正文切行：去掉空行与首尾空白 */
export function linesOf(content: string): string[] {
  return content
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
}

/**
 * 断句用的标点（挖空按句切，标点留在句尾不参与挖空）。
 *
 * 括号 / 引号也算：全唐诗的《补录》里混着校勘记（「（〖1〗句次成公简诗句后」），
 * 那些东西不切开就会整段被当成一句挖掉，题目看着像乱码。
 */
const CLAUSE_SEP = /[，。！？；：、,.!?;:\s()[\]（）「」『』〖〗［］《》〈〉“”‘’·—…]/;

/** 只有汉字才算候选句：混进数字 / 字母 /  leftover 括号的一律不要 */
const HAN_ONLY = /^[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]+$/;

/** 正文里带校勘记号（校注、异文）的诗整首跳过——那是整理稿，不是诗 */
const NOTE_MARK = /[〖〗［］]/;

export interface Clause {
  /** 行下标 */
  line: number;
  /** 在这一行里的起止位置（不含标点） */
  start: number;
  end: number;
  text: string;
}

/** 一行里够格挖空的句子：整行短就整行，长行按标点切成句 */
export function clausesOf(lines: readonly string[]): Clause[] {
  const out: Clause[] = [];
  lines.forEach((line, i) => {
    let start = 0;
    for (let j = 0; j <= line.length; j++) {
      if (j !== line.length && !CLAUSE_SEP.test(line[j])) continue;
      const raw = line.slice(start, j);
      const lead = raw.length - raw.trimStart().length;
      const text = raw.trim();
      if (text.length >= BLANK_MIN && text.length <= BLANK_MAX && HAN_ONLY.test(text)) {
        out.push({ line: i, start: start + lead, end: start + lead + text.length, text });
      }
      start = j + 1;
    }
  });
  return out;
}

/** 从候选里挑干扰项：先挑字数接近的（看着像就能唬人），不够再放宽 */
function distractors(answer: string, pool: readonly string[], rand: () => number): string[] {
  const want = CHALLENGE_OPTIONS - 1;
  const gaps = [2, 5, Infinity];
  const picks: string[] = [];
  for (const gap of gaps) {
    if (picks.length >= want) break;
    const bucket = shuffled(
      pool.filter((t) => t !== answer && !picks.includes(t) && Math.abs(t.length - answer.length) <= gap),
      rand,
    );
    for (const t of bucket) {
      if (picks.length >= want) break;
      picks.push(t);
    }
  }
  return picks;
}

/**
 * 出题：诗句洗牌 → 每首挑一句挖空 → 配上三个干扰项。
 *
 * 池子不足十首时会**再轮一遍**（一首诗的不同句子各出一题），
 * 所以收藏里只有四五首也能凑够一局；实在凑不够就返回少几题，页面照样能玩。
 */
export function buildChallenge(
  poems: readonly Poem[],
  seed: number,
  size: number = CHALLENGE_SIZE,
): ChallengeQuestion[] {
  const pool = poems.filter(
    (p) => (p.content ?? '').trim().length > 0 && !NOTE_MARK.test(p.content),
  );
  if (!pool.length) return [];

  const rand = rng(seed >>> 0);

  // 干扰项的候选句来自**所有**诗：十个选项一半靠这个池子撑着
  const all = new Set<string>();
  for (const p of pool) {
    for (const c of clausesOf(linesOf(p.content))) all.add(c.text);
  }
  const bank = [...all];

  const out: ChallengeQuestion[] = [];
  const used = new Set<string>();
  // 每一遍里，一首诗最多出一道题（每遍重新洗牌挑另一句）。
  // 遍数给到 size + 2：极端情况（池子里只有一首四句的诗）也能凑满一局
  for (let pass = 0; pass < size + 2 && out.length < size; pass++) {
    for (const poem of shuffled(pool, rand)) {
      if (out.length >= size) break;
      const lines = linesOf(poem.content);
      const fresh = clausesOf(lines).filter((c) => !used.has(`${poem.id}|${c.text}`));
      if (!fresh.length) continue;

      const slot = fresh[Math.floor(rand() * fresh.length)];
      used.add(`${poem.id}|${slot.text}`);
      const wrong = distractors(slot.text, bank, rand);
      if (!wrong.length) continue; // 池子里连个干扰项都没有，这题问不出花样

      const masked = [...lines];
      masked[slot.line] = lines[slot.line].slice(0, slot.start) + BLANK + lines[slot.line].slice(slot.end);

      const answerIndex = Math.floor(rand() * (wrong.length + 1));
      const options: string[] = [];
      let d = 0;
      for (let i = 0; i <= wrong.length; i++) {
        options.push(i === answerIndex ? slot.text : wrong[d++]);
      }

      out.push({
        poemId: poem.id,
        title: poem.title || poem.name || '无题',
        attribution: attributionOf(poem),
        lines: masked,
        blankLine: slot.line,
        answer: slot.text,
        options,
        answerIndex,
      });
    }
  }
  return out;
}

/** 评级：题数不同按比例走（阈值见 `PASS_RATE` / `GOOD_RATE`，UI 上不展示） */
export function rankOf(correct: number, total: number): Rank {
  if (total <= 0) return RANKS.fail;
  if (correct >= total) return RANKS.immortal;
  const rate = correct / total;
  if (rate >= GOOD_RATE) return RANKS.good;
  if (rate >= PASS_RATE) return RANKS.pass;
  return RANKS.fail;
}

/** 用时：`42 秒` / `1 分 05 秒`（超过十分钟只报分） */
export function formatDuration(ms: number): string {
  const sec = Math.max(0, Math.round((Number.isFinite(ms) ? ms : 0) / 1000));
  if (sec < 60) return `${sec} 秒`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  if (m >= 10) return `${m} 分`;
  return `${m} 分 ${String(s).padStart(2, '0')} 秒`;
}

/** 战绩里的参与时间：`11月5日 14:32`（本地时区，坏值原样退回） */
export function formatStamp(at: string): string {
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return at;
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hh}:${mm}`;
}

function isRecord(v: unknown): v is ChallengeRecord {
  if (!v || typeof v !== 'object') return false;
  const r = v as Record<string, unknown>;
  return (
    typeof r.at === 'string' &&
    typeof r.pool === 'string' &&
    typeof r.poolName === 'string' &&
    typeof r.total === 'number' &&
    typeof r.correct === 'number' &&
    typeof r.ms === 'number'
  );
}

/** 读战绩：脏数据（老版本 / 手改过的 meta）一律当空，不让它把页面搞崩 */
export function parseLog(raw: string | null | undefined): ChallengeRecord[] {
  const text = (raw ?? '').trim();
  if (!text) return [];
  try {
    const data: unknown = JSON.parse(text);
    return Array.isArray(data) ? data.filter(isRecord).slice(0, CHALLENGE_LOG_MAX) : [];
  } catch {
    return [];
  }
}

/** 记一局：新的排最前，只留最近 `max` 局 */
export function pushRecord(
  log: readonly ChallengeRecord[],
  rec: ChallengeRecord,
  max: number = CHALLENGE_LOG_MAX,
): ChallengeRecord[] {
  return [rec, ...log].slice(0, Math.max(1, max));
}

export interface LogSummary {
  games: number;
  /** 答对最多的一局（并列取较近的一局） */
  best: ChallengeRecord | null;
  /** 平均答对数（保留一位小数，没打过是 0） */
  avgCorrect: number;
}

export function summarize(log: readonly ChallengeRecord[]): LogSummary {
  if (!log.length) return { games: 0, best: null, avgCorrect: 0 };
  let best = log[0];
  let sum = 0;
  for (const r of log) {
    sum += r.correct;
    if (r.correct > best.correct) best = r;
  }
  return { games: log.length, best, avgCorrect: Math.round((sum / log.length) * 10) / 10 };
}
