import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useBackOr } from '@/components/bar-link';
import { ScreenBar } from '@/components/screen-bar';
import {
  BLANK,
  CHALLENGE_SIZE,
  buildChallenge,
  formatDuration,
  rankOf,
  type ChallengeQuestion,
} from '@/lib/challenge';
import {
  CHALLENGE_FAVORITES,
  challengePoems,
  getCollection,
  saveChallengeRecord,
} from '@/lib/db';
import { localizePoem } from '@/lib/script';
import { useScript } from '@/script';
import { useTheme } from '@/theme';
import { useTypography } from '@/typography';

/**
 * 一局挑战：出题 → 逐题作答 → 结果页。
 *
 * 出题用 `buildChallenge()`（纯函数 + 种子），所以「再来一局」只是换个种子；
 * 用时从题目生成完那一刻算起，答完一题立刻落库（`saveChallengeRecord`）。
 * 路由参数：`pool`（`favorites` 或集子 id）、`seed`（测试里用来固定题目）。
 */
export default function ChallengePlayScreen() {
  const { pool, seed } = useLocalSearchParams<{ pool?: string; seed?: string }>();
  // 种子：测试用 `?seed=` 固定题目；正常开局取时间戳，「再来一局」+1
  const [seedBase] = useState(() => {
    const fixed = Number(seed);
    return Number.isFinite(fixed) && fixed > 0 ? Math.floor(fixed) : Date.now() % 2147483647;
  });
  const [round, setRound] = useState(0);
  // 换局直接换掉 key：题目 / 作答 / 计时一起重来，不用在 effect 里逐个 setState
  return (
    <ChallengeRound
      key={`${seedBase}-${round}`}
      poolId={pool ?? ''}
      seed={seedBase + round}
      onAgain={() => setRound((r) => r + 1)}
    />
  );
}

