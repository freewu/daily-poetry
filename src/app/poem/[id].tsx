import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PoemActions } from '@/components/poem-actions';
import { PoemCard } from '@/components/poem-card';
import { ScreenBar } from '@/components/screen-bar';
import {
  getPoem,
  getSetting,
  pickPoemForDate,
  rememberDay,
  shiftDayStr,
  todayStr,
} from '@/lib/db';
import { dayInfo, occasionFor } from '@/lib/lunar';
import { localizePoem } from '@/lib/script';
import type { Poem, PushPref } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';

/**
 * 诗词详情。
 * - 带 ?date=YYYY-MM-DD 参数时：按日期取“每日一诗”，支持前后翻篇；
 * - 仅带 ?id= 参数时：展示库中某一首。
 */
export default function PoemScreen() {
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { script } = useScript();
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const dailyMode = useMemo(() => Boolean(params.date), [params.date]);
  const initialDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : todayStr();
  const [date, setDate] = useState(initialDate);
  const [poem, setPoem] = useState<Poem | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let alive = true;
    if (dailyMode) {
      (async () => {
        const sp = (await getSetting(db, 'settings_push')) ?? 'classic';
        const push: PushPref = sp === 'occasion' ? 'occasion' : 'classic';
        const occ = push === 'occasion' ? occasionFor(dayInfo(date)) : null;
        const pick = await pickPoemForDate(db, date, occ);
        if (!alive) return;
        if (pick.poem) {
          setPoem(pick.poem);
          rememberDay(db, date, pick.poem.id).catch(() => {});
        } else setPoem(null);
      })().catch(() => {});
    } else {
      const pid = Number(params.id);
      const load =
        Number.isFinite(pid) && pid > 0 ? getPoem(db, pid) : Promise.resolve(null);
      load
        .then((p) => {
          if (!alive) return;
          if (p) setPoem(p);
          else {
            setPoem(null);
            setMissing(true);
          }
        })
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [db, dailyMode, date, params.id]);

  const isFuture = date >= todayStr();
  const shift = (d: number) => setDate((x) => shiftDayStr(x, d));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar
        title={dailyMode ? `${date} · 每日一诗` : (poem ? localizePoem(poem, script).name : '诗词')}
      />

      {dailyMode ? (
        <View style={styles.dateNav}>
          <Pressable onPress={() => shift(-1)} hitSlop={8} style={styles.dateBtn}>
            <Ionicons name="chevron-back" size={16} color={colors.text} />
            <Text style={[styles.dateBtnText, { color: colors.text }]}>前一天</Text>
          </Pressable>
          <Pressable
            disabled={isFuture}
            onPress={() => shift(1)}
            hitSlop={8}
            style={[styles.dateBtn, isFuture && { opacity: 0.4 }]}>
            <Text style={[styles.dateBtnText, { color: colors.text }]}>后一天</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.text} />
          </Pressable>
        </View>
      ) : null}

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 20, paddingBottom: 24 }}>
        {poem ? (
          <PoemCard poem={poem} />
        ) : missing ? (
          <Text style={[styles.hint, { color: colors.faint }]}>未找到这首诗词</Text>
        ) : (
          <Text style={[styles.hint, { color: colors.sub }]}>正在取诗…</Text>
        )}
      </ScrollView>

      {poem ? (
        <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <PoemActions
            poem={poem}
            onCard={() =>
              router.push({
                pathname: '/card/[id]',
                params: { id: String(poem.id), ...(dailyMode ? { date } : {}) },
              })
            }
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  dateNav: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 24,
    paddingBottom: 6,
  },
  dateBtn: { flexDirection: 'row', alignItems: 'center', gap: 2, paddingVertical: 6 },
  dateBtnText: { fontSize: 13 },
  hint: { textAlign: 'center', marginTop: 90, fontSize: 14 },
});
