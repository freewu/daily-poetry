import { Solar } from 'lunar-javascript';

import type { Occasion } from './types';

/** 某公历日的农历信息（展示用） */
export interface DayInfo {
  /** 如「八月十五」 */
  lunarDate: string;
  /** 如「丙午年」 */
  ganzhi: string;
  /** 传统节日名，如 ['中秋节'] */
  festivals: string[];
  /** 当日节气名；非节气日为空串 */
  jieqi: string;
}

/** 农历 / 干支与节气节日的换算 */
export function dayInfo(dateStr: string): DayInfo {
  const [y, m, d] = dateStr.split('-').map(Number);
  const lunar = Solar.fromYmd(y, m, d).getLunar();
  return {
    lunarDate: `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`,
    ganzhi: `${lunar.getYearInGanZhi()}年`,
    festivals: lunar.getFestivals(),
    jieqi: lunar.getJieQi(),
  };
}

/** 传统节日 → 应景检索词（对题目 + 正文做命中） */
const FESTIVAL_OCCASIONS: Occasion[] = [
  {
    id: 'fest-chunjie',
    kind: 'festival',
    label: '春节',
    festival: '春节',
    keywords: ['元日', '元旦', '除夜', '守岁', '岁除', '新岁', '新正'],
  },
  {
    id: 'fest-yuanxiao',
    kind: 'festival',
    label: '元宵节',
    festival: '元宵节',
    keywords: ['元宵', '元夕', '上元', '灯夕', '正月十五'],
  },
  {
    id: 'fest-duanwu',
    kind: 'festival',
    label: '端午节',
    festival: '端午节',
    keywords: ['端午', '端阳', '重午', '重五', '竞渡'],
  },
  {
    id: 'fest-qixi',
    kind: 'festival',
    label: '七夕节',
    festival: '七夕节',
    keywords: ['七夕', '乞巧', '牵牛', '河汉女'],
  },
  {
    id: 'fest-zhongqiu',
    kind: 'festival',
    label: '中秋节',
    festival: '中秋节',
    keywords: ['中秋', '月夕', '十五夜', '三五夜'],
  },
  {
    id: 'fest-chongyang',
    kind: 'festival',
    label: '重阳节',
    festival: '重阳节',
    keywords: ['重阳', '九月九', '登高', '茱萸'],
  },
  {
    id: 'fest-chuxi',
    kind: 'festival',
    label: '除夕',
    festival: '除夕',
    keywords: ['除夕', '除夜', '守岁', '岁除'],
  },
];

const TERM_NAMES = [
  '立春', '雨水', '惊蛰', '春分', '清明', '谷雨',
  '立夏', '小满', '芒种', '夏至', '小暑', '大暑',
  '立秋', '处暑', '白露', '秋分', '寒露', '霜降',
  '立冬', '小雪', '大雪', '冬至', '小寒', '大寒',
];

const TERM_OCCASIONS: Occasion[] = TERM_NAMES.map((name) => ({
  id: `term-${name}`,
  kind: 'term',
  label: name,
  keywords: [name],
}));

/** 某天是否落在已收录的节日 / 节气上；没有则返回 null */
export function occasionFor(info: DayInfo): Occasion | null {
  for (const name of info.festivals) {
    const hit = FESTIVAL_OCCASIONS.find((o) => o.festival === name);
    if (hit) return hit;
  }
  if (info.jieqi) {
    const hit = TERM_OCCASIONS.find((o) => o.label === info.jieqi);
    if (hit) return hit;
  }
  return null;
}
