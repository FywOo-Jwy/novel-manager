import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Text, IconButton, Dialog, Portal, Divider, Button } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/theme/theme';
import { CoverThumb } from '@/components/CoverThumb';
import { TagChip } from '@/components/TagChip';
import { getBookWithTags, deleteBook } from '@/db/books';
import { listReadingLogs } from '@/db/readingLogs';
import { listEpubFiles } from '@/db/epubFiles';
import { fileFromRel } from '@/utils/files';
import { displayDate, formatTimestamp } from '@/utils/date';
import { formatMoney, trimNumber } from '@/utils/format';
import { readingStatusColor, publicationStatusColor } from '@/utils/status';
import type { BookWithTags, ReadingLog, EpubFile } from '@/types/models';

const INFO_LABEL_COLORS = [
  '#7FD4E2',
  '#B7A6F0',
  '#F2A6C0',
  '#9FD9AF',
  '#F2C48A',
  '#8FB8F0',
  '#D9A6E6',
  '#8FD9C8',
];

/** Small outlined info pill (status / rating / method). */
function InfoPill({ icon, label, color }: { icon?: string; label: string; color?: string }) {
  const c = color ?? theme.colors.onSurfaceVariant;
  return (
    <View style={[styles.infoPill, { borderColor: c + '55' }]}>
      {icon ? (
        <MaterialCommunityIcons name={icon as never} size={14} color={c} style={styles.infoPillIcon} />
      ) : null}
      <Text style={[styles.infoPillText, { color: c }]}>{label}</Text>
    </View>
  );
}

