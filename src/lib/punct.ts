import type { PunctKey } from './types';

/**
 * 标点显示：语料里的正文自带逗号句号，仿古版式（尤其竖排）往往不要标点，
 * 但直接删掉会让句子黏成一串，所以换成空格当「句读」。
 */
export const PUNCT_OPTS: { key: PunctKey; label: string; hint: string }[] = [
  { key: 'keep', label: '保留标点', hint: '按语料原文排版，逗号句号都在' },
  { key: 'space', label: '空白断句', hint: '标点换成空格，每个标点留一个空位（仅影响显示）' },
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
 * 隐藏标点：一个标点换一个空格，**不合并**——「原来标点站的那格」要留成空位，
 * 挤成一点或干脆删掉都会让句读黏住（「」『』『，。』这种连着的一串尤其明显）。
 * 每行首尾的空白顺手去掉（行末标点不额外顶一格），换行必须保留：
 * 换行是「原文一行」的边界，竖排的列数靠它算。
 */
export function hidePunct(text: string): string {
  return text
    .replace(PUNCT_RE, ' ')
    .split('\n')
    .map((line) => line.trim())
    .join('\n');
}
