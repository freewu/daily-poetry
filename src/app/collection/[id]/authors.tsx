import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import { BarLink, useBackOr } from '@/components/bar-link';
import { IndexedList } from '@/components/indexed-list';
import { ScreenBar } from '@/components/screen-bar';
import { authorLabel, groupAuthors, type AuthorSection, type AuthorStat } from '@/lib/authors';
import { getCollection } from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import { statsOf } from '@/lib/stats';
import type { CollectionMeta } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

/**
 * 集子 → 作者统计（从集子的「按作者」进来）：按姓首字母分组（右侧 A–Z 直达），
 * 每组里作品多的在前，名字后面是收录作品数；点名字进该作者的作品列表。
 *
 * 展示形式跟「按词牌」共用 `IndexedList`（`src/components/indexed-list.tsx`）。
 *
 * 作者统计是建库时算好随包走的（`src/lib/stats.ts`），这里只做首字母分组。
 */
export default function CollectionAuthorsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { script } = useScript();
  const router = useRouter();

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [sections, setSections] = useState<AuthorSection[]>([]);
  const [missing, setMissing] = useState(() => !id);
  const [total, setTotal] = useState(0);

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
        // 统计是现成的（不用查库）：拿过来分个组就行，几千位作者也就几毫秒
        const stats = statsOf(coll);
        setSections(groupAuthors(stats?.authors ?? []));
        setTotal(stats?.total ?? 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, id]);

  const coll = meta ? localizeCollection(meta, script) : null;
  // 「全部诗词」：一般就是返回列表页，深链直接进作者页时（没有上一页）才 push
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
        <Text style={{ textAlign: 'center', marginTop: 90, fontSize: 14, color: colors.faint }}>
          未找到该选集
        </Text>
      ) : (
        <IndexedList
          listTestID="author-list"
          summary={`${sections.reduce((n, s) => n + s.data.length, 0)} 位作者 · 共 ${total} 首`}
          sections={sections}
          labelOf={(row: AuthorStat) => authorLabel(row, script)}
          testIDOf={(row: AuthorStat) => `author-${row.name || '佚名'}`}
          onPick={(row: AuthorStat) =>
            router.push({
              pathname: '/author/[name]',
              params: { name: row.name, coll: id ?? '', tw: row.nameTw ?? '' },
            })
          }
          emptyText="这个选集里还没有作者"
        />
      )}
    </View>
  );
}