/** A venera-style info row: colored label chip + one or more value pills. */
function InfoRow({
  label,
  values,
  colorIndex,
}: {
  label: string;
  values: string[];
  colorIndex: number;
}) {
  if (!values.length) return null;
  const color = INFO_LABEL_COLORS[colorIndex % INFO_LABEL_COLORS.length];
  return (
    <View style={styles.chipRow}>
      <View style={[styles.labelChip, { backgroundColor: color + '22' }]}>
        <Text style={[styles.labelChipText, { color }]}>{label}</Text>
      </View>
      <View style={styles.valueWrap}>
        {values.map((v, i) => (
          <View key={i} style={styles.valuePill}>
            <Text style={styles.valuePillText}>{v}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Rounded primary / secondary action button. */
function PillButton({
  icon,
  label,
  onPress,
  variant,
}: {
  icon: string;
  label: string;
  onPress: () => void;
  variant: 'primary' | 'secondary';
}) {
  const bg = variant === 'primary' ? theme.colors.primary : theme.colors.primaryContainer;
  const fg = variant === 'primary' ? theme.colors.onPrimary : theme.colors.onPrimaryContainer;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.pillBtn,
        { backgroundColor: bg, opacity: pressed ? 0.85 : 1 },
      ]}
    >
      <MaterialCommunityIcons name={icon as never} size={19} color={fg} style={styles.pillBtnIcon} />
      <Text style={[styles.pillBtnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export default function BookDetailScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookId = Number(id);
  const insets = useSafeAreaInsets();

  const [book, setBook] = useState<BookWithTags | null>(null);
  const [logs, setLogs] = useState<ReadingLog[]>([]);
  const [epubs, setEpubs] = useState<EpubFile[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [volumePicker, setVolumePicker] = useState(false);
  const [selectedEpubId, setSelectedEpubId] = useState<number | null>(null);
  const [noEpubHint, setNoEpubHint] = useState(false);

  const load = useCallback(async () => {
    const [b, l, e] = await Promise.all([
      getBookWithTags(db, bookId),
      listReadingLogs(db, bookId),
      listEpubFiles(db, bookId),
    ]);
    setBook(b);
    setLogs(l);
    setEpubs(e);
  }, [db, bookId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /* 最近一段阅读记录（用于「上次阅读」chip） */
  const lastLog = useMemo(() => {
    if (!logs.length) return null;
    return [...logs].sort((a, b) => {
      const ka = a.end_date ?? a.start_date ?? '';
      const kb = b.end_date ?? b.start_date ?? '';
      return kb.localeCompare(ka);
    })[0];
  }, [logs]);

  const openEpub = async (rel: string | null) => {
    if (!rel) return;
    try {
      const f = fileFromRel(rel);
      if (f.exists) await f.preview({ mimeType: 'application/epub+zip' });
    } catch {
      // ignore open errors
    }
  };

  /* 当前选中的分卷：优先用户手动选择，其次匹配「在读」卷，最后第一本 */
  const selectedEpub = useMemo(() => {
    if (!epubs.length) return null;
    if (selectedEpubId != null) {
      const found = epubs.find((e) => e.id === selectedEpubId);
      if (found) return found;
    }
    const rv = book?.reading_volume;
    if (rv != null) {
      const match = epubs.find(
        (e) => e.volume_number != null && Number(e.volume_number) === Number(rv)
      );
      if (match) return match;
    }
    return epubs[0];
  }, [epubs, selectedEpubId, book]);

  /* 开始阅读：打开当前选中的分卷 */
  const onStartReading = () => {
    if (!epubs.length) {
      setNoEpubHint(true);
      return;
    }
    if (selectedEpub) openEpub(selectedEpub.file_path);
  };

  const onPickVolume = () => {
    if (!epubs.length) {
      setNoEpubHint(true);
      return;
    }
    setVolumePicker(true);
  };

  const onDelete = async () => {
    setConfirmDelete(false);
    await deleteBook(db, bookId);
    router.back();
  };

  if (!book) return <View style={styles.container} />;

  const infoValues = (v: string | number | null | undefined) =>
    v != null && v !== '' ? [typeof v === 'number' ? trimNumber(v) : v] : [];

  return (
    <View style={styles.container}>
      {/* 顶部操作栏 */}
      <View style={[styles.topBar, { paddingTop: insets.top }]}>
        <IconButton icon="arrow-left" size={24} onPress={() => router.back()} iconColor={theme.colors.onSurface} />
        <View style={styles.topBarRight}>
          <IconButton
            icon="pencil-outline"
            size={22}
            onPress={() => router.push(`/book/${bookId}/edit`)}
            iconColor={theme.colors.onSurface}
          />
          <IconButton
            icon="trash-can-outline"
            size={22}
            onPress={() => setConfirmDelete(true)}
            iconColor={theme.colors.onSurface}
          />
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Hero：左封面 + 右标题 */}
        <View style={styles.hero}>
          <CoverThumb path={book.cover_path} width={120} height={180} radius={12} />
          <View style={styles.heroText}>
            <Text style={styles.title}>{book.title_cn}</Text>
            {book.title_jp ? (
              <Text style={styles.titleJp}>{book.title_jp}</Text>
            ) : null}
            {book.publisher || book.author ? (
              <Text style={styles.heroSource}>{book.publisher ?? book.author}</Text>
            ) : null}
          </View>
        </View>

        {/* 状态/信息 pill 行 */}
        <View style={styles.pillRow}>
          <InfoPill icon="circle" label={book.reading_status} color={readingStatusColor(book.reading_status)} />
          {book.publication_status ? (
            <InfoPill
              icon="book-clock-outline"
              label={book.publication_status}
              color={publicationStatusColor(book.publication_status)}
            />
          ) : null}
          {book.rating != null ? <InfoPill icon="star" label={`${book.rating}/10`} color="#F2C48A" /> : null}
          {book.reading_method ? <InfoPill icon="tablet" label={book.reading_method} /> : null}
        </View>

        {/* 两个大操作按钮 */}
        <View style={styles.actionRow}>
          <PillButton
            icon="play"
            label={
              selectedEpub?.volume_number != null
                ? `开始阅读（${trimNumber(selectedEpub.volume_number)}卷）`
                : '开始阅读'
            }
            onPress={onStartReading}
            variant="primary"
          />
          <PillButton icon="format-list-numbered" label="选择分卷" onPress={onPickVolume} variant="secondary" />
        </View>

        {/* 上次阅读 chip */}
        {lastLog ? (
          <View style={styles.lastReadChip}>
            <MaterialCommunityIcons name="history" size={16} color={theme.colors.primary} />
            <Text style={styles.lastReadText}>
              上次阅读：
              {displayDate(lastLog.start_date) || '…'} ~ {displayDate(lastLog.end_date) || '…'}
              {lastLog.start_volume != null || lastLog.end_volume != null
                ? ` · 卷${lastLog.start_volume != null ? trimNumber(lastLog.start_volume) : '…'}~${lastLog.end_volume != null ? trimNumber(lastLog.end_volume) : '…'}`
                : ''}
            </Text>
          </View>
        ) : null}

        <Divider style={styles.divider} />

        {/* 资讯 */}
        <Text style={styles.sectionTitle}>资讯</Text>
        <View style={styles.infoSection}>
          <InfoRow label="作者" values={infoValues(book.author)} colorIndex={0} />
          <InfoRow label="插画" values={infoValues(book.illustrator)} colorIndex={1} />
          <InfoRow label="文库" values={infoValues(book.publisher)} colorIndex={2} />
          <InfoRow
            label="卷数"
            values={book.total_volumes != null ? [`共 ${trimNumber(book.total_volumes)} 卷`] : []}
            colorIndex={3}
          />
          {book.reading_volume != null ? (
            <InfoRow label="在读" values={[`第 ${trimNumber(book.reading_volume)} 卷`]} colorIndex={3} />
          ) : null}
          <InfoRow label="方式" values={infoValues(book.reading_method)} colorIndex={4} />
          <InfoRow
            label="购入"
            values={book.cost != null ? [formatMoney(book.cost)] : []}
            colorIndex={5}
          />
          <InfoRow
            label="回血"
            values={book.recovered != null ? [formatMoney(book.recovered)] : []}
            colorIndex={6}
          />
          <InfoRow
            label="评分"
            values={book.rating != null ? [`${book.rating} / 10`] : []}
            colorIndex={7}
          />
          {book.tags.length ? (
            <View style={styles.chipRow}>
              <View style={[styles.labelChip, { backgroundColor: INFO_LABEL_COLORS[0] + '22' }]}>
                <Text style={[styles.labelChipText, { color: INFO_LABEL_COLORS[0] }]}>标签</Text>
              </View>
              <View style={styles.valueWrap}>
                {book.tags.map((t) => (
                  <TagChip key={t.id} label={t.name} color={t.group_color ?? undefined} />
                ))}
              </View>
            </View>
          ) : null}
        </View>

        {/* 阅读记录 */}
        {logs.length ? (
          <>
            <Text style={styles.sectionTitle}>阅读记录</Text>
            {logs.map((l) => (
              <View key={l.id} style={styles.logRow}>
                <MaterialCommunityIcons
                  name="calendar-range"
                  size={16}
                  color={theme.colors.onSurfaceVariant}
                  style={styles.logIcon}
                />
                <Text style={styles.logDate}>
                  {l.start_date || l.end_date
                    ? `${displayDate(l.start_date) || '…'} ~ ${displayDate(l.end_date) || '…'}`
                    : '未填日期'}
                </Text>
                {l.start_volume != null || l.end_volume != null ? (
                  <Text style={styles.logVol}>
                    卷 {l.start_volume != null ? trimNumber(l.start_volume) : '…'} ~{' '}
                    {l.end_volume != null ? trimNumber(l.end_volume) : '…'}
                  </Text>
                ) : null}
              </View>
            ))}
          </>
        ) : null}

        {/* 电子书文件 */}
        <Text style={styles.sectionTitle}>电子书文件</Text>
        {epubs.length ? (
          epubs.map((e) => (
            <Pressable key={e.id} onPress={() => openEpub(e.file_path)} style={styles.epubRow}>
              <MaterialCommunityIcons
                name="file-document-outline"
                size={18}
                color={theme.colors.primary}
                style={styles.epubIcon}
              />
              <Text style={styles.epubName}>
                {e.type}
                {e.volume_number != null ? ` · 卷${trimNumber(e.volume_number)}` : ''}
              </Text>
              {e.is_cover_source ? <Text style={styles.coverSource}>封面来源</Text> : null}
              <MaterialCommunityIcons
                name="chevron-right"
                size={18}
                color={theme.colors.onSurfaceVariant}
              />
            </Pressable>
          ))
        ) : (
          <Text style={styles.emptyHint}>尚未绑定电子书文件</Text>
        )}
        <Button
          mode="outlined"
          icon="link-variant"
          onPress={() => router.push(`/epub/${bookId}`)}
          style={styles.manageEpubBtn}
          textColor={theme.colors.primary}
        >
          管理电子书
        </Button>

        {/* 书评 */}
        {book.review ? (
          <>
            <Text style={styles.sectionTitle}>书评</Text>
            <Text style={styles.review}>{book.review}</Text>
          </>
        ) : null}

        <Text style={styles.updated}>最近更新：{formatTimestamp(book.updated_at)}</Text>
      </ScrollView>

      <Portal>
        <Dialog visible={confirmDelete} onDismiss={() => setConfirmDelete(false)}>
          <Dialog.Title>删除书籍</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              确定删除《{book.title_cn}》吗？相关阅读记录、标签关联和电子书文件都会被删除。
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmDelete(false)}>取消</Button>
            <Button onPress={onDelete} textColor={theme.colors.error}>
              删除
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* 选择分卷 */}
        <Dialog visible={volumePicker} onDismiss={() => setVolumePicker(false)}>
          <Dialog.Title>选择分卷</Dialog.Title>
          <Dialog.Content>
            {[...epubs]
              .sort((a, b) => (a.volume_number ?? 0) - (b.volume_number ?? 0))
              .map((e) => {
                const active = selectedEpub?.id === e.id;
                return (
                  <Pressable
                    key={e.id}
                    style={[styles.pickRow, active && styles.pickRowActive]}
                    onPress={() => {
                      setSelectedEpubId(e.id);
                      setVolumePicker(false);
                    }}
                  >
                    <MaterialCommunityIcons
                      name="book-open-variant"
                      size={18}
                      color={active ? theme.colors.primary : theme.colors.onSurfaceVariant}
                    />
                    <Text style={styles.pickLabel}>
                      {e.type}
                      {e.volume_number != null ? ` · 卷${trimNumber(e.volume_number)}` : ' · 未标卷号'}
                    </Text>
                    {active ? (
                      <MaterialCommunityIcons name="check-circle" size={18} color={theme.colors.primary} />
                    ) : null}
                  </Pressable>
                );
              })}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setVolumePicker(false)}>取消</Button>
          </Dialog.Actions>
        </Dialog>

        {/* 未绑定提示 */}
        <Dialog visible={noEpubHint} onDismiss={() => setNoEpubHint(false)}>
          <Dialog.Title>还没有电子书文件</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              这本书还没有绑定 epub 文件。绑定之后就可以从这里直接打开阅读。
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setNoEpubHint(false)}>取消</Button>
            <Button
              onPress={() => {
                setNoEpubHint(false);
                router.push(`/epub/${bookId}`);
              }}
            >
              去绑定
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  heroText: {
    flex: 1,
    marginLeft: 16,
    paddingTop: 4,
  },
  title: {
    fontSize: 23,
    lineHeight: 30,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  titleJp: {
    fontSize: 13,
    lineHeight: 18,
    color: theme.colors.onSurfaceVariant,
    marginTop: 6,
  },
  heroSource: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 10,
    opacity: 0.8,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 18,
  },
  infoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 5,
    marginRight: 8,
    marginBottom: 8,
  },
  infoPillIcon: {
    marginRight: 5,
  },
  infoPillText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 14,
  },
  pillBtn: {
    flex: 1,
    height: 50,
    borderRadius: 999,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillBtnIcon: {
    marginRight: 7,
  },
  pillBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  lastReadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary + '18',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 6,
  },
  lastReadText: {
    fontSize: 12.5,
    color: theme.colors.onSurface,
    marginLeft: 6,
  },
  divider: {
    marginVertical: 18,
    backgroundColor: theme.colors.outlineVariant,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginTop: 18,
    marginBottom: 12,
  },
  infoSection: {
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  labelChip: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginRight: 10,
    minWidth: 56,
    alignItems: 'center',
  },
  labelChipText: {
    fontSize: 12.5,
    fontWeight: '600',
  },
  valueWrap: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  valuePill: {
    backgroundColor: theme.colors.surfaceVariant,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginRight: 6,
    marginBottom: 6,
  },
  valuePillText: {
    fontSize: 12.5,
    color: theme.colors.onSurface,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  logIcon: {
    marginRight: 8,
  },
  logDate: {
    flex: 1,
    color: theme.colors.onSurface,
    fontSize: 13.5,
  },
  logVol: {
    color: theme.colors.onSurfaceVariant,
    fontSize: 12.5,
  },
  epubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  epubIcon: {
    marginRight: 8,
  },
  epubName: {
    flex: 1,
    color: theme.colors.onSurface,
    fontSize: 14,
  },
  coverSource: {
    marginRight: 6,
    fontSize: 11,
    color: theme.colors.primary,
  },
  manageEpubBtn: {
    marginTop: 10,
    borderRadius: 999,
  },
  review: {
    color: theme.colors.onSurface,
    lineHeight: 22,
    fontSize: 14,
  },
  updated: {
    marginTop: 24,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    opacity: 0.7,
  },
  emptyHint: {
    color: theme.colors.onSurfaceVariant,
    opacity: 0.75,
    fontSize: 13,
  },
  dialogText: {
    color: theme.colors.onSurface,
    lineHeight: 20,
  },
  pickRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 12,
  },
  pickRowActive: {
    backgroundColor: theme.colors.primary + '1F',
  },
  pickLabel: {
    flex: 1,
    marginLeft: 10,
    color: theme.colors.onSurface,
    fontSize: 14,
  },
});
