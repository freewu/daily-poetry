import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ScreenBar } from '@/components/screen-bar';
import { CHALLENGE_MIN_POOL, CHALLENGE_SIZE } from '@/lib/challenge';
import {
  CHALLENGE_FAVORITES,
  favoriteCount,
  listCollections,
  challengeLog,
} from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import type { CollectionMeta } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

interface PoolOpt {
  id: string;
  name: string;
  kind: string;
  count: number;
}

/**
 * 挑战入口页：挑一个来源（收藏 / 某个集子）就能开局，右上角进战绩。
 * 出题、判分、计时的活都在 `lib/challenge.ts` 与 `challenge/[pool].tsx` 里，
 * 战绩明细在 `challenge/log.tsx`。
 */
export default function ChallengeSetupScreen() {
  const db = useSQLiteContext();
  const router = useRouter();
  const { colors } = useTheme();
  const { script } = useScript();
  const insets = useSafeAreaInsets();

  const [pools, setPools] = useState<PoolOpt[] | null>(null);
  // 右上角「战绩 N」只关心有几局，明细在 challenge/log.tsx
  const [games, setGames] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      Promise.all([listCollections(db), favoriteCount(db), challengeLog(db)])
        .then(([colls, favs, records]) => {
          if (!alive) return;
          setGames(records.length);
          const opts = [
            { id: CHALLENGE_FAVORITES, name: '我的收藏', kind: '收藏', count: favs },
            ...colls
              .map((c: CollectionMeta) => localizeCollection(c, script))
              .map((c) => ({ id: c.id, name: c.name, kind: c.kind, count: c.count })),
          ];
          setPools(opts);
          // 默认选第一个够出题的来源：收藏够就用收藏，否则退回第一个集子
          setPicked((prev) => prev ?? opts.find((p) => p.count >= CHALLENGE_MIN_POOL)?.id ?? null);
        })
        .catch(() => alive && setPools([]));
      return () => {
        alive = false;
      };
    }, [db, script]),
  );

  const list = pools ?? [];
  const pool = list.find((p) => p.id === picked) ?? null;
  const enough = !!pool && pool.count >= CHALLENGE_MIN_POOL;

  const start = () => {
    if (!pool || !enough) return;
    router.push({ pathname: '/challenge/[pool]', params: { pool: pool.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar
        title="诗词挑战"
        right={
          <Pressable
            testID="challenge-log-entry"
            accessibilityRole="button"
            accessibilityLabel="战绩"
            hitSlop={8}
            onPress={() => router.push('/challenge/log')}
            style={({ pressed }) => [
              styles.logBtn,
              { borderColor: colors.line, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Ionicons name="stats-chart" size={13} color={colors.sub} />
            <Text style={[styles.logBtnText, { color: colors.sub }]}>
              {games ? `战绩 ${games}` : '战绩'}
            </Text>
          </Pressable>
        }
      />
      <ScrollView contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>十题填空</Text>
          <Text style={[styles.cardBody, { color: colors.sub }]}>
            从所选来源里抽几首，挖掉其中一句，
            {'\n'}四选一补全。答错不扣分，答完即出结果。
          </Text>
        </View>

        <Text style={[styles.section, { color: colors.sub }]}>题目来源</Text>
        {list.map((p) => {
          const sel = p.id === picked;
          const ok = p.count >= CHALLENGE_MIN_POOL;
          return (
            <Pressable
              key={p.id}
              testID={`challenge-pool-${p.id}`}
              accessibilityRole="button"
              accessibilityState={{ selected: sel, disabled: !ok }}
              onPress={() => ok && setPicked(p.id)}
              style={({ pressed }) => [
                styles.row,
                {
                  borderColor: sel ? colors.accent : colors.line,
                  backgroundColor: sel ? colors.soft : colors.card,
                  opacity: pressed ? 0.7 : ok ? 1 : 0.45,
                },
              ]}>
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={[styles.rowName, { color: sel ? colors.softText : colors.text }]}>
                  {p.name}
                </Text>
                <Text style={[styles.rowSub, { color: colors.faint }]}>
                  {ok ? `${p.kind} · ${p.count} 首` : `${p.count} 首 · 不够 ${CHALLENGE_MIN_POOL} 首，出不了题`}
                </Text>
              </View>
              {sel ? <Ionicons name="checkmark-circle" size={20} color={colors.accent} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + 12, backgroundColor: colors.bg, borderTopColor: colors.line },
        ]}>
        <Pressable
          testID="challenge-start"
          accessibilityRole="button"
          accessibilityState={{ disabled: !enough }}
          disabled={!enough}
          onPress={start}
          style={({ pressed }) => [
            styles.start,
            {
              backgroundColor: enough ? colors.accent : colors.line,
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <Text style={[styles.startText, { color: enough ? colors.onAccent : colors.faint }]}>
            {enough ? `开始挑战 · ${pool.count >= CHALLENGE_SIZE ? CHALLENGE_SIZE : pool.count} 题` : '选一个来源'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  cardTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  cardBody: { fontSize: 13, lineHeight: 21, marginTop: 8 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 1, marginTop: 22, marginBottom: 8, marginHorizontal: 18 },
  row: {
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 11, marginTop: 4 },
  // 顶栏右上角：战绩入口（带局数徽标）
  logBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    height: 30,
    paddingHorizontal: 10,
    borderRadius: 15,
    borderWidth: 1,
  },
  logBtnText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  start: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  startText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
});
