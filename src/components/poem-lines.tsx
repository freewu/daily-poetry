import { useMemo } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { isVerse } from '@/lib/format';
import type { Poem } from '@/lib/types';

interface Props {
  poem: Poem;
  color: string;
  fontSize?: number;
  style?: StyleProp<TextStyle>;
}

/** 正文渲染：诗句居中、长文左对齐，保留原始换行 */
export function PoemLines({ poem, color, fontSize = 21, style }: Props) {
  const centered = useMemo(() => isVerse(poem), [poem]);
  return (
    <Text
      selectable
      style={[
        {
          color,
          fontSize,
          lineHeight: Math.round(fontSize * 1.85),
          textAlign: centered ? 'center' : 'left',
          letterSpacing: centered ? 2 : 0.4,
        },
        style,
      ]}>
      {poem.content}
    </Text>
  );
}
