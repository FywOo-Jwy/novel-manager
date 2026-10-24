import { useCallback, useEffect, useState } from 'react';
import { View, FlatList, StyleSheet, TextInput, Pressable } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect, router, useLocalSearchParams } from 'expo-router';
import { Chip, FAB, Badge, IconButton, Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '@/theme/theme';
import { BookCard } from '@/components/BookCard';
import { EmptyState } from '@/components/EmptyState';
import { FilterSheet } from '@/components/FilterSheet';
import { listBooks, getDistinctAuthors, getDistinctPublishers } from '@/db/books';
import { listTags } from '@/db/tags';
import type { Book, Filters, SortKey, SortState, TagWithGroup, ReadingMethod, ReadingStatus } from '@/types/models';
import { EMPTY_FILTERS } from '@/types/models';

const SORT_OPTIONS: { key: SortKey; label: string; defaultDir: SortState['direction'] }[] = [
  { key: 'updated_at', label: '最近修改', defaultDir: 'desc' },
  { key: 'rating', label: '评分', defaultDir: 'desc' },
  { key: 'latest_publish_date', label: '最新出版', defaultDir: 'desc' },
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

  // 详情页「资讯」点击后带过来的快捷筛选（stamp 保证每次点击都会生效）
  const params = useLocalSearchParams<{
    author?: string;
    publisher?: string;
    method?: string;
    tagId?: string;
    status?: string;
    stamp?: string;
  }>();

  useEffect(() => {
    const stamp = params.stamp;
    if (!stamp) return;
    const one = (v?: string | string[]) => (Array.isArray(v) ? v[0] : v);
    const author = one(params.author);
    const publisher = one(params.publisher);
    const method = one(params.method);
    const tagId = one(params.tagId);
    const status = one(params.status);
    setFilters({
      ...EMPTY_FILTERS,
      authors: author ? [author] : [],
      publishers: publisher ? [publisher] : [],
      readingMethods: method ? [method as ReadingMethod] : [],
      readingStatuses: status ? [status as ReadingStatus] : [],
      includeTagIds: tagId ? [Number(tagId)] : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.stamp]);

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
      <View style={styles.search}>
        <MaterialCommunityIcons name="magnify" size={20} color={theme.colors.onSurfaceVariant} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="搜索书名、作者、标签…"
          placeholderTextColor={theme.colors.onSurfaceVariant}
          style={styles.searchInput}
          returnKeyType="search"
          selectionColor={theme.colors.primary}
          underlineColorAndroid="transparent"
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <MaterialCommunityIcons name="close-circle" size={18} color={theme.colors.onSurfaceVariant} />
          </Pressable>
        ) : null}
      </View>

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
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 6,
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: theme.colors.surfaceVariant,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    paddingVertical: 0,
    fontSize: 14,
    color: theme.colors.onSurface,
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
