import { SQLiteProvider } from 'expo-sqlite';
import * as SplashScreen from 'expo-splash-screen';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DB_NAME } from '@/lib/db';
import {
  planDatabaseAsset,
  restoreUserData,
  type DbPlan,
} from '@/lib/db-bootstrap';
import { AppScriptProvider } from '@/script';
import { AppThemeProvider, useTheme } from '@/theme';
import { AppTypographyProvider } from '@/typography';

SplashScreen.preventAutoHideAsync().catch(() => {});

function RootNavigator() {
  const { colors } = useTheme();

  useEffect(() => {
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  return (
    <>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="poem/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="collection/[id]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="collection/[id]/authors"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen name="collection/[id]/cipai" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen
          name="collection/[id]/cipai/[name]"
          options={{ animation: 'slide_from_right' }}
        />
        <Stack.Screen name="author/[name]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="card/[id]" options={{ animation: 'slide_from_bottom' }} />
        <Stack.Screen name="challenge/index" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="challenge/[pool]" options={{ animation: 'slide_from_right' }} />
        <Stack.Screen name="challenge/log" options={{ animation: 'slide_from_right' }} />
      </Stack>
    </>
  );
}

export default function RootLayout() {
  // 先确认随包库版本：结构变了就整份覆盖，并保留用户的收藏 / 足迹
  const [plan, setPlan] = useState<DbPlan | null>(null);

  useEffect(() => {
    let alive = true;
    planDatabaseAsset()
      .then((p) => alive && setPlan(p))
      .catch(() => alive && setPlan({ forceOverwrite: false, restore: null }));
    return () => {
      alive = false;
    };
  }, []);

  if (!plan) return null; // 启动图还盖着

  return (
    <SafeAreaProvider>
      <SQLiteProvider
        databaseName={DB_NAME}
        assetSource={{
          assetId: require('@/assets/poetry.db'),
          forceOverwrite: plan.forceOverwrite,
        }}
        onInit={(db) => restoreUserData(db, plan.restore)}>
        <AppScriptProvider>
          <AppTypographyProvider>
            <AppThemeProvider>
              <RootNavigator />
            </AppThemeProvider>
          </AppTypographyProvider>
        </AppScriptProvider>
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}
