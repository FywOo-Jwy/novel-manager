import { useCallback, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, router } from 'expo-router';
import { Searchbar, Chip, FAB, Badge, IconButton, Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '@/theme/theme';
import { BookCard } from '@/components/BookCard';
import { EmptyState } from '@/components/EmptyState';
import { FilterSheet } from '@/components/FilterSheet';
import { listBooks, getDistinctAuthors, getDistinctPublishers } from '@/db/books';
import { listTags } from '@/db/tags';
import type { Book, Filters, SortKey, SortState, TagWithGroup } from '@/types/models';
import { EMPTY_FILTERS } from '@/types/models';

const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: SortState['direction'] }[] = [
  { key: 'updated_at', label: '最近修改', defaultDir: 'desc' },
  { key: 'rating', label: '评分', defaultDir: 'desc' },
  { key: 'total_volumes', label: '最新卷', defaultDir: 'desc' },
];

function filterCount(f: Filters): number {
  return (
    f.includeTagIds.length +
    f.excludeTagIds.length +
    f.readingStatuses.length +
    f.publicationStatuses.length +
    f.authors.length +
    f.publishers.length +
    f.readingMethods.length
  );
}

export default function ShelfScreen() {
  const db = useSQLiteContext();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>({ key: 'updated_at', direction: 'desc' });
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterVisible, setFilterVisible] = useState(false);

  const [allTags, setAllTags] = useState<TagWithGroup[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [publishers, setPublishers] = useState<string[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await listBooks(db, { sort, filters, search });
      setBooks(rows);
    } finally {
      setLoading(false);
    }
  }, [db, sort, filters, search]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      (async () => {
        const [tags, as, ps] = await Promise.all([
          listTags(db),
          getDistinctAuthors(db),
          getDistinctPublishers(db),
        ]);
        setAllTags(tags);
        setAuthors(as);
        setPublishers(ps);
      })();
    }, [db, load])
  );

  const onSortPress = (key: SortKey) => {
    if (sort.key === key) {
      setSort({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
    } else {
      const opt = SORT_OPTIONS.find((o) => o.key === key)!;
      setSort({ key, direction: opt.defaultDir });
    }
  };

  const activeCount = filterCount(filters);

  return (
    <View style={styles.container}>
      <Searchbar
        placeholder="搜索书名、作者、标签…"
        value={search}
        onChangeText={setSearch}
        style={styles.search}
        clearIcon="close"
      />

      <View style={styles.sortRow}>
        <View style={styles.sortScroll}>
          {SORT_OPTIONS.map((o) => {
            const active = sort.key === o.key;
            return (
              <Chip
                key={o.key}
                selected={active}
                onPress={() => onSortPress(o.key)}
                style={styles.sortChip}
                icon={
                  active
                    ? sort.direction === 'asc'
                      ? 'arrow-up'
                      : 'arrow-down'
                    : undefined
                }
              >
                {o.label}
              </Chip>
            );
          })}
        </View>
        <View style={styles.filterBtnWrap}>
          <IconButton
            icon="filter-variant"
            size={22}
            onPress={() => setFilterVisible(true)}
            iconColor={activeCount ? theme.colors.primary : theme.colors.onSurfaceVariant}
          />
          {activeCount > 0 ? (
            <Badge size={18} style={styles.badge}>
              {activeCount}
            </Badge>
          ) : null}
        </View>
      </View>

      <FlatList
        data={books}
        keyExtractor={(b) => String(b.id)}
        renderItem={({ item }) => (
          <BookCard book={item} query={search} onPress={() => router.push(`/book/${item.id}`)} />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? undefined : (
            <EmptyState
              icon="bookshelf"
              title={search || activeCount > 0 ? '没有符合条件的书籍' : '书架空空如也'}
              hint={search || activeCount > 0 ? '试试调整搜索或筛选条件' : '点击右下角 + 添加第一本书'}
            />
          )
        }
      />

      <FAB
        icon="plus"
        style={styles.fab}
        onPress={() => router.push('/book/new')}
        label="添加"
      />

      <FilterSheet
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        filters={filters}
        onChange={setFilters}
        allTags={allTags}
        authors={authors}
        publishers={publishers}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  search: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceVariant,
    height: 46,
  },
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  sortScroll: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  sortChip: {
    marginRight: 8,
  },
  filterBtnWrap: {
    position: 'relative',
    marginRight: 4,
  },
  badge: {
    position: 'absolute',
    top: 2,
    right: 2,
  },
  listContent: {
    paddingBottom: 96,
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});
