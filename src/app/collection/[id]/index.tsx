import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { BarLink } from '@/components/bar-link';
import { PoemRow } from '@/components/poem-row';
import { ScreenBar } from '@/components/screen-bar';
import { isCiKind } from '@/lib/cipai';
import { getCollection, poemsOfCollection } from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import type { CollectionMeta, Poem } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

/**
 * 一个集子的全部诗词 —— **集子的落点页**。
 * 顶部两个入口：`按作者`（作者统计）和词集才有的 `按词牌`（词牌统计），
 * 两个页面都是「首字母分组 + 字母条」的同一套展示（`IndexedList`）。
 */
export default function CollectionPoemsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { script } = useScript();

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [poems, setPoems] = useState<Poem[]>([]);
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
        poemsOfCollection(db, coll)
          .then((ps) => alive && setPoems(ps))
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, id]);

  const coll = meta ? localizeCollection(meta, script) : null;
  const subtitle = coll ? `${coll.kind} · 共 ${poems.length} 首` : '';
  // kind 是建库时写死的简体（'词'），跟显示用字无关
  const isCi = meta ? isCiKind(meta.kind) : false;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar
        title={coll?.name ?? '选集'}
        right={
          <View style={styles.links}>
            <BarLink
              testID="collection-authors-link"
              label="按作者"
              onPress={() =>
                router.push({ pathname: '/collection/[id]/authors', params: { id: id ?? '' } })
              }
            />
            {isCi ? (
              <BarLink
                testID="collection-cipai-link"
                label="按词牌"
                onPress={() =>
                  router.push({ pathname: '/collection/[id]/cipai', params: { id: id ?? '' } })
                }
              />
            ) : null}
          </View>
        }
      />
      {missing ? (
        <Text style={[styles.missing, { color: colors.faint }]}>未找到该选集</Text>
      ) : (
        <>
          {/* 头部固定在列表上方：集子的简介不能跟着 2 万首一起滚走 */}
          {subtitle ? (
            <View style={styles.head}>
              <Text testID="collection-sub" style={[styles.sub, { color: colors.sub }]}>
                {subtitle}
              </Text>
              <View style={[styles.rule, { backgroundColor: colors.line }]} />
            </View>
          ) : null}
          <FlatList
            testID="collection-poems"
            data={poems}
            keyExtractor={(p) => String(p.id)}
            renderItem={({ item, index }) => <PoemRow poem={item} index={index + 1} />}
            contentContainerStyle={{ paddingBottom: 30 }}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  links: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  head: { paddingHorizontal: 20, paddingTop: 4 },
  sub: { fontSize: 12, letterSpacing: 1 },
  rule: { height: StyleSheet.hairlineWidth, marginTop: 12 },
  missing: { textAlign: 'center', marginTop: 90, fontSize: 14 },
});
