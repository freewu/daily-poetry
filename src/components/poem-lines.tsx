import { useEffect, useMemo, useRef } from 'react';
import { ScrollView, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { isVerse } from '@/lib/format';
import { hidePunct } from '@/lib/punct';
import type { Poem } from '@/lib/types';
import { columnsOf, toColumnText } from '@/lib/typography';
import { useTypography } from '@/typography';

interface Props {
  poem: Poem;
  color: string;
  /** 不传就用设置里的字号（21 × 倍率） */
  fontSize?: number;
  style?: StyleProp<TextStyle>;
  /** 挂在正文节点上（横排是 Text，竖排是外层 View），方便测试断言 */
  testID?: string;
  /** 覆盖设置里的排版（导出卡片固定横排，竖排长诗塞不进方寸） */
  vertical?: boolean;
}

/**
 * 竖排：RN 没有 writing-mode，只能把原文每一行拆成「一列逐字堆叠」，
 * 再用 row-reverse 从右往左排开（第一列在最右）。
 */
function VerticalLines({ poem, color, size, family }: { poem: Poem; color: string; size: number; family?: string }) {
  const columns = useMemo(() => columnsOf(poem.content), [poem.content]);
  const scroller = useRef<ScrollView>(null);
  // 长诗列数多会横向溢出：row-reverse 下 scrollX=0 是内容最左（也就是末句），
  // 所以换诗 / 换字号后要滚到最右，让读者从第一列读起；用户一旦自己拖动就不再抢。
  const autoScroll = useRef(true);
  useEffect(() => {
    autoScroll.current = true;
    scroller.current?.scrollToEnd({ animated: false });
  }, [poem.id, size]);
  const jumpToFirst = () => {
    if (autoScroll.current) scroller.current?.scrollToEnd({ animated: false });
  };
  return (
    <ScrollView
      ref={scroller}
      testID="poem-vertical"
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={jumpToFirst}
      onScrollBeginDrag={() => {
        autoScroll.current = false;
      }}
      contentContainerStyle={{
        flexGrow: 1,
        flexDirection: 'row-reverse',
        justifyContent: 'center',
        alignItems: 'flex-start',
        columnGap: Math.round(size * 0.45),
      }}>
      {columns.map((line, i) => (
        <Text
          key={i}
          selectable
          style={{
            color,
            fontFamily: family,
            fontSize: size,
            lineHeight: Math.round(size * 1.22),
            textAlign: 'center',
            letterSpacing: 1,
          }}>
          {toColumnText(line)}
        </Text>
      ))}
    </ScrollView>
  );
}

/** 正文渲染：诗句居中、长文左对齐，保留原始换行；字体 / 字号 / 排版跟随设置 */
export function PoemLines({ poem, color, fontSize, style, testID, vertical: forceVertical }: Props) {
  const { family, bodySize, vertical: prefVertical, punct } = useTypography();
  const vertical = forceVertical ?? prefVertical;
  // 「空白断句」：标点换成空格。竖排时 toColumnText 会压掉空格，
  // 于是竖列变成不带标点的连续字串——正是古籍的样子。
  const shown = useMemo(
    () => (punct === 'space' ? { ...poem, content: hidePunct(poem.content) } : poem),
    [poem, punct],
  );
  const centered = useMemo(() => isVerse(shown), [shown]);
  const size = fontSize ?? bodySize;

  if (vertical) {
    return (
      <View testID={testID} style={style}>
        <VerticalLines poem={shown} color={color} size={size} family={family} />
      </View>
    );
  }

  return (
    <Text
      testID={testID}
      selectable
      style={[
        {
          color,
          fontSize: size,
          fontFamily: family,
          lineHeight: Math.round(size * 1.85),
          textAlign: centered ? 'center' : 'left',
          letterSpacing: centered ? 2 : 0.4,
        },
        style,
      ]}>
      {shown.content}
    </Text>
  );
}
