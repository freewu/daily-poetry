import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';

import { useTheme } from '@/theme';

interface Props {
  label: string;
  testID?: string;
  onPress: () => void;
}

/**
 * 顶栏右侧的文字入口。比图标明确：集子里「按作者」/「全部诗词」这种一跳就要认出来，
 * 光放两个人形 / 列表图标反而要试。
 */
export function BarLink({ label, testID, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.5 : 1 })}>
      <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/**
 * 「回到上一层的诗词列表」这类入口：正常是返回，深链进来（没有上一页）才 push。
 * ScreenBar 的返回键走的是同一套判断，这里只是给一个文字版。
 */
export function useBackOr(fallback: () => void) {
  const router = useRouter();
  return () => {
    if (router.canGoBack()) router.back();
    else fallback();
  };
}
