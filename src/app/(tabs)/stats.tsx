import { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, router } from 'expo-router';
import { Text } from 'react-native-paper';
import { theme } from '@/theme/theme';
import { BookCard } from '@/components/BookCard';
import { EmptyState } from '@/components/EmptyState';
import { getDashboardStats } from '@/db/dashboard';
import { formatMoney } from '@/utils/format';
import type { DashboardStats, Book } from '@/types/models';

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardValue}>{value}</Text>
      <Text style={styles.cardLabel}>{label}</Text>
    </View>
  );
}

function BookListSection({ title, books }: { title: string; books: Book[] }) {
  if (!books.length) return null;
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {books.map((b) => (
        <BookCard key={b.id} book={b} onPress={() => router.push(`/book/${b.id}`)} />
      ))}
    </View>
  );
}

export default function StatsScreen() {
  const db = useSQLiteContext();
  const [stats, setStats] = useState<DashboardStats | null>(null);

  const load = useCallback(async () => {
    setStats(await getDashboardStats(db));
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  if (!stats) return <View style={styles.container} />;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.cardGrid}>
        <StatCard label="总藏书" value={String(stats.totalBooks)} />
        <StatCard label="今年读完" value={String(stats.readThisYear)} />
        <StatCard label="总费用" value={formatMoney(stats.totalCost) || '¥0'} />
        <StatCard label="总回血" value={formatMoney(stats.totalRecovered) || '¥0'} />
      </View>

      <BookListSection title="当前在读" books={stats.currentlyReading} />
      <BookListSection title="连载中的小说" books={stats.ongoingSeries} />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>上一本读完</Text>
        {stats.lastFinished ? (
          <BookCard book={stats.lastFinished} onPress={() => router.push(`/book/${stats.lastFinished!.id}`)} />
        ) : (
          <EmptyState icon="check-circle-outline" title="还没有读完的书" />
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    padding: 16,
    paddingBottom: 40,
  },
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    backgroundColor: '#1A181E',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
  },
  cardValue: {
    fontSize: 24,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  cardLabel: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
  },
  section: {
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginBottom: 8,
  },
});
