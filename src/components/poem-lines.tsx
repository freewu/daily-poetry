import { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { isVerse } from '@/lib/format';
import type { Poem } from '@/lib/types';
import { useTypography } from '@/typography';

interface Props {
  poem: Poem;
  color: string;
  /** 不传就用设置里的字号（21 × 倍率） */
  fontSize?: number;
  style?: StyleProp<TextStyle>;
}

/** 正文渲染：诗句居中、长文左对齐，保留原始换行；字体 / 字号跟随设置 */
export function PoemLines({ poem, color, fontSize, style }: Props) {
  const { family, bodySize } = useTypography();
  const centered = useMemo(() => isVerse(poem), [poem]);
  const size = fontSize ?? bodySize;
  return (
    <Text
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
      {poem.content}
    </Text>
  );
}
