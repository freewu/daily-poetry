export interface Poem {
  id: number;
  collection: string;
  /** 集名，如 唐诗三百首 / 花间集 */
  name: string;
  kind: string;
  dynasty: string;
  author: string;
  title: string;
  subtitle: string;
  /** 简体正文（OpenCC t→cn），检索与默认显示都用它 */
  content: string;
  daily: number;
  // ---- 繁体列：随库一起发布，老库 / 测试里可能没有，取不到就回退简体
  name_tw?: string;
  kind_tw?: string;
  dynasty_tw?: string;
  author_tw?: string;
  title_tw?: string;
  subtitle_tw?: string;
  content_tw?: string;
}

export interface CollectionMeta {
  id: string;
  name: string;
  kind: string;
  count: number;
  daily: number;
  name_tw?: string;
  kind_tw?: string;
}

export interface FavoriteRow {
  poem_id: number;
  created_at: string;
}

export type ThemeMode = 'auto' | 'light' | 'dark';

/** 正文用字：简体 / 繁体 */
export type Script = 'cn' | 'tw';

/** 每日推送偏好 */
export type PushPref = 'classic' | 'occasion';

/** 正文字族：系统默认 / 宋体 / 楷体（楷体仅 iOS） */
export type FontKey = 'system' | 'song' | 'kai';

/** 正文字号档位 */
export type SizeKey = 'sm' | 'md' | 'lg' | 'xl';

/** 朗读语速档位 */
export type RateKey = 'slow' | 'normal' | 'fast';

/** 正文排版：横排（自上而下逐行）/ 竖排（自右向左逐列，仿古籍） */
export type Layout = 'horizontal' | 'vertical';

/** 应景日（传统节日 / 二十四节气）及其检索词 */
export interface Occasion {
  id: string;
  kind: 'festival' | 'term';
  label: string;
  /** 对应农历库返回的节日名（kind=festival 时） */
  festival?: string;
  keywords: string[];
}