function ChallengeRound({
  poolId,
  seed,
  onAgain,
}: {
  poolId: string;
  seed: number;
  onAgain: () => void;
}) {
  const db = useSQLiteContext();
  const router = useRouter();
  const back = useBackOr(() => router.replace('/challenge'));
  const { colors, theme } = useTheme();
  const { script } = useScript();
  const { family, bodySize } = useTypography();

  const [questions, setQuestions] = useState<ChallengeQuestion[] | null>(null);
  const [poolName, setPoolName] = useState('');
  const [missing, setMissing] = useState(false);
  const [idx, setIdx] = useState(0);
  const [picks, setPicks] = useState<(number | null)[]>([]);
  const [done, setDone] = useState(false);
  const [ms, setMs] = useState(0);
  // 计时从「题目生成完」那一刻起，挂载时再赋值（渲染期不能取当前时间）
  const startedAt = useRef(0);
  const saved = useRef(false);

  useEffect(() => {
    let alive = true;
    const nameOf = async () => {
      if (poolId === CHALLENGE_FAVORITES) return '我的收藏';
      const meta = await getCollection(db, poolId);
      if (!meta) return '';
      return script === 'tw' ? meta.name_tw || meta.name : meta.name;
    };
    Promise.all([challengePoems(db, poolId), nameOf()])
      .then(([poems, name]) => {
        if (!alive) return;
        if (!name) {
          setMissing(true);
          return;
        }
        const qs = buildChallenge(
          poems.map((p) => localizePoem(p, script)),
          seed,
          CHALLENGE_SIZE,
        );
        setPoolName(name);
        setQuestions(qs);
        setPicks(new Array(qs.length).fill(null));
        startedAt.current = Date.now();
      })
      .catch(() => alive && setMissing(true));
    return () => {
      alive = false;
    };
  }, [db, poolId, script, seed]);

  const total = questions?.length ?? 0;
  const current = questions?.[idx] ?? null;
  const picked = picks[idx] ?? null;
  const answered = picked != null;
  const correct = questions
    ? picks.reduce<number>(
        (n, p, i) => (p != null && p === questions[i].answerIndex ? n + 1 : n),
        0,
      )
    : 0;

  const okColor = theme === 'dark' ? '#6FBF95' : '#2F7D5B';
  const badColor = theme === 'dark' ? '#D9735A' : '#A93226';

  const choose = (i: number) => {
    if (answered) return;
    setPicks((prev) => {
      const next = [...prev];
      next[idx] = i;
      return next;
    });
  };

  const next = () => {
    if (!questions) return;
    if (idx + 1 < questions.length) {
      setIdx(idx + 1);
      return;
    }
    const used = Date.now() - startedAt.current;
    setMs(used);
    setDone(true);
  };

  // 答完立即入库；ref 挡掉重复（重渲染 / 严格模式）导致的重复记录
  useEffect(() => {
    if (!done || saved.current || !questions?.length) return;
    saved.current = true;
    saveChallengeRecord(db, {
      at: new Date().toISOString(),
      pool: poolId,
      poolName,
      total: questions.length,
      correct,
      ms,
    }).catch(() => {});
  }, [done, db, poolId, poolName, questions, correct, ms]);

  const lineSize = Math.min(bodySize, 20);
  const rank = rankOf(correct, total);

  if (missing) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenBar title="诗词挑战" onBack={back} />
        <Text testID="challenge-missing" style={[styles.missing, { color: colors.faint }]}>
          未找到这个来源
        </Text>
      </View>
    );
  }

  if (!questions) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenBar title="诗词挑战" onBack={back} />
        <Text testID="challenge-loading" style={[styles.missing, { color: colors.faint }]}>
          正在出题…
        </Text>
      </View>
    );
  }

  if (total === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenBar title={poolName || '诗词挑战'} onBack={back} />
        <Text testID="challenge-no-question" style={[styles.missing, { color: colors.faint }]}>
          这个来源里没有能出题的句子，换一个来源试试
        </Text>
      </View>
    );
  }

  if (done) {
    const wrong = questions
      .map((q, i) => ({ q, pick: picks[i] ?? null }))
      .filter(({ q, pick }) => pick !== q.answerIndex);
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenBar title={poolName || '诗词挑战'} onBack={back} />
        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          <View style={styles.resultHead}>
            <Text testID="challenge-score" style={[styles.score, { color: colors.text }]}>
              {correct}
              <Text style={{ color: colors.faint, fontSize: 26 }}> / {total}</Text>
            </Text>
            <Text
              testID="challenge-rank"
              style={[styles.rank, { color: rank.key === 'fail' ? colors.sub : colors.accent }]}>
              {rank.label}
            </Text>
            <Text style={[styles.rankHint, { color: colors.faint }]}>{rank.hint}</Text>
            <Text testID="challenge-stats" style={[styles.stats, { color: colors.sub }]}>
              {poolName} · 用时 {formatDuration(ms)}
            </Text>
          </View>

          {wrong.length ? (
            <>
              <Text style={[styles.section, { color: colors.sub }]}>错题回顾</Text>
              {wrong.map(({ q, pick }, i) => (
                <View
                  key={`${q.poemId}-${i}`}
                  testID="challenge-wrong"
                  style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
                  <Text style={[styles.wrongTitle, { color: colors.text, fontFamily: family }]}>
                    {q.title}
                    {q.attribution ? (
                      <Text style={{ color: colors.faint, fontSize: 12 }}>　{q.attribution}</Text>
                    ) : null}
                  </Text>
                  <Text style={[styles.wrongLine, { color: okColor, fontFamily: family }]}>
                    ✓ {q.answer}
                  </Text>
                  {pick != null ? (
                    <Text style={[styles.wrongLine, { color: badColor, fontFamily: family }]}>
                      ✗ {q.options[pick]}
                    </Text>
                  ) : null}
                </View>
              ))}
            </>
          ) : (
            <Text testID="challenge-perfect" style={[styles.perfect, { color: colors.accent }]}>
              全对，一首没错。
            </Text>
          )}
        </ScrollView>
        <View style={styles.resultActions}>
          <Pressable
            testID="challenge-again"
            accessibilityRole="button"
            onPress={onAgain}
            style={({ pressed }) => [
              styles.action,
              { backgroundColor: colors.accent, opacity: pressed ? 0.8 : 1 },
            ]}>
            <Text style={[styles.actionText, { color: colors.onAccent }]}>再来一局</Text>
          </Pressable>
          <Pressable
            testID="challenge-exit"
            accessibilityRole="button"
            onPress={back}
            style={({ pressed }) => [
              styles.action,
              styles.actionGhost,
              { borderColor: colors.line, opacity: pressed ? 0.8 : 1 },
            ]}>
            <Text style={[styles.actionText, { color: colors.sub }]}>返回</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar title={poolName || '诗词挑战'} onBack={back} />
      <ScrollView contentContainerStyle={{ paddingBottom: 120 }}>
        <View style={styles.progressWrap}>
          <View style={styles.progressRow}>
            <Text testID="challenge-progress" style={[styles.progress, { color: colors.sub }]}>
              第 {idx + 1} / {total} 题
            </Text>
            <Text testID="challenge-correct" style={[styles.progress, { color: colors.faint }]}>
              已答对 {correct} 题
            </Text>
          </View>
          <View style={[styles.track, { backgroundColor: colors.line }]}>
            <View
              style={[
                styles.bar,
                { backgroundColor: colors.accent, width: `${((idx + (answered ? 1 : 0)) / total) * 100}%` },
              ]}
            />
          </View>
        </View>

        <View
          testID="challenge-prompt"
          style={[styles.card, { backgroundColor: colors.card, borderColor: colors.line }]}>
          <Text style={[styles.poemTitle, { color: colors.text, fontFamily: family }]}>
            {current?.title}
          </Text>
          {current?.attribution ? (
            <Text style={[styles.poemAuthor, { color: colors.faint }]}>{current.attribution}</Text>
          ) : null}
          <View style={styles.lines}>
            {current?.lines.map((line, i) => (
              <Text
                key={i}
                style={[
                  styles.line,
                  {
                    color: colors.text,
                    fontFamily: family,
                    fontSize: lineSize,
                    lineHeight: Math.round(lineSize * 1.8),
                  },
                ]}>
                {i === current.blankLine ? <BlankLine text={line} color={colors.accent} /> : line}
              </Text>
            ))}
          </View>
        </View>

        <View style={styles.options}>
          {current?.options.map((opt, i) => {
            const isAnswer = i === current.answerIndex;
            const isPick = i === picked;
            const shown = answered && (isAnswer || isPick);
            const tone = isAnswer ? okColor : badColor;
            return (
              <Pressable
                key={i}
                testID={`challenge-option-${i}`}
                accessibilityRole="button"
                accessibilityState={{ selected: isPick, disabled: answered }}
                disabled={answered}
                onPress={() => choose(i)}
                style={({ pressed }) => [
                  styles.option,
                  {
                    borderColor: shown ? tone : colors.line,
                    backgroundColor: shown ? colors.soft : colors.card,
                    opacity: answered && !shown ? 0.5 : pressed ? 0.7 : 1,
                  },
                ]}>
                <Text style={[styles.optionText, { color: shown ? tone : colors.text, fontFamily: family }]}>
                  {opt}
                </Text>
                {answered && isPick && !isAnswer ? (
                  <Ionicons name="close-circle" size={18} color={badColor} />
                ) : null}
                {answered && isAnswer ? (
                  <Ionicons name="checkmark-circle" size={18} color={okColor} />
                ) : null}
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      <View style={[styles.footer, { backgroundColor: colors.bg, borderTopColor: colors.line }]}>
        <Pressable
          testID="challenge-next"
          accessibilityRole="button"
          accessibilityState={{ disabled: !answered }}
          disabled={!answered}
          onPress={next}
          style={({ pressed }) => [
            styles.action,
            {
              backgroundColor: answered ? colors.accent : colors.line,
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <Text style={[styles.actionText, { color: answered ? colors.onAccent : colors.faint }]}>
            {idx + 1 < total ? '下一题' : '看结果'}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

/** 挖空的那一行：把 `BLANK` 换成带下划线的空位（其余照常显示） */
function BlankLine({ text, color }: { text: string; color: string }) {
  const at = text.indexOf(BLANK);
  if (at < 0) return <>{text}</>;
  // 同一行里只挖一处，所以切两段就够
  return (
    <>
      {text.slice(0, at)}
      <Text testID="challenge-blank" style={{ color, letterSpacing: 2 }}>
        {BLANK}
      </Text>
      {text.slice(at + BLANK.length)}
    </>
  );
}

const styles = StyleSheet.create({
  missing: { textAlign: 'center', marginTop: 90, fontSize: 14 },
  progressWrap: { paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progress: { fontSize: 12, letterSpacing: 0.5 },
  track: { height: 4, borderRadius: 2, overflow: 'hidden' },
  bar: { height: 4, borderRadius: 2 },
  card: { marginHorizontal: 16, marginBottom: 12, padding: 16, borderRadius: 14, borderWidth: 1 },
  poemTitle: { fontSize: 16, fontWeight: '700', letterSpacing: 1 },
  poemAuthor: { fontSize: 11, marginTop: 5 },
  lines: { marginTop: 12 },
  line: { letterSpacing: 1 },
  options: { paddingHorizontal: 16, gap: 10 },
  option: {
    minHeight: 52,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  optionText: { fontSize: 16, flex: 1, lineHeight: 26 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  action: { flex: 1, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  actionGhost: { borderWidth: 1, backgroundColor: 'transparent' },
  actionText: { fontSize: 15, fontWeight: '700', letterSpacing: 1 },
  resultHead: { alignItems: 'center', paddingTop: 20, paddingBottom: 10 },
  score: { fontSize: 46, fontWeight: '800', letterSpacing: 2 },
  rank: { fontSize: 18, fontWeight: '800', letterSpacing: 3, marginTop: 6 },
  rankHint: { fontSize: 12, marginTop: 8 },
  stats: { fontSize: 12, marginTop: 14, letterSpacing: 0.5 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 1, marginTop: 22, marginBottom: 8, marginHorizontal: 18 },
  wrongTitle: { fontSize: 14, fontWeight: '600' },
  wrongLine: { fontSize: 15, marginTop: 8, lineHeight: 24 },
  perfect: { textAlign: 'center', fontSize: 14, marginTop: 24 },
  resultActions: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingTop: 10, paddingBottom: 18 },
});
