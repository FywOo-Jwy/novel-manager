import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SQLiteProvider } from 'expo-sqlite';
import { theme } from '@/theme/theme';
import { migrateDbIfNeeded } from '@/db/schema';
import { ensureDirs } from '@/utils/files';

export default function RootLayout() {
  useEffect(() => {
    ensureDirs();
  }, []);

  return (
    <SQLiteProvider databaseName="novel-manager.db" onInit={migrateDbIfNeeded}>
      <PaperProvider theme={theme}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: theme.colors.background },
            headerTintColor: theme.colors.onBackground,
            headerTitleStyle: { fontWeight: '600' },
            headerShadowVisible: false,
            contentStyle: { backgroundColor: theme.colors.background },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="book/[id]" options={{ headerShown: false }} />
          <Stack.Screen name="book/[id]/edit" options={{ title: '编辑书籍' }} />
          <Stack.Screen name="book/new" options={{ title: '新增书籍' }} />
          <Stack.Screen name="tag-manager" options={{ title: '标签管理' }} />
          <Stack.Screen name="epub/[bookId]" options={{ title: 'Epub 管理' }} />
          <Stack.Screen name="epub/batch" options={{ title: '批量绑定电子书' }} />
        </Stack>
      </PaperProvider>
    </SQLiteProvider>
  );
}
