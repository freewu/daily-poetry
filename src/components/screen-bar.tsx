import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme';

interface Props {
  title: string;
  right?: ReactNode;
  onBack?: () => void;
}

/** 二级页顶栏（返回 + 标题 + 右侧操作） */
export function ScreenBar({ title, right, onBack }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const back = () => {
    if (onBack) return onBack();
    if (router.canGoBack()) router.back();
    else router.replace('/today');
  };
  return (
    <View
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 10,
        paddingHorizontal: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
      }}>
      <Pressable
        onPress={back}
        hitSlop={10}
        style={({ pressed }) => ({
          width: 38,
          height: 38,
          borderRadius: 19,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed ? 0.5 : 1,
        })}>
        <Ionicons name="chevron-back" size={24} color={colors.text} />
      </Pressable>
      <Text
        numberOfLines={1}
        style={{ flex: 1, color: colors.text, fontSize: 17, fontWeight: '600' }}>
        {title}
      </Text>
      <View style={{ minWidth: 38, alignItems: 'flex-end' }}>{right ?? null}</View>
    </View>
  );
}
