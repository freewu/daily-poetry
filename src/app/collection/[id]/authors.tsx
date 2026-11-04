import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type SectionList as SectionListType,
  type ViewToken,
} from 'react-native';

import { LetterRail } from '@/components/letter-rail';
import { ScreenBar } from '@/components/screen-bar';
import {
  authorLabel,
  groupAuthors,
  letterLabel,
  type AuthorSection,
  type AuthorStat,
} from '@/lib/authors';
import { authorsOfCollection, getCollection } from '@/lib/db';
import { localizeCollection } from '@/lib/script';
import { scaled } from '@/lib/typography';
import type { CollectionMeta } from '@/lib/types';
import { useScript } from '@/script';
import { useTheme } from '@/theme';
import { useTypography } from '@/typography';

const VIEWABILITY = { itemVisiblePercentThreshold: 20 };

/** 重试上限：跳不过去时按平均行高先滚一脚，等列表把这块量出来再精确跳 */
const MAX_SCROLL_RETRY = 3;
const RETRY_DELAY = 80;

/**
 * 集子 → 作者统计：按姓首字母分组（右侧 A–Z 直达），每组里按全拼排，
 * 名字后面是收录作品数；点名字进该作者的作品列表，头部保留「全部诗词」。
 */
export default function CollectionAuthorsScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const db = useSQLiteContext();
  const { colors } = useTheme();
  const { script } = useScript();
  const { family, scale } = useTypography();
  const router = useRouter();

  const [meta, setMeta] = useState<CollectionMeta | null>(null);
  const [sections, setSections] = useState<AuthorSection[]>([]);
  const [missing, setMissing] = useState(() => !id);
  const [active, setActive] = useState<string | undefined>(undefined);

  const listRef = useRef<SectionListType<AuthorStat, AuthorSection>>(null);
  /** 正在跳的分组；`onScrollToIndexFailed` 靠它知道该重试哪一段 */
  const pending = useRef<number | null>(null);
  const retries = useRef(0);

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
        authorsOfCollection(db, coll)
          .then((rows) => {
            if (!alive) return;
            const grouped = groupAuthors(rows);
            setSections(grouped);
            setActive(grouped[0]?.initial);
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [db, id]);

  const scrollToSection = useCallback((sectionIndex: number, animated: boolean) => {
    try {
      listRef.current?.scrollToLocation({
        sectionIndex,
        itemIndex: 0,
        viewPosition: 0,
        animated,
      });
    } catch {
      // 列表还没挂上（冷启动那一下），跳不动就先算了，别把页面带崩
    }
  }, []);

  const jumpTo = useCallback(
    (letter: string) => {
      const index = sections.findIndex((s) => s.initial === letter);
      if (index < 0) return;
      setActive(letter);
      pending.current = index;
      retries.current = 0;
      scrollToSection(index, true);
    },
    [sections, scrollToSection],
  );

  /**
   * 列表是虚拟化的：没量过的那一段 `scrollToLocation` 会失败（RN 不会自己兜底），
   * 所以先按平均行高把目标滚进渲染窗口，再让它自己精确跳一次。
   */
  const onScrollToIndexFailed = useCallback(
    (info: { index: number; averageItemLength?: number }) => {
      const y = Math.max(0, (info.averageItemLength ?? 0) * info.index);
      try {
        listRef.current?.getScrollResponder()?.scrollTo({ y, animated: false });
      } catch {
        // 拿不到底层 ScrollView 就算了，下面的重试还会再试
      }
      const target = pending.current;
      if (target == null || retries.current >= MAX_SCROLL_RETRY) return;
      retries.current += 1;
      setTimeout(() => {
        if (pending.current === target) scrollToSection(target, true);
      }, RETRY_DELAY);
    },
    [scrollToSection],
  );

  // SectionList 要求这个回调用常量引用（不然每次渲染都会重挂监听）；
  // setActive 本身稳定，所以 useCallback 空依赖就够了
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0] as (ViewToken & { section?: AuthorSection }) | undefined;
    if (first?.section?.initial) setActive(first.section.initial);
  }, []);

  const coll = meta ? localizeCollection(meta, script) : null;
  const title = coll?.name ?? '选集';
  const poems = sections.reduce((n, s) => n + s.data.reduce((m, a) => m + a.count, 0), 0);
  const openAuthor = (row: AuthorStat) =>
    router.push({
      pathname: '/author/[name]',
      params: { name: row.name, coll: id ?? '', tw: row.nameTw ?? '' },
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenBar title={title} />
      {missing ? (
        <Text style={[styles.missing, { color: colors.faint }]}>未找到该选集</Text>
      ) : (
        <View style={styles.body}>
          <SectionList
            ref={listRef}
            testID="author-list"
            sections={sections}
            keyExtractor={(row, i) => `${row.name}-${i}`}
            stickySectionHeadersEnabled
            style={styles.list}
            contentContainerStyle={styles.content}
            onViewableItemsChanged={onViewable}
            onScrollToIndexFailed={onScrollToIndexFailed}
            viewabilityConfig={VIEWABILITY}
            ListHeaderComponent={
              <View style={styles.head}>
                <Text style={[styles.sub, { color: colors.sub }]}>
                  {`${sections.reduce((n, s) => n + s.data.length, 0)} 位作者 · 共 ${poems} 首`}
                </Text>
                <Pressable
                  testID="collection-all-poems"
                  accessibilityLabel="全部诗词"
                  hitSlop={8}
                  onPress={() =>
                    router.push({
                      pathname: '/collection/[id]/poems',
                      params: { id: id ?? '' },
                    })
                  }
                  style={({ pressed }) => [styles.all, { opacity: pressed ? 0.5 : 1 }]}>
                  <Text style={[styles.allText, { color: colors.accent }]}>全部诗词</Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.accent} />
                </Pressable>
              </View>
            }
            renderSectionHeader={({ section }) => (
              <Text
                testID={`section-${section.initial}`}
                style={[styles.header, { color: colors.accent, backgroundColor: colors.bg }]}>
                {letterLabel(section.initial)}
              </Text>
            )}
            renderItem={({ item }) => (
              <Pressable
                testID={`author-${item.name || '佚名'}`}
                onPress={() => openAuthor(item)}
                style={({ pressed }) => [styles.row, { opacity: pressed ? 0.55 : 1 }]}>
                <Text
                  numberOfLines={1}
                  style={[
                    styles.name,
                    { color: colors.text, fontFamily: family, fontSize: scaled(16, scale) },
                  ]}>
                  {authorLabel(item, script)}
                </Text>
                <Text style={[styles.count, { color: colors.sub }]}>{item.count} 首</Text>
              </Pressable>
            )}
            ListEmptyComponent={
              <Text style={[styles.missing, { color: colors.faint }]}>这个选集里还没有作者</Text>
            }
          />
          {/* 索引条贴右边，右手拇指够得着，也不挡作者名 */}
          <LetterRail letters={sections.map((s) => s.initial)} active={active} onPick={jumpTo} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, flexDirection: 'row' },
  list: { flex: 1 },
  content: { paddingBottom: 30, paddingLeft: 6, paddingRight: 4 },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 8,
  },
  sub: { fontSize: 12, letterSpacing: 1 },
  header: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 4,
  },
  name: { flex: 1, fontWeight: '600' },
  count: { fontSize: 12, fontVariant: ['tabular-nums'] },
  all: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  allText: { fontSize: 12, fontWeight: '600' },
  missing: { textAlign: 'center', marginTop: 90, fontSize: 14 },
});
