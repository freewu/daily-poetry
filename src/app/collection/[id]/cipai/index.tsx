import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BarLink, useBackOr } from '@/components/bar-link';
import { IndexedList } from '@/components/indexed-list';
import { ScreenBar } from '@/components/screen-bar';
import { groupAuthors, type AuthorSection } from '@/lib/authors';
import { isCiKind, type CipaiStat } from '@/lib/cipai';
import { getCollection } from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import { statsOf } from '@/lib/stats';
import type { CollectionMeta } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

/**
 * 集子 → 词牌统计（从集子的「按词牌」进来）：**跟作者统计同一个展示形式** ——
 * 首字母分组、右侧 A–Z 直达、每组里作品多的在前，点词牌进该词牌的全部作品。
 *
 * 词牌不是库里的列，是从题目 / 副题现算的（`src/lib/cipai.ts`），
 * 但那是建库时的事（`scripts/build-stats.mjs`）—— 这里读的是算好的 `assets/stats.json`，
 * 不用再把这个集子的两万首正文整份读进内存。分组排序复用 `groupAuthors()`。
 */
export default function CollectionCipaiScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { script } = useScript();
  const router = useRouter();

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [stats, setStats] = useState<CipaiStat[]>([]);
  const [total, setTotal] = useState(0);
  const [missing, setMissing] = useState(() => !id);

  useEffect(() => {
    const coll = id ?? '';
    let alive = true;
    getCollection(db, coll)
      .then((m) => {
        if (!alive) return;
        if (!m) {
          setMissing(true);
          return;
        }
        setMeta(m);
        // 元曲是曲牌、诗根本没有词牌，这两类拿到的永远是空数组
        const stats = statsOf(coll);
        setStats(isCiKind(m.kind) ? (stats?.cipai ?? []) : []);
        setTotal(stats?.total ?? 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, id]);

  const coll = meta ? localizeCollection(meta, script) : null;
  const isCi = meta ? isCiKind(meta.kind) : false;
  const sections: AuthorSection[] = useMemo(() => groupAuthors(stats), [stats]);

  const backToPoems = useBackOr(() =>
    router.push({ pathname: '/collection/[id]', params: { id: id ?? '' } }),
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar
        title={coll?.name ?? '选集'}
        right={<BarLink testID="collection-all-poems" label="全部诗词" onPress={backToPoems} />}
      />
      {missing ? (
        <Text style={[styles.missing, { color: colors.faint }]}>未找到该选集</Text>
      ) : (
        <IndexedList
          listTestID="cipai-list"
          summary={`${stats.length} 个词牌 · 共 ${total} 首`}
          sections={sections}
          labelOf={(row) => (script === 'tw' ? (row.nameTw ?? row.name) : row.name)}
          testIDOf={(row) => `cipai-${row.name}`}
          onPick={(row) =>
            router.push({
              pathname: '/collection/[id]/cipai/[name]',
              params: { id: id ?? '', name: row.name, tw: row.nameTw ?? '' },
            })
          }
          emptyText={isCi ? '这个选集里还没有词牌' : '这个选集没有词牌（只有词集才有）'}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  missing: { textAlign: 'center', marginTop: 90, fontSize: 14 },
});
