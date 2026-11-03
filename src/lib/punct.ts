import type { PunctKey } from './types';

/**
 * 标点显示：语料里的正文自带逗号句号，仿古版式（尤其竖排）往往不要标点，
 * 但直接删掉会让句子黏成一串，所以换成空格当「句读」。
 */
export const PUNCT_OPTS: { key: PunctKey; label: string; hint: string }[] = [
  { key: 'keep', label: '保留标点', hint: '按语料原文排版，逗号句号都在' },
  { key: 'space', label: '空白断句', hint: '标点换成空格，只留句读间隙（仅影响显示）' },
];

export const DEFAULT_PUNCT: PunctKey = 'keep';

export function isPunctKey(v: unknown): v is PunctKey {
  return v === 'keep' || v === 'space';
}

/**
 * 中文标点 + 全角符号 + 常见西文标点。
 * 顿号、间隔号、省略号、破折号都算；引号书名号成对出现，一并抹掉。
 */
const PUNCT_RE =
  /[，。、；：？！…—–～·・,.;:?!'"“”‘’「」『』（）()《》〈〉【】〔〕\[\]{}<>\/\\|_*+=~^@#$%&\-]/g;

/**
 * 隐藏标点：标点 → 空格，连续空格压成一个，去掉每行首尾空白，保留换行。
 * 换行是「原文一行」的边界，不能动，否则竖排的列数会变。
 */
export function hidePunct(text: string): string {
  return text
    .replace(PUNCT_RE, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}
