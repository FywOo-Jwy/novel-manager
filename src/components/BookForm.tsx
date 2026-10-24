import { useCallback, useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import {
  TextInput,
  Text,
  Button,
  Chip,
  IconButton,
  Dialog,
  Portal,
  HelperText,
} from 'react-native-paper';
import * as ImagePicker from 'expo-image-picker';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { File } from 'expo-file-system';
import { theme, TAG_COLORS } from '@/theme/theme';
import { CoverThumb } from '@/components/CoverThumb';
import { TagChip } from '@/components/TagChip';
import { getBookWithTags, createBook, updateBook, setBookTags, type BookDraft } from '@/db/books';
import { listTagGroups, listTags, createTag, createTagGroup, findTagByName } from '@/db/tags';
import { listPublishers, ensurePublisher } from '@/db/publishers';
import { listReadingLogs, replaceReadingLogs, type ReadingLogDraft } from '@/db/readingLogs';
import { parseOptionalNumber } from '@/utils/format';
import { COVER_DIR, importFileToStorage, deleteRelFile } from '@/utils/files';
import {
  READING_STATUSES,
  PUBLICATION_STATUSES,
  READING_METHODS,
  type ReadingStatus,
  type PublicationStatus,
  type ReadingMethod,
  type TagGroup,
  type TagWithGroup,
  type Publisher,
  type ReadingLog,
} from '@/types/models';

interface LogDraft {
  start_date: string;
  end_date: string;
  start_volume: string;
  end_volume: string;
}

function normalizeDateText(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  return t.replace(/[./]/g, '-');
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

function SingleChipSelect<T extends string>({
  options,
  value,
  onChange,
  allowClear,
}: {
  options: T[];
  value: T | null;
  onChange: (v: T | null) => void;
  allowClear?: boolean;
}) {
  return (
    <View style={styles.chipRow}>
      {allowClear ? (
        <Chip selected={value === null} onPress={() => onChange(null)} style={styles.choiceChip}>
          无
        </Chip>
      ) : null}
      {options.map((o) => (
        <Chip key={o} selected={value === o} onPress={() => onChange(o)} style={styles.choiceChip}>
          {o}
        </Chip>
      ))}
    </View>
  );
}

function logFromReadingLog(l: ReadingLog): LogDraft {
  return {
    start_date: l.start_date ?? '',
    end_date: l.end_date ?? '',
    start_volume: l.start_volume != null ? String(l.start_volume) : '',
    end_volume: l.end_volume != null ? String(l.end_volume) : '',
  };
}

export function BookForm({ bookId }: { bookId?: number }) {
  const db = useSQLiteContext();
  const isEdit = bookId != null;

  // text / number fields
  const [titleCn, setTitleCn] = useState('');
  const [titleJp, setTitleJp] = useState('');
  const [author, setAuthor] = useState('');
  const [illustrator, setIllustrator] = useState('');
  const [publisher, setPublisher] = useState('');
  const [totalVolumes, setTotalVolumes] = useState('');
  const [latestPublish, setLatestPublish] = useState('');
  const [cost, setCost] = useState('');
  const [recovered, setRecovered] = useState('');
  const [review, setReview] = useState('');
  const [rating, setRating] = useState<number | null>(null);

  // enum fields
  const [readingStatus, setReadingStatus] = useState<ReadingStatus>('未读');
  const [publicationStatus, setPublicationStatus] = useState<PublicationStatus | null>(null);
  const [readingMethod, setReadingMethod] = useState<ReadingMethod | null>(null);

  const [coverPath, setCoverPath] = useState<string | null>(null);

  // tags
  const [allTags, setAllTags] = useState<TagWithGroup[]>([]);
  const [groups, setGroups] = useState<TagGroup[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [expandedGroups, setExpandedGroups] = useState<number[]>([]);
  const [newTagName, setNewTagName] = useState('');

  // publishers (文库)
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [newPublisherName, setNewPublisherName] = useState('');
  const [groupDialogVisible, setGroupDialogVisible] = useState(false);
  const [pendingTagName, setPendingTagName] = useState('');
  const [newGroupMode, setNewGroupMode] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<string | null>(TAG_COLORS[0]);

  // reading logs
  const [logs, setLogs] = useState<LogDraft[]>([]);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [tags, gs, ps] = await Promise.all([listTags(db), listTagGroups(db), listPublishers(db)]);
    setAllTags(tags);
    setGroups(gs);
    setPublishers(ps);

    if (bookId != null) {
      const b = await getBookWithTags(db, bookId);
      if (b) {
        setTitleCn(b.title_cn);
        setTitleJp(b.title_jp ?? '');
        setAuthor(b.author ?? '');
        setIllustrator(b.illustrator ?? '');
        setPublisher(b.publisher ?? '');
        setTotalVolumes(b.total_volumes != null ? String(b.total_volumes) : '');
        setLatestPublish(b.latest_publish_date ?? '');
        setCost(b.cost != null ? String(b.cost) : '');
        setRecovered(b.recovered != null ? String(b.recovered) : '');
        setReview(b.review ?? '');
        setRating(b.rating);
        setReadingStatus(b.reading_status);
        setPublicationStatus(b.publication_status);
        setReadingMethod(b.reading_method);
        setCoverPath(b.cover_path);
        setSelectedTagIds(b.tags.map((t) => t.id));
      }
      const ls = await listReadingLogs(db, bookId);
      setLogs(ls.map(logFromReadingLog));
    }
  }, [db, bookId]);

  useEffect(() => {
    load();
  }, [load]);

  const onPickCover = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) return;
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 1,
      });
      if (res.canceled || !res.assets?.[0]) return;
      const src = new File(res.assets[0].uri);
      const rel = await importFileToStorage(src, COVER_DIR);
      if (coverPath) deleteRelFile(coverPath);
      setCoverPath(rel);
    } catch {
      // ignore pick errors
    }
  };

  const onRemoveCover = () => {
    if (coverPath) deleteRelFile(coverPath);
    setCoverPath(null);
  };

  const toggleTag = (id: number) => {
    setSelectedTagIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  };

  const toggleGroupOpen = (gid: number) => {
    setExpandedGroups((cur) => (cur.includes(gid) ? cur.filter((x) => x !== gid) : [...cur, gid]));
  };

  const onAddPublisher = async () => {
    const name = newPublisherName.trim();
    if (!name) return;
    await ensurePublisher(db, name);
    setPublishers(await listPublishers(db));
    setPublisher(name);
    setNewPublisherName('');
  };

  const onSubmitNewTag = async () => {
    const name = newTagName.trim();
    if (!name) return;
    const existing = await findTagByName(db, name);
    if (existing) {
      if (!selectedTagIds.includes(existing.id)) {
        setSelectedTagIds((cur) => [...cur, existing.id]);
      }
      setNewTagName('');
      return;
    }
    setPendingTagName(name);
    setNewGroupMode(false);
    setNewGroupName('');
    setNewGroupColor(TAG_COLORS[0]);
    setGroupDialogVisible(true);
  };

  const confirmNewTag = async (groupId: number | null) => {
    const tagId = await createTag(db, pendingTagName, groupId);
    setSelectedTagIds((cur) => [...cur, tagId]);
    setNewTagName('');
    setGroupDialogVisible(false);
    setPendingTagName('');
    const tags = await listTags(db);
    setAllTags(tags);
  };

  const confirmNewTagWithGroup = async () => {
    const gname = newGroupName.trim();
    if (!gname) return;
    const gid = await createTagGroup(db, gname, newGroupColor);
    setGroups(await listTagGroups(db));
    await confirmNewTag(gid);
  };

  const updateLog = (i: number, patch: Partial<LogDraft>) => {
    setLogs((cur) => cur.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  };

  const addLog = () => {
    setLogs((cur) => [...cur, { start_date: '', end_date: '', start_volume: '', end_volume: '' }]);
  };

  const removeLog = (i: number) => {
    setLogs((cur) => cur.filter((_, idx) => idx !== i));
  };

  const onSave = async () => {
    const title = titleCn.trim();
    if (!title) {
      setError('书名不能为空');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const pubName = publisher.trim();
      if (pubName) {
        await ensurePublisher(db, pubName);
      }
      const draft: BookDraft = {
        title_cn: title,
        title_jp: titleJp.trim() || null,
        author: author.trim() || null,
        illustrator: illustrator.trim() || null,
        publisher: pubName || null,
        total_volumes: parseOptionalNumber(totalVolumes),
        latest_publish_date: normalizeDateText(latestPublish),
        reading_status: readingStatus,
        publication_status: publicationStatus,
        reading_volume: null,
        reading_method: readingMethod,
        cost: parseOptionalNumber(cost),
        recovered: parseOptionalNumber(recovered),
        rating: rating != null ? Math.min(10, Math.max(1, Math.round(rating))) : null,
        review: review.trim() || null,
        cover_path: coverPath,
      };

      let id = bookId;
      if (id == null) {
        id = await createBook(db, draft);
      } else {
        await updateBook(db, id, draft);
      }

      await setBookTags(db, id, selectedTagIds);

      const logDrafts: ReadingLogDraft[] = logs
        .map((l) => ({
          book_id: id!,
          start_date: normalizeDateText(l.start_date),
          end_date: normalizeDateText(l.end_date),
          start_volume: parseOptionalNumber(l.start_volume),
          end_volume: parseOptionalNumber(l.end_volume),
        }))
        .filter((l) => l.start_date || l.end_date || l.start_volume != null || l.end_volume != null);
      await replaceReadingLogs(db, id, logDrafts);

      router.back();
    } finally {
      setSaving(false);
    }
  };

  const publisherOptions = Array.from(
    new Set([...publishers.map((p) => p.name), ...(publisher.trim() ? [publisher.trim()] : [])])
  );

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionLabel>封面</SectionLabel>
        <View style={styles.coverRow}>
          <CoverThumb path={coverPath} width={88} height={132} radius={8} />
          <View style={styles.coverActions}>
            <Button mode="outlined" onPress={onPickCover}>
              选择图片
            </Button>
            {coverPath ? (
              <Button onPress={onRemoveCover} textColor={theme.colors.error}>
                移除封面
              </Button>
            ) : null}
          </View>
        </View>

        <SectionLabel>书名（必填）</SectionLabel>
        <TextInput
          value={titleCn}
          onChangeText={setTitleCn}
          placeholder="书名"
          mode="outlined"
          style={styles.input}
        />

        <SectionLabel>原名（日文）</SectionLabel>
        <TextInput value={titleJp} onChangeText={setTitleJp} placeholder="原名" mode="outlined" style={styles.input} />

        <SectionLabel>作者 / 插画</SectionLabel>
        <TextInput value={author} onChangeText={setAuthor} placeholder="作者" mode="outlined" style={styles.input} />
        <TextInput value={illustrator} onChangeText={setIllustrator} placeholder="插画" mode="outlined" style={styles.input} />

        <SectionLabel>文库</SectionLabel>
        <View style={styles.chipRow}>
          <Chip selected={!publisher.trim()} onPress={() => setPublisher('')} style={styles.choiceChip}>
            无
          </Chip>
          {publisherOptions.map((name) => (
            <Chip
              key={name}
              selected={publisher === name}
              onPress={() => setPublisher(publisher === name ? '' : name)}
              style={styles.choiceChip}
            >
              {name}
            </Chip>
          ))}
        </View>
        <View style={styles.newTagRow}>
          <TextInput
            value={newPublisherName}
            onChangeText={setNewPublisherName}
            placeholder="新建文库…"
            mode="outlined"
            style={styles.newTagInput}
            onSubmitEditing={onAddPublisher}
          />
          <Button mode="contained-tonal" onPress={onAddPublisher}>
            添加
          </Button>
        </View>

        <SectionLabel>阅读状态</SectionLabel>
        <SingleChipSelect
          options={READING_STATUSES}
          value={readingStatus}
          onChange={(v) => v && setReadingStatus(v)}
        />

        <SectionLabel>作品状态</SectionLabel>
        <SingleChipSelect
          options={PUBLICATION_STATUSES}
          value={publicationStatus}
          onChange={setPublicationStatus}
          allowClear
        />

        <SectionLabel>阅读方式</SectionLabel>
        <SingleChipSelect options={READING_METHODS} value={readingMethod} onChange={setReadingMethod} allowClear />

        <SectionLabel>总卷数 / 最新一卷出版日期</SectionLabel>
        <View style={styles.twoCol}>
          <TextInput
            value={totalVolumes}
            onChangeText={setTotalVolumes}
            placeholder="总卷数"
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.halfInput}
          />
          <TextInput
            value={latestPublish}
            onChangeText={setLatestPublish}
            placeholder="最新出版 YYYY.MM.DD"
            mode="outlined"
            style={styles.halfInput}
          />
        </View>

        <SectionLabel>购入价 / 回血（人民币）</SectionLabel>
        <View style={styles.twoCol}>
          <TextInput
            value={cost}
            onChangeText={setCost}
            placeholder="购入价"
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.halfInput}
          />
          <TextInput
            value={recovered}
            onChangeText={setRecovered}
            placeholder="回血"
            mode="outlined"
            keyboardType="decimal-pad"
            style={styles.halfInput}
          />
        </View>

        <SectionLabel>评分（1–10）</SectionLabel>
        <View style={styles.chipRow}>
          <Chip selected={rating === null} onPress={() => setRating(null)} style={styles.choiceChip}>
            未评分
          </Chip>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <Chip key={n} selected={rating === n} onPress={() => setRating(n)} style={styles.choiceChip}>
              {n}
            </Chip>
          ))}
        </View>

        <SectionLabel>书评</SectionLabel>
        <TextInput
          value={review}
          onChangeText={setReview}
          placeholder="书评…"
          mode="outlined"
          multiline
          numberOfLines={4}
          style={styles.input}
        />

        <SectionLabel>标签</SectionLabel>
        {selectedTagIds.length ? (
          <View style={styles.tagWrap}>
            {allTags
              .filter((t) => selectedTagIds.includes(t.id))
              .map((t) => (
                <Chip key={t.id} selected onPress={() => toggleTag(t.id)} icon="check" style={styles.tagChip}>
                  {t.name}
                </Chip>
              ))}
          </View>
        ) : (
          <Text style={styles.hintText}>还没有选择标签，展开下面的分组挑选</Text>
        )}

        {groups.map((g) => {
          const gtags = allTags.filter((t) => t.group_id === g.id);
          const open = expandedGroups.includes(g.id);
          const picked = gtags.filter((t) => selectedTagIds.includes(t.id)).length;
          return (
            <View key={g.id} style={styles.tagGroup}>
              <Pressable onPress={() => toggleGroupOpen(g.id)} style={styles.tagGroupHeader}>
                <View style={[styles.groupDot, { backgroundColor: g.color ?? theme.colors.outline }]} />
                <Text style={styles.tagGroupName}>{g.name}</Text>
                <Text style={styles.tagGroupCount}>
                  {picked}/{gtags.length}
                </Text>
                <IconButton icon={open ? 'chevron-up' : 'chevron-down'} size={18} style={styles.groupChevron} />
              </Pressable>
              {open ? (
                <View style={styles.tagWrap}>
                  {gtags.length ? (
                    gtags.map((t) => (
                      <Chip
                        key={t.id}
                        selected={selectedTagIds.includes(t.id)}
                        onPress={() => toggleTag(t.id)}
                        style={styles.tagChip}
                      >
                        {t.name}
                      </Chip>
                    ))
                  ) : (
                    <Text style={styles.hintText}>该分组暂无标签</Text>
                  )}
                </View>
              ) : null}
            </View>
          );
        })}

        {(() => {
          const ungrouped = allTags.filter((t) => t.group_id == null);
          if (!ungrouped.length) return null;
          const open = expandedGroups.includes(-1);
          const picked = ungrouped.filter((t) => selectedTagIds.includes(t.id)).length;
          return (
            <View style={styles.tagGroup}>
              <Pressable onPress={() => toggleGroupOpen(-1)} style={styles.tagGroupHeader}>
                <View style={[styles.groupDot, { backgroundColor: theme.colors.outline }]} />
                <Text style={styles.tagGroupName}>未分组</Text>
                <Text style={styles.tagGroupCount}>
                  {picked}/{ungrouped.length}
                </Text>
                <IconButton icon={open ? 'chevron-up' : 'chevron-down'} size={18} style={styles.groupChevron} />
              </Pressable>
              {open ? (
                <View style={styles.tagWrap}>
                  {ungrouped.map((t) => (
                    <Chip
                      key={t.id}
                      selected={selectedTagIds.includes(t.id)}
                      onPress={() => toggleTag(t.id)}
                      style={styles.tagChip}
                    >
                      {t.name}
                    </Chip>
                  ))}
                </View>
              ) : null}
            </View>
          );
        })()}
        <View style={styles.newTagRow}>
          <TextInput
            value={newTagName}
            onChangeText={setNewTagName}
            placeholder="新建标签…"
            mode="outlined"
            style={styles.newTagInput}
            onSubmitEditing={onSubmitNewTag}
          />
          <Button mode="contained-tonal" onPress={onSubmitNewTag}>
            添加
          </Button>
        </View>

        <SectionLabel>阅读时间段</SectionLabel>
        {logs.map((l, i) => (
          <View key={i} style={styles.logCard}>
            <View style={styles.logCardHeader}>
              <Text style={styles.logCardTitle}>时间段 {i + 1}</Text>
              <IconButton icon="close" size={20} onPress={() => removeLog(i)} />
            </View>
            <View style={styles.twoCol}>
              <TextInput
                value={l.start_date}
                onChangeText={(v) => updateLog(i, { start_date: v })}
                placeholder="开始 YYYY.MM.DD"
                mode="outlined"
                style={styles.halfInput}
              />
              <TextInput
                value={l.end_date}
                onChangeText={(v) => updateLog(i, { end_date: v })}
                placeholder="结束 YYYY.MM.DD"
                mode="outlined"
                style={styles.halfInput}
              />
            </View>
            <View style={styles.twoCol}>
              <TextInput
                value={l.start_volume}
                onChangeText={(v) => updateLog(i, { start_volume: v })}
                placeholder="起始卷"
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.halfInput}
              />
              <TextInput
                value={l.end_volume}
                onChangeText={(v) => updateLog(i, { end_volume: v })}
                placeholder="结束卷"
                mode="outlined"
                keyboardType="decimal-pad"
                style={styles.halfInput}
              />
            </View>
          </View>
        ))}
        <Button mode="outlined" icon="plus" onPress={addLog} style={styles.addLogBtn}>
          添加时间段
        </Button>

        {error ? <HelperText type="error">{error}</HelperText> : null}

        <Pressable
          onPress={onSave}
          disabled={saving}
          style={({ pressed }) => [
            styles.saveBtn,
            { opacity: pressed || saving ? 0.85 : 1 },
          ]}
        >
          {saving ? (
            <ActivityIndicator size="small" color={theme.colors.onPrimary} />
          ) : (
            <Text style={styles.saveBtnText}>{isEdit ? '保存' : '添加书籍'}</Text>
          )}
        </Pressable>
      </ScrollView>

      <Portal>
        <Dialog visible={groupDialogVisible} onDismiss={() => setGroupDialogVisible(false)}>
          <Dialog.Title>选择标签分组</Dialog.Title>
          <Dialog.Content>
            {newGroupMode ? (
              <>
                <TextInput
                  value={newGroupName}
                  onChangeText={setNewGroupName}
                  placeholder="分组名称"
                  mode="outlined"
                  style={styles.dialogInput}
                />
                <View style={styles.colorRow}>
                  {TAG_COLORS.map((c) => (
                    <IconButton
                      key={c}
                      icon={newGroupColor === c ? 'check-circle' : 'circle'}
                      iconColor={c}
                      size={24}
                      onPress={() => setNewGroupColor(c)}
                    />
                  ))}
                </View>
                <View style={styles.dialogActionsRow}>
                  <Button onPress={() => setNewGroupMode(false)}>返回</Button>
                  <Button mode="contained" onPress={confirmNewTagWithGroup}>
                    创建并添加
                  </Button>
                </View>
              </>
            ) : (
              <>
                <Button mode="text" onPress={() => confirmNewTag(null)}>
                  无分组
                </Button>
                {groups.map((g) => (
                  <View key={g.id} style={styles.groupRow}>
                    <Button mode="text" onPress={() => confirmNewTag(g.id)}>
                      {g.name}
                    </Button>
                    {g.color ? <IconButton icon="circle" iconColor={g.color} size={16} disabled /> : null}
                  </View>
                ))}
                <Button mode="text" onPress={() => setNewGroupMode(true)}>
                  + 新建分组
                </Button>
              </>
            )}
          </Dialog.Content>
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: theme.colors.primary,
    marginTop: 20,
    marginBottom: 8,
  },
  coverRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  coverActions: {
    marginLeft: 16,
  },
  input: {
    marginBottom: 8,
    backgroundColor: '#1A181E',
    borderRadius: 12,
  },
  twoCol: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  halfInput: {
    flex: 1,
    marginBottom: 8,
    backgroundColor: '#1A181E',
    borderRadius: 12,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  choiceChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  tagChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  hintText: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    opacity: 0.8,
    marginBottom: 8,
  },
  tagGroup: {
    backgroundColor: '#1A181E',
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  tagGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingVertical: 4,
  },
  groupDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  tagGroupName: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.onSurface,
  },
  tagGroupCount: {
    fontSize: 12,
    color: theme.colors.onSurfaceVariant,
  },
  groupChevron: {
    margin: 0,
  },
  newTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  newTagInput: {
    flex: 1,
    marginRight: 8,
    backgroundColor: '#1A181E',
    borderRadius: 12,
  },
  logCard: {
    backgroundColor: '#1A181E',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
  },
  logCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logCardTitle: {
    color: theme.colors.onSurfaceVariant,
    fontWeight: '600',
  },
  addLogBtn: {
    marginTop: 4,
    borderRadius: 999,
  },
  saveBtn: {
    marginTop: 24,
    height: 52,
    borderRadius: 999,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: theme.colors.onPrimary,
  },
  saveBtnContent: {
    height: 52,
  },
  dialogInput: {
    marginBottom: 12,
    backgroundColor: '#1A181E',
    borderRadius: 12,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dialogActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  groupRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
