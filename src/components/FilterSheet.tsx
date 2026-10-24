import { ScrollView, Modal, View, StyleSheet } from 'react-native';
import { Text, Chip, Button, IconButton, Divider } from 'react-native-paper';
import { theme } from '@/theme/theme';
import type { Filters, TagWithGroup } from '@/types/models';
import {
  READING_STATUSES,
  PUBLICATION_STATUSES,
  READING_METHODS,
} from '@/types/models';

interface Props {
  visible: boolean;
  onClose: () => void;
  filters: Filters;
  onChange: (f: Filters) => void;
  allTags: TagWithGroup[];
  authors: string[];
  publishers: string[];
}

function ChipRow<T extends string>({
  options,
  selected,
  onToggle,
}: {
  options: { value: T; label: string }[];
  selected: T[];
  onToggle: (v: T) => void;
}) {
  return (
    <View style={styles.chipWrap}>
      {options.map((o) => {
        const active = selected.includes(o.value);
        return (
          <Chip
            key={o.value}
            selected={active}
            onPress={() => onToggle(o.value)}
            style={styles.chip}
          >
            {o.label}
          </Chip>
        );
      })}
    </View>
  );
}

function toggleValue<T extends string>(list: T[], v: T): T[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function toggleId(list: number[], v: number): number[] {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function SectionTitle({ children }: { children: string }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

export function FilterSheet({ visible, onClose, filters, onChange, allTags, authors, publishers }: Props) {
  const set = (patch: Partial<Filters>) => onChange({ ...filters, ...patch });

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>筛选</Text>
            <IconButton icon="close" onPress={onClose} />
          </View>
          <Divider />
          <ScrollView style={styles.body} contentContainerStyle={styles.bodyContent}>
            <SectionTitle>标签（包含）</SectionTitle>
            {allTags.length ? (
              <ChipRow
                options={allTags.map((t) => ({ value: String(t.id), label: t.name }))}
                selected={filters.includeTagIds.map(String)}
                onToggle={(v) => set({ includeTagIds: toggleId(filters.includeTagIds, Number(v)) })}
              />
            ) : (
              <Text style={styles.empty}>暂无标签</Text>
            )}

            <SectionTitle>标签（排除）</SectionTitle>
            {allTags.length ? (
              <ChipRow
                options={allTags.map((t) => ({ value: String(t.id), label: t.name }))}
                selected={filters.excludeTagIds.map(String)}
                onToggle={(v) => set({ excludeTagIds: toggleId(filters.excludeTagIds, Number(v)) })}
              />
            ) : (
              <Text style={styles.empty}>暂无标签</Text>
            )}

            <SectionTitle>阅读状态</SectionTitle>
            <ChipRow
              options={READING_STATUSES.map((s) => ({ value: s, label: s }))}
              selected={filters.readingStatuses}
              onToggle={(v) => set({ readingStatuses: toggleValue(filters.readingStatuses, v) })}
            />

            <SectionTitle>作品状态</SectionTitle>
            <ChipRow
              options={PUBLICATION_STATUSES.map((s) => ({ value: s, label: s }))}
              selected={filters.publicationStatuses}
              onToggle={(v) => set({ publicationStatuses: toggleValue(filters.publicationStatuses, v) })}
            />

            <SectionTitle>作者</SectionTitle>
            {authors.length ? (
              <ChipRow
                options={authors.map((a) => ({ value: a, label: a }))}
                selected={filters.authors}
                onToggle={(v) => set({ authors: toggleValue(filters.authors, v) })}
              />
            ) : (
              <Text style={styles.empty}>暂无作者</Text>
            )}

            <SectionTitle>文库</SectionTitle>
            {publishers.length ? (
              <ChipRow
                options={publishers.map((p) => ({ value: p, label: p }))}
                selected={filters.publishers}
                onToggle={(v) => set({ publishers: toggleValue(filters.publishers, v) })}
              />
            ) : (
              <Text style={styles.empty}>暂无文库</Text>
            )}

            <SectionTitle>阅读方式</SectionTitle>
            <ChipRow
              options={READING_METHODS.map((m) => ({ value: m, label: m }))}
              selected={filters.readingMethods}
              onToggle={(v) => set({ readingMethods: toggleValue(filters.readingMethods, v) })}
            />
          </ScrollView>
          <Divider />
          <View style={styles.actions}>
            <Button
              style={styles.actionBtn}
              onPress={() =>
                onChange({
                  includeTagIds: [],
                  excludeTagIds: [],
                  readingStatuses: [],
                  publicationStatuses: [],
                  authors: [],
                  publishers: [],
                  readingMethods: [],
                })
              }
            >
              清除
            </Button>
            <Button style={styles.actionBtn} mode="contained" onPress={onClose}>
              应用
            </Button>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: theme.colors.backdrop,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#1E1B24',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingLeft: 20,
    paddingRight: 8,
    paddingVertical: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  body: {
    flexGrow: 0,
  },
  bodyContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: theme.colors.primary,
    marginTop: 16,
    marginBottom: 8,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    marginRight: 8,
    marginBottom: 8,
  },
  empty: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    opacity: 0.7,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 10,
  },
  actionBtn: {
    borderRadius: 999,
    minWidth: 96,
  },
});
