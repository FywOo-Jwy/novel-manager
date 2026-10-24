import { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { File, Paths } from 'expo-file-system';
import { Text, Button, IconButton, Chip, Dialog, Portal, TextInput, Snackbar } from 'react-native-paper';
import { theme } from '@/theme/theme';
import { EmptyState } from '@/components/EmptyState';
import { getBook, setBookCover } from '@/db/books';
import {
  listEpubFiles,
  addEpubFile,
  updateEpubFile,
  deleteEpubFile,
  setCoverSource,
} from '@/db/epubFiles';
import { EPUB_DIR, importFileToStorage, fileFromRel } from '@/utils/files';
import { extractEpubCoverToStorage } from '@/utils/epub';
import { parseOptionalNumber, trimNumber } from '@/utils/format';
import { EPUB_TYPES, type EpubFile, type EpubType } from '@/types/models';

interface AddState {
  visible: boolean;
  relPath: string;
  fileName: string;
  type: EpubType;
  volume: string;
}

export default function EpubManageScreen() {
  const db = useSQLiteContext();
  const { bookId: idParam } = useLocalSearchParams<{ bookId: string }>();
  const bookId = Number(idParam);

  const [title, setTitle] = useState('');
  const [epubs, setEpubs] = useState<EpubFile[]>([]);
  const [add, setAdd] = useState<AddState>({
    visible: false,
    relPath: '',
    fileName: '',
    type: '正文',
    volume: '1',
  });
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const [edit, setEdit] = useState<{ visible: boolean; id: number | null; volume: string; type: EpubType }>({
    visible: false,
    id: null,
    volume: '',
    type: '正文',
  });

  const load = useCallback(async () => {
    const [b, es] = await Promise.all([getBook(db, bookId), listEpubFiles(db, bookId)]);
    setTitle(b?.title_cn ?? '');
    setEpubs(es);
  }, [db, bookId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onPick = async () => {
    try {
      const res = await File.pickFileAsync({ mimeTypes: ['application/epub+zip'] });
      if (res.canceled || !res.result) return;
      const rel = await importFileToStorage(res.result, EPUB_DIR);
      setAdd({ visible: true, relPath: rel, fileName: res.result.name, type: '正文', volume: '1' });
    } catch {
      setToast('无法导入该文件');
    }
  };

  const onConfirmAdd = async () => {
    const volume = parseOptionalNumber(add.volume);
    setBusy(true);
    try {
      await addEpubFile(db, {
        book_id: bookId,
        file_path: add.relPath,
        volume_number: volume,
        type: add.type,
        is_cover_source: 0,
      });

      // Auto-extract cover from 正文 vol.1 when the book has no cover yet.
      if (add.type === '正文' && volume === 1) {
        const book = await getBook(db, bookId);
        if (book && !book.cover_path) {
          const bytes = await new File(Paths.document, add.relPath).bytes();
          const coverRel = await extractEpubCoverToStorage(bytes);
          if (coverRel) {
            await setBookCover(db, bookId, coverRel);
            const es = await listEpubFiles(db, bookId);
            const justAdded = es.find((e) => e.file_path === add.relPath);
            if (justAdded) await setCoverSource(db, justAdded.id, bookId);
          }
        }
      }

      setAdd((s) => ({ ...s, visible: false }));
      await load();
    } catch {
      setToast('添加失败');
    } finally {
      setBusy(false);
    }
  };

  const onOpen = async (rel: string | null) => {
    if (!rel) return;
    try {
      const f = fileFromRel(rel);
      if (f.exists) await f.preview({ mimeType: 'application/epub+zip' });
    } catch {
      // ignore
    }
  };

  const onExtractCover = async (e: EpubFile) => {
    if (!e.file_path) return;
    setBusy(true);
    try {
      const bytes = await new File(Paths.document, e.file_path).bytes();
      const coverRel = await extractEpubCoverToStorage(bytes);
      if (coverRel) {
        await setBookCover(db, bookId, coverRel);
        await setCoverSource(db, e.id, bookId);
        await load();
      } else {
        setToast('未在 epub 中找到封面');
      }
    } catch {
      setToast('封面提取失败');
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (e: EpubFile) => {
    await deleteEpubFile(db, e.id);
    await load();
  };

  const openEdit = (e: EpubFile) => {
    setEdit({
      visible: true,
      id: e.id,
      volume: e.volume_number != null ? String(e.volume_number) : '',
      type: e.type,
    });
  };

  const saveEdit = async () => {
    if (edit.id == null) return;
    setBusy(true);
    try {
      const target = epubs.find((e) => e.id === edit.id);
      if (!target) return;
      await updateEpubFile(db, edit.id, {
        ...target,
        volume_number: parseOptionalNumber(edit.volume),
        type: edit.type,
      });
      setEdit((s) => ({ ...s, visible: false }));
      await load();
    } catch {
      setToast('保存失败：同一卷号/类型已存在');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.bookTitle}>{title}</Text>
        <Text style={styles.hint}>绑定 epub 文件后会拷贝到应用内部存储，正文卷 1 会自动提取封面。</Text>

        {epubs.length === 0 ? (
          <EmptyState icon="file-cabinet" title="还没有绑定 epub" hint="点击下方按钮选择 epub 文件" />
        ) : (
          epubs.map((e) => (
            <View key={e.id} style={styles.epubRow}>
              <View style={styles.epubInfo}>
                <Chip compact style={styles.typeChip}>
                  {e.type}
                </Chip>
                <Text style={styles.epubVol}>
                  {e.volume_number != null ? `卷 ${trimNumber(e.volume_number)}` : '未标卷'}
                </Text>
                {e.is_cover_source ? <Text style={styles.coverSource}>封面来源</Text> : null}
              </View>
              <View style={styles.epubActions}>
                <IconButton icon="open-in-new" size={20} onPress={() => onOpen(e.file_path)} />
                <IconButton icon="pencil" size={20} onPress={() => openEdit(e)} />
                <IconButton icon="image-outline" size={20} onPress={() => onExtractCover(e)} />
                <IconButton icon="trash-can-outline" size={20} onPress={() => onDelete(e)} />
              </View>
            </View>
          ))
        )}

        <Button
          mode="contained"
          icon="plus"
          onPress={onPick}
          style={styles.pickBtn}
          contentStyle={styles.pickBtnContent}
          loading={busy}
        >
          添加 epub
        </Button>
      </ScrollView>

      <Portal>
        <Dialog visible={add.visible} onDismiss={() => setAdd((s) => ({ ...s, visible: false }))}>
          <Dialog.Title>绑定 epub</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.fileName}>{add.fileName}</Text>
            <Text style={styles.colorLabel}>类型</Text>
            <View style={styles.chipRow}>
              {EPUB_TYPES.map((t) => (
                <Chip
                  key={t}
                  selected={add.type === t}
                  onPress={() => setAdd((s) => ({ ...s, type: t }))}
                  style={styles.typeChoice}
                >
                  {t}
                </Chip>
              ))}
            </View>
            <TextInput
              value={add.volume}
              onChangeText={(v) => setAdd((s) => ({ ...s, volume: v }))}
              placeholder="卷号（短篇填序号）"
              mode="outlined"
              keyboardType="decimal-pad"
              style={styles.volumeInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAdd((s) => ({ ...s, visible: false }))}>取消</Button>
            <Button onPress={onConfirmAdd} loading={busy}>
              添加
            </Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={edit.visible} onDismiss={() => setEdit((s) => ({ ...s, visible: false }))}>
          <Dialog.Title>修改分卷</Dialog.Title>
          <Dialog.Content>
            <Text style={styles.colorLabel}>类型</Text>
            <View style={styles.chipRow}>
              {EPUB_TYPES.map((t) => (
                <Chip
                  key={t}
                  selected={edit.type === t}
                  onPress={() => setEdit((s) => ({ ...s, type: t }))}
                  style={styles.typeChoice}
                >
                  {t}
                </Chip>
              ))}
            </View>
            <TextInput
              value={edit.volume}
              onChangeText={(v) => setEdit((s) => ({ ...s, volume: v }))}
              placeholder="卷号（短篇填序号，可留空）"
              mode="outlined"
              keyboardType="decimal-pad"
              style={styles.volumeInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setEdit((s) => ({ ...s, visible: false }))}>取消</Button>
            <Button onPress={saveEdit} loading={busy}>
              保存
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={2000}>
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
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  bookTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: theme.colors.onSurface,
    marginTop: 8,
  },
  hint: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    marginTop: 4,
    marginBottom: 16,
  },
  epubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#1A181E',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 10,
  },
  epubInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  typeChip: {
    marginRight: 8,
  },
  epubVol: {
    color: theme.colors.onSurface,
  },
  coverSource: {
    marginLeft: 8,
    fontSize: 11,
    color: theme.colors.primary,
  },
  epubActions: {
    flexDirection: 'row',
  },
  pickBtn: {
    marginTop: 12,
    borderRadius: 999,
  },
  pickBtnContent: {
    height: 50,
  },
  fileName: {
    color: theme.colors.onSurfaceVariant,
    marginBottom: 12,
  },
  colorLabel: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
  },
  typeChoice: {
    marginRight: 8,
    marginBottom: 12,
  },
  volumeInput: {
    backgroundColor: '#1A181E',
    borderRadius: 12,
  },
});
