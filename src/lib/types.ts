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
  content: string;
  daily: number;
}

export interface CollectionMeta {
  id: string;
  name: string;
  kind: string;
  count: number;
  daily: number;
}

export interface FavoriteRow {
  poem_id: number;
  created_at: string;
}

export type ThemeMode = 'auto' | 'light' | 'dark';

/** 每日推送偏好 */
export type PushPref = 'classic' | 'occasion';

/** 应景日（传统节日 / 二十四节气）及其检索词 */
export interface Occasion {
  id: string;
  kind: 'festival' | 'term';
  label: string;
  /** 对应农历库返回的节日名（kind=festival 时） */
  festival?: string;
  keywords: string[];
}
