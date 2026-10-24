import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View, Pressable } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { router } from 'expo-router';
import {
  Button,
  Checkbox,
  Chip,
  Dialog,
  Divider,
  Portal,
  Snackbar,
  Text,
  TextInput,
} from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '@/theme/theme';
import { getBook, listBooks, setBookCover } from '@/db/books';
import { addEpubFile, setCoverSource, listEpubFiles } from '@/db/epubFiles';
import { EPUB_DIR, importFileToStorage } from '@/utils/files';
import { extractEpubCoverToStorage, readEpubMeta } from '@/utils/epub';
import { guessTypeFromName, guessVolumeFromName, matchBook } from '@/utils/match';
import { parseOptionalNumber, trimNumber } from '@/utils/format';
import type { Book, EpubType } from '@/types/models';
import { EPUB_TYPES } from '@/types/models';

interface BatchRow {
  key: string;
  file: File;
  fileName: string;
  volume: string;
  type: EpubType;
  book: Book | null;
  autoMatched: boolean;
  selected: boolean;
  /** true when the epub was already copied into storage during this session */
  imported: boolean;
}

function boundKey(bookId: number, type: string, volume: number | null): string {
  return `${bookId}|${type}|${volume ?? 'null'}`;
}

export default function BatchEpubScreen() {
  const db = useSQLiteContext();

  const [books, setBooks] = useState<Book[]>([]);
  const [bound, setBound] = useState<Set<string>>(new Set());
  const [rows, setRows] = useState<BatchRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [toast, setToast] = useState('');

  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [bookQuery, setBookQuery] = useState('');

  const loadRefs = useCallback(async () => {
    const [bs, eps] = await Promise.all([
      listBooks(db, { sort: { key: 'title_cn', direction: 'asc' } }),
      db.getAllAsync<{ book_id: number; type: string; volume_number: number | null }>(
        'SELECT book_id, type, volume_number FROM epub_files'
      ),
    ]);
    setBooks(bs);
    setBound(new Set(eps.map((e) => boundKey(e.book_id, e.type, e.volume_number))));
  }, [db]);

  useEffect(() => {
    loadRefs();
  }, [loadRefs]);

  const isDuplicate = useCallback(
    (r: BatchRow): boolean => {
      if (!r.book) return false;
      return bound.has(boundKey(r.book.id, r.type, parseOptionalNumber(r.volume)));
    },
    [bound]
  );

  const updateRow = (key: string, patch: Partial<BatchRow>) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  };

  /* 1. 多选 epub，逐个猜测书籍 / 卷号 / 类型 */
  const onPick = async () => {
    let picked: File[] = [];
    try {
      const res = await File.pickFileAsync({
        mimeTypes: ['application/epub+zip'],
        multipleFiles: true,
      });
      if (res.canceled || !res.result) return;
      picked = res.result;
    } catch {
      setToast('无法读取所选文件');
      return;
    }
    if (!picked.length) return;

    setBusy(true);
    const next: BatchRow[] = [];
    try {
      for (let i = 0; i < picked.length; i++) {
        const f = picked[i];
        setProgress(`正在分析 ${i + 1}/${picked.length}`);

        const fileName = f.name || '未命名.epub';
        const base = fileName.replace(/\.[^.]+$/, '');

        let type: EpubType = guessTypeFromName(fileName);
        let volume = guessVolumeFromName(fileName);
        let book = matchBook(books, [base]);

        // 文件名没匹配上时，读取 epub 内嵌书名再试一次
        if (!book) {
          try {
            const bytes = await f.bytes();
            const meta = await readEpubMeta(bytes);
            if (meta.title) {
              book = matchBook(books, [base, meta.title]);
              if (type === '正文') type = guessTypeFromName(meta.title);
              if (volume == null) volume = guessVolumeFromName(meta.title);
            }
          } catch {
            // 解析失败就保留文件名结果
          }
        }

        const draft: BatchRow = {
          key: `${i}-${fileName}`,
          file: f,
          fileName,
          volume: volume != null ? trimNumber(volume) : '',
          type,
          book,
          autoMatched: !!book,
          selected: !!book,
          imported: false,
        };
        if (draft.book && bound.has(boundKey(draft.book.id, draft.type, volume))) {
          draft.selected = false;
        }
        next.push(draft);
      }
      setRows((prev) => [...prev, ...next]);
    } finally {
      setProgress('');
      setBusy(false);
    }
  };

  /* 2. 批量入库 */
  const onImport = async () => {
    const targets = rows.filter((r) => r.selected && r.book && !r.imported && !isDuplicate(r));
    if (!targets.length) {
      setToast('没有可导入的行');
      return;
    }
    setBusy(true);
    let ok = 0;
    let fail = 0;
    const newlyBound: string[] = [];

    try {
      for (let i = 0; i < targets.length; i++) {
        const r = targets[i];
        setProgress(`正在导入 ${i + 1}/${targets.length}`);
        const bookId = r.book!.id;
        try {
          const rel = await importFileToStorage(r.file, EPUB_DIR);
          const volume = parseOptionalNumber(r.volume);
          await addEpubFile(db, {
            book_id: bookId,
            file_path: rel,
            volume_number: volume,
            type: r.type,
            is_cover_source: 0,
          });

          // 正文卷 1 且该书还没有封面 → 自动提取封面
          if (r.type === '正文' && volume === 1) {
            const book = await getBook(db, bookId);
            if (book && !book.cover_path) {
              const bytes = await new File(Paths.document, rel).bytes();
              const coverRel = await extractEpubCoverToStorage(bytes);
              if (coverRel) {
                await setBookCover(db, bookId, coverRel);
                const es = await listEpubFiles(db, bookId);
                const just = es.find((e) => e.file_path === rel);
                if (just) await setCoverSource(db, just.id, bookId);
              }
            }
          }

          newlyBound.push(boundKey(bookId, r.type, volume));
          updateRow(r.key, { imported: true, selected: false });
          ok++;
        } catch {
          fail++;
        }
      }
    } finally {
      setBound((prev) => {
        const next = new Set(prev);
        newlyBound.forEach((k) => next.add(k));
        return next;
      });
      setProgress('');
      setBusy(false);
    }

    setToast(`完成：成功 ${ok} 个${fail ? `，失败 ${fail} 个` : ''}`);
  };

  const selectedCount = rows.filter((r) => r.selected && r.book && !r.imported && !isDuplicate(r)).length;

  const filteredBooks = useMemo(() => {
    const q = bookQuery.trim().toLowerCase();
    if (!q) return books;
    return books.filter(
      (b) =>
        b.title_cn.toLowerCase().includes(q) ||
        (b.title_jp ?? '').toLowerCase().includes(q) ||
        (b.author ?? '').toLowerCase().includes(q)
    );
  }, [books, bookQuery]);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.hint}>
          一次选择多个 epub，自动按文件名 / 内嵌书名匹配书籍，并猜测卷号与类型。确认无误后批量入库。
        </Text>

        {rows.length === 0 ? (
          <View style={styles.emptyBox}>
            <MaterialCommunityIcons
              name="file-multiple-outline"
              size={44}
              color={theme.colors.onSurfaceVariant}
            />
            <Text style={styles.emptyTitle}>还没有选择文件</Text>
            <Text style={styles.emptyHint}>点击下方「选择 epub 文件」，可多选</Text>
          </View>
        ) : (
          rows.map((r) => {
            const dup = isDuplicate(r);
            return (
              <View key={r.key} style={[styles.row, (dup || r.imported) && styles.rowDone]}>
                <Checkbox
                  status={r.selected && !dup && !r.imported ? 'checked' : 'unchecked'}
                  onPress={() => updateRow(r.key, { selected: !r.selected })}
                  disabled={dup || r.imported}
                />

                <View style={styles.rowBody}>
                  <Text numberOfLines={1} style={styles.fileName}>
                    {r.fileName}
                  </Text>

                  <Pressable onPress={() => setPickerKey(r.key)}>
                    <View style={styles.matchLine}>
                      <MaterialCommunityIcons
                        name={r.book ? 'book-check-outline' : 'book-alert-outline'}
                        size={15}
                        color={r.book ? theme.colors.primary : '#F2C48A'}
                      />
                      <Text
                        numberOfLines={1}
                        style={[styles.bookName, !r.book && styles.bookNameMissing]}
                      >
                        {r.book ? r.book.title_cn : '未匹配 · 点此选择书籍'}
                      </Text>
                    </View>
                  </Pressable>

                  <View style={styles.controlLine}>
                    <Chip
                      compact
                      onPress={() => {
                        const idx = EPUB_TYPES.indexOf(r.type);
                        const nextType = EPUB_TYPES[(idx + 1) % EPUB_TYPES.length];
                        updateRow(r.key, { type: nextType });
                      }}
                      style={styles.typeChip}
                    >
                      {r.type}
                    </Chip>
                    <TextInput
                      value={r.volume}
                      onChangeText={(v) => updateRow(r.key, { volume: v })}
                      mode="outlined"
                      dense
                      placeholder="卷"
                      keyboardType="decimal-pad"
                      style={styles.volInput}
                    />
                    {dup ? <Text style={styles.dupText}>已绑定</Text> : null}
                    {r.imported ? <Text style={styles.doneText}>已导入</Text> : null}
                  </View>
                </View>
              </View>
            );
          })
        )}

        <Button
          mode="contained"
          onPress={onPick}
          style={styles.pickBtn}
          contentStyle={styles.pillContent}
          disabled={busy}
        >
          {rows.length ? '继续选择文件' : '选择 epub 文件'}
        </Button>

        {rows.length ? (
          <Button
            mode="contained"
            onPress={onImport}
            style={styles.importBtn}
            contentStyle={styles.pillContent}
            disabled={busy || selectedCount === 0}
            loading={busy}
          >
            导入选中（{selectedCount}）
          </Button>
        ) : null}

        {busy && progress ? (
          <View style={styles.progressBox}>
            <ActivityIndicator size="small" color={theme.colors.primary} />
            <Text style={styles.progressText}>{progress}</Text>
          </View>
        ) : null}
      </ScrollView>

      <Portal>
        <Dialog
          visible={pickerKey != null}
          onDismiss={() => {
            setPickerKey(null);
            setBookQuery('');
          }}
          style={styles.pickerDialog}
        >
          <Dialog.Title>选择书籍</Dialog.Title>
          <Dialog.Content>
            <TextInput
              mode="outlined"
              dense
              placeholder="搜索书名 / 作者"
              value={bookQuery}
              onChangeText={setBookQuery}
              style={styles.searchInput}
            />
            <Divider style={styles.pickerDivider} />
            <ScrollView style={styles.bookList}>
              {filteredBooks.length === 0 ? (
                <Text style={styles.noBook}>没有匹配的书籍</Text>
              ) : (
                filteredBooks.map((b) => (
                  <Pressable
                    key={b.id}
                    style={styles.bookOption}
                    onPress={() => {
                      if (!pickerKey) return;
                      const row = rows.find((x) => x.key === pickerKey);
                      updateRow(pickerKey, {
                        book: b,
                        selected: row ? !row.imported : true,
                      });
                      setPickerKey(null);
                      setBookQuery('');
                    }}
                  >
                    <Text numberOfLines={1} style={styles.bookOptionText}>
                      {b.title_cn}
                    </Text>
                    {b.author ? <Text style={styles.bookOptionAuthor}>{b.author}</Text> : null}
                  </Pressable>
                ))
              )}
            </ScrollView>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={() => {
                setPickerKey(null);
                setBookQuery('');
              }}
            >
              关闭
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={2600}>
        {toast}
      </Snackbar>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 48,
  },
  hint: {
    fontSize: 13,
    lineHeight: 19,
    color: theme.colors.onSurfaceVariant,
    marginTop: 8,
    marginBottom: 14,
  },
  emptyBox: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyTitle: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  emptyHint: {
    marginTop: 4,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#1A181E',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 10,
  },
  rowDone: {
    opacity: 0.55,
  },
  rowBody: {
    flex: 1,
    paddingRight: 4,
  },
  fileName: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  matchLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  bookName: {
    marginLeft: 6,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.onSurface,
    flex: 1,
  },
  bookNameMissing: {
    color: '#F2C48A',
    fontWeight: '500',
  },
  controlLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  typeChip: {
    marginRight: 8,
  },
  volInput: {
    width: 74,
    height: 38,
    backgroundColor: theme.colors.background,
    fontSize: 13,
  },
  dupText: {
    marginLeft: 8,
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  doneText: {
    marginLeft: 8,
    fontSize: 12,
    color: theme.colors.primary,
  },
  pickBtn: {
    marginTop: 8,
    borderRadius: 999,
    height: 50,
  },
  importBtn: {
    marginTop: 10,
    borderRadius: 999,
    height: 50,
  },
  pillContent: {
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  progressBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 14,
  },
  progressText: {
    marginLeft: 8,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  pickerDialog: {
    maxHeight: '80%',
  },
  searchInput: {
    backgroundColor: theme.colors.background,
  },
  pickerDivider: {
    marginVertical: 10,
  },
  bookList: {
    maxHeight: 320,
  },
  bookOption: {
    paddingVertical: 10,
    borderRadius: 12,
    paddingHorizontal: 8,
  },
  bookOptionText: {
    fontSize: 15,
    color: theme.colors.onSurface,
  },
  bookOptionAuthor: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
    marginTop: 2,
  },
  noBook: {
    paddingVertical: 20,
    textAlign: 'center',
    color: theme.colors.onSurfaceVariant,
  },
});
