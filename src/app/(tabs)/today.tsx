import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoemActions } from '@/components/poem-actions';
import { PoemCard } from '@/components/poem-card';
import { gapOf } from '@/lib/daily';
import {
  getSetting,
  pickPoemForDate,
  prettyDate,
  rememberDay,
  shiftDayStr,
  todayStr,
  weekdayOf,
} from '@/lib/db';
import { dayInfo, occasionFor, type DayInfo } from '@/lib/lunar';
import { claimsSwipe, swipeStep } from '@/lib/swipe';
import type { Poem, PushPref } from '@/lib/types';
import { useTheme } from '@/theme';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [date, setDate] = useState(todayStr());
  const [poem, setPoem] = useState<Poem | null>(null);
  const [info, setInfo] = useState<DayInfo | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const [sp, sg] = await Promise.all([
          getSetting(db, 'settings_push'),
          getSetting(db, 'settings_daily_gap'),
        ]);
        const push: PushPref = sp === 'occasion' ? 'occasion' : 'classic';
        const di = dayInfo(date);
        if (!alive) return;
        setInfo(di);
        const occ = push === 'occasion' ? occasionFor(di) : null;
        const pick = await pickPoemForDate(db, date, occ, gapOf(sg));
        if (!alive || !pick.poem) return;
        setPoem(pick.poem);
        rememberDay(db, date, pick.poem.id).catch(() => {});
      })().catch(() => {});
      return () => {
        alive = false;
      };
    }, [db, date]),
  );

  const isFuture = date >= todayStr();
  // 函数式更新 + 空依赖：「不越过今天」的守门放进 updater，
  // 于是 prev / next 是稳定引用，PanResponder 不用每次渲染重建
  const prev = useCallback(() => setDate((d) => shiftDayStr(d, -1)), []);
  const next = useCallback(() => setDate((d) => (d >= todayStr() ? d : shiftDayStr(d, 1))), []);
  const move = useCallback((step: -1 | 1) => (step < 0 ? prev() : next()), [prev, next]);

  // 左右滑动翻日：只接管明显横向的手势，竖向留给 ScrollView（见 lib/swipe.ts）
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => claimsSwipe(g.dx, g.dy),
        onPanResponderRelease: (_e, g) => {
          const step = swipeStep(g.dx, g.dy);
          if (step) move(step);
        },
      }),
    [move],
  );

  const tags: { label: string; sub: string }[] = [];
  if (info) {
    for (const f of info.festivals) tags.push({ label: f, sub: '节日' });
    if (info.jieqi) tags.push({ label: info.jieqi, sub: '节气' });
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, paddingTop: insets.top + 8 }}>
      <View style={styles.head}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}>
          <View style={[styles.seal, { backgroundColor: colors.accent }]}>
            <Text style={[styles.sealText, { color: colors.onAccent }]}>诗</Text>
          </View>
          <View style={{ flexShrink: 1 }}>
            <Text style={[styles.brand, { color: colors.text }]}>每日一诗</Text>
            <Text style={[styles.date, { color: colors.sub }]} numberOfLines={1}>
              {prettyDate(date)} · {weekdayOf(date)}
            </Text>
            {info ? (
              <Text style={[styles.lunar, { color: colors.faint }]} numberOfLines={1}>
                农历{info.lunarDate} · {info.ganzhi}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <DayBtn testID="day-prev" icon="chevron-back" onPress={prev} />
          <DayBtn
            testID="day-next"
            icon="chevron-forward"
            onPress={next}
            disabled={isFuture}
          />
        </View>
      </View>

      <View testID="today-swipe" style={{ flex: 1 }} {...pan.panHandlers}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scroll}>
          {tags.length > 0 ? (
            <View style={styles.tags}>
              {tags.map((t) => (
                <View key={t.sub + t.label} style={[styles.tag, { backgroundColor: colors.soft }]}>
                  <Text style={[styles.tagText, { color: colors.softText }]}>
                    {t.label} · {t.sub}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}

          {poem ? (
            <PoemCard poem={poem} testID="today-poem" />
          ) : (
            <Text testID="today-loading" style={[styles.loading, { color: colors.sub }]}>
              正在挑拣今日诗篇…
            </Text>
          )}

          <Text testID="today-swipe-hint" style={[styles.hint, { color: colors.faint }]}>
            左右滑动 · 看上一天 / 下一天
          </Text>
        </ScrollView>
      </View>

      {poem ? (
        <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <PoemActions
            poem={poem}
            onCard={() =>
              router.push({ pathname: '/card/[id]', params: { id: String(poem.id), date } })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

function DayBtn({
  testID,
  icon,
  onPress,
  disabled,
}: {
  testID: string;
  icon: 'chevron-back' | 'chevron-forward';
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={({ pressed }) => ({
        width: 38,
        height: 38,
        borderRadius: 19,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.card,
        borderWidth: 1,
        borderColor: colors.line,
        opacity: pressed ? 0.55 : disabled ? 0.4 : 1,
      })}>
      <Ionicons name={icon} size={18} color={disabled ? colors.faint : colors.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  seal: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sealText: { fontSize: 22, fontWeight: '700' },
  brand: { fontSize: 20, fontWeight: '800', letterSpacing: 3 },
  date: { fontSize: 13, marginTop: 2, letterSpacing: 0.5 },
  lunar: { fontSize: 11, marginTop: 2, letterSpacing: 0.5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 11,
  },
  tagText: { fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  scroll: { paddingHorizontal: 20, paddingBottom: 20 },
  loading: { textAlign: 'center', marginTop: 90, fontSize: 15 },
  hint: { marginTop: 18, textAlign: 'center', fontSize: 11, letterSpacing: 1 },
});
