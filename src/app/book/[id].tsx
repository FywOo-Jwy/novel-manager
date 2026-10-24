import { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, Pressable } from 'react-native';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Text, IconButton, Dialog, Portal, Divider, Button, TextInput, Checkbox } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '@/theme/theme';
import { CoverThumb } from '@/components/CoverThumb';
import { TagChip } from '@/components/TagChip';
import { getBookWithTags, deleteBook, updateBook } from '@/db/books';
import { listReadingLogs } from '@/db/readingLogs';
import { listEpubFiles } from '@/db/epubFiles';
import { getSyncUrl, setSyncUrl as saveSyncUrl } from '@/db/syncMeta';
import { fetchNovelia, type NoveliaInfo } from '@/utils/novelia';
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

/** 可以从绿站抓取的字段（绿站书籍页没有「总卷数」，故不含）。 */
const SYNC_FIELDS = [
  { key: 'title_jp', label: '日文原名', pick: (i: NoveliaInfo) => i.titleJp },
  { key: 'author', label: '作者', pick: (i: NoveliaInfo) => i.author },
  { key: 'illustrator', label: '插画', pick: (i: NoveliaInfo) => i.illustrator },
  { key: 'publisher', label: '文库', pick: (i: NoveliaInfo) => i.publisher },
  { key: 'latest_publish_date', label: '最新出版', pick: (i: NoveliaInfo) => i.latestPublishDate },
] as const;

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
  onPress,
}: {
  label: string;
  values: string[];
  colorIndex: number;
  onPress?: () => void;
}) {
  if (!values.length) return null;
  const color = INFO_LABEL_COLORS[colorIndex % INFO_LABEL_COLORS.length];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [styles.chipRow, pressed && onPress ? styles.chipRowPressed : null]}
    >
      <View style={[styles.labelChip, { backgroundColor: color + '22' }]}>
        <Text style={[styles.labelChipText, { color }]}>{label}</Text>
      </View>
      <View style={styles.valueWrap}>
        {values.map((v, i) => (
          <View key={i} style={styles.valuePill}>
            <Text style={styles.valuePillText}>{v}</Text>
          </View>
        ))}
        {onPress ? (
          <MaterialCommunityIcons
            name="chevron-right"
            size={16}
            color={theme.colors.onSurfaceVariant}
            style={styles.rowChevron}
          />
        ) : null}
      </View>
    </Pressable>
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
  const [syncVisible, setSyncVisible] = useState(false);
  const [syncUrl, setSyncUrl] = useState('');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const [syncInfo, setSyncInfo] = useState<NoveliaInfo | null>(null);
  const [syncPicked, setSyncPicked] = useState<string[]>([]);

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

  /** 跳到书架并带上对应的快捷筛选。 */
  const goFilter = (p: {
    author?: string;
    publisher?: string;
    method?: string;
    tagId?: string;
    status?: string;
  }) => {
    router.push({ pathname: '/', params: { ...p, stamp: String(Date.now()) } });
  };

  /* ---------- 绿站抓取 ---------- */

  const openSync = async () => {
    setSyncError('');
    setSyncInfo(null);
    setSyncVisible(true);
    const stored = await getSyncUrl(db, bookId);
    setSyncUrl(stored ?? '');
  };

  const toggleSyncPick = (key: string) => {
    setSyncPicked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const onFetchSync = async () => {
    setSyncBusy(true);
    setSyncError('');
    try {
      const info = await fetchNovelia(syncUrl);
      setSyncInfo(info);
      setSyncVisible(false);
      setSyncPicked(
        SYNC_FIELDS.filter((f) => f.pick(info)).map((f) => f.key as string)
      );
    } catch (e) {
      setSyncError(e instanceof Error ? e.message : '抓取失败');
    } finally {
      setSyncBusy(false);
    }
  };

  const onApplySync = async () => {
    if (!syncInfo || !book) return;
    const { id: _id, created_at: _c, updated_at: _u, tags: _t, ...rest } = book;
    const draft = { ...rest } as typeof rest & Record<string, unknown>;
    for (const f of SYNC_FIELDS) {
      if (!syncPicked.includes(f.key)) continue;
      const value = f.pick(syncInfo);
      if (value) draft[f.key] = value;
    }
    await updateBook(db, bookId, draft as never);
    await saveSyncUrl(db, bookId, syncInfo.sourceUrl);
    setSyncInfo(null);
    await load();
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
            icon="cloud-download-outline"
            size={22}
            onPress={openSync}
            iconColor={theme.colors.onSurface}
          />
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

        {/* 资讯（标签优先；可点的条目会跳到书架对应筛选） */}
        <Text style={styles.sectionTitle}>资讯</Text>
        <View style={styles.infoSection}>
          {book.tags.length ? (
            <View style={styles.chipRow}>
              <View style={[styles.labelChip, { backgroundColor: INFO_LABEL_COLORS[0] + '22' }]}>
                <Text style={[styles.labelChipText, { color: INFO_LABEL_COLORS[0] }]}>标签</Text>
              </View>
              <View style={styles.valueWrap}>
                {book.tags.map((t) => (
                  <Pressable key={t.id} onPress={() => goFilter({ tagId: String(t.id) })}>
                    <TagChip label={t.name} color={t.group_color ?? undefined} />
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null}
          <InfoRow
            label="作者"
            values={infoValues(book.author)}
            colorIndex={1}
            onPress={book.author ? () => goFilter({ author: book.author as string }) : undefined}
          />
          <InfoRow label="插画" values={infoValues(book.illustrator)} colorIndex={2} />
          <InfoRow
            label="文库"
            values={infoValues(book.publisher)}
            colorIndex={3}
            onPress={book.publisher ? () => goFilter({ publisher: book.publisher as string }) : undefined}
          />
          <InfoRow
            label="最新出版"
            values={book.latest_publish_date ? [displayDate(book.latest_publish_date)] : []}
            colorIndex={4}
          />
          <InfoRow
            label="卷数"
            values={book.total_volumes != null ? [`共 ${trimNumber(book.total_volumes)} 卷`] : []}
            colorIndex={5}
          />
          <InfoRow
            label="方式"
            values={infoValues(book.reading_method)}
            colorIndex={6}
            onPress={book.reading_method ? () => goFilter({ method: book.reading_method as string }) : undefined}
          />
          <InfoRow
            label="购入"
            values={book.cost != null ? [formatMoney(book.cost)] : []}
            colorIndex={7}
          />
          <InfoRow
            label="回血"
            values={book.recovered != null ? [formatMoney(book.recovered)] : []}
            colorIndex={0}
          />
          <InfoRow
            label="评分"
            values={book.rating != null ? [`${book.rating} / 10`] : []}
            colorIndex={1}
          />
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

        {/* 绿站抓取：输入链接 */}
        <Dialog visible={syncVisible} onDismiss={() => setSyncVisible(false)}>
          <Dialog.Title>从绿站获取信息</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.dialogText}>
              粘贴这本书在绿站的页面链接（n.novelia.cc/wenku/…），会自动读取日文原名、作者、插画、文库与最新出版日期。
            </Text>
            <TextInput
              mode="outlined"
              value={syncUrl}
              onChangeText={setSyncUrl}
              placeholder="https://n.novelia.cc/wenku/…"
              autoCapitalize="none"
              autoCorrect={false}
              dense
              style={styles.urlInput}
            />
            {syncError ? <Text style={styles.syncError}>{syncError}</Text> : null}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSyncVisible(false)}>取消</Button>
            <Button
              onPress={onFetchSync}
              loading={syncBusy}
              disabled={syncBusy || !syncUrl.trim()}
            >
              抓取
            </Button>
          </Dialog.Actions>
        </Dialog>

        {/* 绿站抓取：结果预览 */}
        <Dialog visible={!!syncInfo} onDismiss={() => setSyncInfo(null)}>
          <Dialog.Title>抓取结果</Dialog.Title>
          <Dialog.Content>
            <ScrollView style={styles.syncList} showsVerticalScrollIndicator={false}>
              {SYNC_FIELDS.map((f) => {
                const next = syncInfo ? f.pick(syncInfo) : null;
                const current = syncInfo
                  ? ((book as unknown as Record<string, string | null>)[f.key] ?? null)
                  : null;
                const checked = syncPicked.includes(f.key);
                return (
                  <Pressable
                    key={f.key}
                    style={styles.syncRow}
                    onPress={() => next && toggleSyncPick(f.key)}
                    disabled={!next}
                  >
                    <Checkbox status={checked && next ? 'checked' : 'unchecked'} />
                    <View style={styles.syncTextWrap}>
                      <Text style={styles.syncLabel}>{f.label}</Text>
                      <Text style={styles.syncValue} numberOfLines={2}>
                        {next ?? '（页面没有这一项）'}
                      </Text>
                      {next && current && current !== next ? (
                        <Text style={styles.syncOld} numberOfLines={1}>
                          旧：{current}
                        </Text>
                      ) : null}
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setSyncInfo(null)}>取消</Button>
            <Button onPress={onApplySync} disabled={!syncPicked.length}>
              应用选中
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
    borderRadius: 12,
  },
  chipRowPressed: {
    opacity: 0.6,
  },
  rowChevron: {
    marginLeft: -2,
    marginBottom: 6,
  },
  labelChip: {
    width: 72,
    borderRadius: 999,
    paddingVertical: 5,
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
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
  urlInput: {
    marginTop: 12,
    backgroundColor: '#1A181E',
  },
  syncError: {
    marginTop: 8,
    fontSize: 12.5,
    color: theme.colors.error,
  },
  syncList: {
    maxHeight: 320,
  },
  syncRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  syncTextWrap: {
    flex: 1,
    marginLeft: 4,
  },
  syncLabel: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  syncValue: {
    fontSize: 14,
    color: theme.colors.onSurface,
    marginTop: 2,
  },
  syncOld: {
    fontSize: 11.5,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
    opacity: 0.7,
  },
});
