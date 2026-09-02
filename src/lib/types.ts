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
