import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoemActions } from '@/components/poem-actions';
import { PoemCard } from '@/components/poem-card';
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
import type { Poem, PushPref } from '@/lib/types';
import { useTheme } from '@/theme';

export default function TodayScreen() {
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [date, setDate] = useState(todayStr());
  const [poem, setPoem] = useState<Poem | null>(null);
  const [info, setInfo] = useState<DayInfo | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const sp = (await getSetting(db, 'settings_push')) ?? 'classic';
        const push: PushPref = sp === 'occasion' ? 'occasion' : 'classic';
        const di = dayInfo(date);
        if (!alive) return;
        setInfo(di);
        const occ = push === 'occasion' ? occasionFor(di) : null;
        const pick = await pickPoemForDate(db, date, occ);
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
  const prev = () => setDate((d) => shiftDayStr(d, -1));
  const next = () => {
    if (!isFuture) setDate((d) => shiftDayStr(d, 1));
  };

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
          <DayBtn icon="chevron-back" onPress={prev} />
          <DayBtn icon="chevron-forward" onPress={next} disabled={isFuture} />
        </View>
      </View>

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
          <PoemCard poem={poem} />
        ) : (
          <Text style={[styles.loading, { color: colors.sub }]}>正在挑拣今日诗篇…</Text>
        )}
      </ScrollView>

      {poem ? (
        <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <PoemActions poem={poem} />
        </View>
      ) : null}
    </View>
  );
}

function DayBtn({
  icon,
  onPress,
  disabled,
}: {
  icon: 'chevron-back' | 'chevron-forward';
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
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
});
