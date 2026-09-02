// lunar-javascript 未内置类型声明，此处按使用面补齐。
declare module 'lunar-javascript' {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getLunar(): Lunar;
  }

  export class Lunar {
    getYearInGanZhi(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    /** 当日节气名；非节气日返回空串 */
    getJieQi(): string;
    /** 传统节日数组，如 ['中秋节'] */
    getFestivals(): string[];
  }
}
