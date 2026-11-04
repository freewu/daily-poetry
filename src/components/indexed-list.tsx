import { useCallback, useMemo, useRef, useState } from 'react';
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
import { letterLabel } from '@/lib/authors';
import { makeSectionLayout } from '@/lib/section-layout';
import { scaled } from '@/lib/typography';
import { useTheme } from '@/theme';
import { useTypography } from '@/typography';

/** 一行：名字 + 收录数量（作者 / 词牌都用它） */
export interface IndexedRow {
  /** 简体名（分组与排序都用它） */
  name: string;
  /** 繁體名，缺了回退简体 */
  nameTw?: string;
  count: number;
}

export interface IndexedSection {
  /** 分组字母：A–Z 或 # */
  initial: string;
  data: IndexedRow[];
}

interface Props {
  /** 按首字母分好组的数据（`groupAuthors()` 的产物） */
  sections: IndexedSection[];
  /** 头部那句「3650 位作者 · 共 57599 首」 */
  summary: string;
  /** 行名的显示（作者要走简繁 + 「佚名」，词牌直接给词牌名） */
  labelOf: (row: IndexedRow) => string;
  /** 行的 testID 后缀（`author-李白` / `cipai-水调歌头`） */
  testIDOf: (row: IndexedRow) => string;
  onPick: (row: IndexedRow) => void;
  listTestID: string;
  emptyText: string;
}

const VIEWABILITY = { itemVisiblePercentThreshold: 20 };

/** 分组标题固定高度：`getItemLayout` 必须和实际渲染一模一样，否则跳转就是歪的 */
const HEAD_H = 26;
/** 行上下留白（左右另算） */
const ROW_PAD = 22;
/** 名字行高 = 字号 × 1.4，行高固定住，行高才可预测 */
const LINE_RATIO = 1.4;

/**
 * 「首字母分组 + 右侧字母条直达」的长名单：集子的**作者统计**和**词牌统计**共用。
 *
 * 作者（全唐诗 3650 位）和词牌（全宋词 1400+ 个）都是一屏放不下的大表，
 * 展示形式就不该写两遍：分组、字母条、跳转、行高全在这里。
 */
export function IndexedList({
  sections,
  summary,
  labelOf,
  testIDOf,
  onPick,
  listTestID,
  emptyText,
}: Props) {
  const { colors } = useTheme();
  const { family, scale } = useTypography();
  const listRef = useRef<SectionListType<IndexedRow, IndexedSection>>(null);
  const [active, setActive] = useState<string | undefined>(undefined);
  /** 列表头部实测高度（摘要那一行），跳转坐标从这里起算 */
  const [top, setTop] = useState(0);

  const scrollToSection = useCallback((index: number, animated: boolean) => {
    try {
      listRef.current?.scrollToLocation({
        sectionIndex: index,
        itemIndex: 0,
        viewPosition: 0,
        animated,
      });
    } catch {
      // 列表正在重建（换集子 / 换字体）时 RN 会抛，滚不动就算了，别把页面带崩
    }
  }, []);

  const jumpTo = useCallback(
    (letter: string) => {
      const index = sections.findIndex((s) => s.initial === letter);
      if (index < 0) return;
      setActive(letter);
      scrollToSection(index, true);
    },
    [sections, scrollToSection],
  );

  // 行 / 分组标题都是固定高度，所以能给出精确的扁平坐标：
  // 有了 getItemLayout，scrollToLocation 一次到位，不再「按平均行高猜」而偏掉几百行。
  const nameSize = scaled(16, scale);
  const nameLine = Math.round(nameSize * LINE_RATIO);
  const rowHeight = nameLine + ROW_PAD;
  const getItemLayout = useMemo(
    () =>
      makeSectionLayout(
        sections.map((s) => s.data.length),
        { row: rowHeight, header: HEAD_H, top },
      ),
    [sections, rowHeight, top],
  );

  // SectionList 要求这个回调用常量引用（不然每次渲染都会重挂监听）；
  // setActive 本身稳定，所以 useCallback 空依赖就够了
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0] as (ViewToken & { section?: IndexedSection }) | undefined;
    if (first?.section?.initial) setActive(first.section.initial);
  }, []);

  return (
    <View style={styles.body}>
      <SectionList
        ref={listRef}
        testID={listTestID}
        sections={sections}
        keyExtractor={(row, i) => `${row.name}-${i}`}
        stickySectionHeadersEnabled
        style={styles.list}
        contentContainerStyle={styles.content}
        getItemLayout={getItemLayout}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={VIEWABILITY}
        ListHeaderComponent={
          <View
            style={styles.head}
            onLayout={(e) => setTop(Math.round(e.nativeEvent.layout.height))}>
            <Text testID={`${listTestID}-summary`} style={[styles.sub, { color: colors.sub }]}>
              {summary}
            </Text>
          </View>
        }
        renderSectionHeader={({ section }) => (
          <View style={[styles.headerBox, { backgroundColor: colors.bg }]}>
            <Text
              testID={`section-${section.initial}`}
              style={[styles.header, { color: colors.accent }]}>
              {letterLabel(section.initial)}
            </Text>
          </View>
        )}
        renderItem={({ item }) => (
          <Pressable
            testID={testIDOf(item)}
            onPress={() => onPick(item)}
            style={({ pressed }) => [styles.row, { height: rowHeight, opacity: pressed ? 0.55 : 1 }]}>
            <Text
              numberOfLines={1}
              style={[
                styles.name,
                {
                  color: colors.text,
                  fontFamily: family,
                  fontSize: nameSize,
                  lineHeight: nameLine,
                },
              ]}>
              {labelOf(item)}
            </Text>
            <Text style={[styles.count, { color: colors.sub }]}>{item.count} 首</Text>
          </Pressable>
        )}
        ListEmptyComponent={
          <Text style={[styles.missing, { color: colors.faint }]}>{emptyText}</Text>
        }
      />
      {/* 索引条贴右边，右手拇指够得着，也不挡名字 */}
      <LetterRail letters={sections.map((s) => s.initial)} active={active} onPick={jumpTo} />
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
  headerBox: { height: HEAD_H, justifyContent: 'center', paddingHorizontal: 4 },
  header: { fontSize: 12, lineHeight: 16, fontWeight: '800', letterSpacing: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
  },
  name: { flex: 1, fontWeight: '600' },
  count: { fontSize: 12, lineHeight: 16, fontVariant: ['tabular-nums'] },
  missing: { textAlign: 'center', marginTop: 90, fontSize: 14 },
});
