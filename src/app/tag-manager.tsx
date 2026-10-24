import { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { useFocusEffect } from 'expo-router';
import { Text, Button, IconButton, Dialog, Portal, TextInput, FAB, Divider, Snackbar } from 'react-native-paper';
import { theme, TAG_COLORS } from '@/theme/theme';
import { TagChip } from '@/components/TagChip';
import { EmptyState } from '@/components/EmptyState';
import {
  listTagGroups,
  listTags,
  createTagGroup,
  updateTagGroup,
  deleteTagGroup,
  createTag,
  updateTag,
  deleteTag,
  countTagsInGroup,
} from '@/db/tags';
import {
  listPublishers,
  ensurePublisher,
  renamePublisher,
  deletePublisher,
  countBooksInPublisher,
} from '@/db/publishers';
import type { Publisher, TagGroup, TagWithGroup } from '@/types/models';

interface GroupDialogState {
  visible: boolean;
  editingId: number | null;
  name: string;
  color: string | null;
}

interface TagDialogState {
  visible: boolean;
  editingId: number | null;
  name: string;
  groupId: number | null;
}

interface PublisherDialogState {
  visible: boolean;
  editingId: number | null;
  name: string;
}

export default function TagManagerScreen() {
  const db = useSQLiteContext();
  const [groups, setGroups] = useState<TagGroup[]>([]);
  const [tags, setTags] = useState<TagWithGroup[]>([]);

  const [groupDialog, setGroupDialog] = useState<GroupDialogState>({
    visible: false,
    editingId: null,
    name: '',
    color: TAG_COLORS[0],
  });
  const [tagDialog, setTagDialog] = useState<TagDialogState>({
    visible: false,
    editingId: null,
    name: '',
    groupId: null,
  });
  const [publishers, setPublishers] = useState<Publisher[]>([]);
  const [publisherDialog, setPublisherDialog] = useState<PublisherDialogState>({
    visible: false,
    editingId: null,
    name: '',
  });
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const [gs, ts, ps] = await Promise.all([listTagGroups(db), listTags(db), listPublishers(db)]);
    setGroups(gs);
    setTags(ts);
    setPublishers(ps);
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openNewGroup = () => {
    setGroupDialog({ visible: true, editingId: null, name: '', color: TAG_COLORS[0] });
  };

  const openEditGroup = (g: TagGroup) => {
    setGroupDialog({ visible: true, editingId: g.id, name: g.name, color: g.color ?? TAG_COLORS[0] });
  };

  const saveGroup = async () => {
    const name = groupDialog.name.trim();
    if (!name) return;
    if (groupDialog.editingId == null) {
      await createTagGroup(db, name, groupDialog.color);
    } else {
      await updateTagGroup(db, groupDialog.editingId, name, groupDialog.color);
    }
    setGroupDialog((s) => ({ ...s, visible: false }));
    await load();
  };

  const onDeleteGroup = async (g: TagGroup) => {
    const c = await countTagsInGroup(db, g.id);
    if (c > 0) {
      return; // spec: only delete empty groups
    }
    await deleteTagGroup(db, g.id);
    await load();
  };

  const openNewTag = (groupId: number | null = null) => {
    setTagDialog({ visible: true, editingId: null, name: '', groupId });
  };

  const openEditTag = (t: TagWithGroup) => {
    setTagDialog({ visible: true, editingId: t.id, name: t.name, groupId: t.group_id });
  };

  const saveTag = async () => {
    const name = tagDialog.name.trim();
    if (!name) return;
    if (tagDialog.editingId == null) {
      await createTag(db, name, tagDialog.groupId);
    } else {
      await updateTag(db, tagDialog.editingId, name, tagDialog.groupId);
    }
    setTagDialog((s) => ({ ...s, visible: false }));
    await load();
  };

  const onDeleteTag = async (t: TagWithGroup) => {
    await deleteTag(db, t.id);
    await load();
  };

  const openNewPublisher = () => {
    setPublisherDialog({ visible: true, editingId: null, name: '' });
  };

  const openEditPublisher = (p: Publisher) => {
    setPublisherDialog({ visible: true, editingId: p.id, name: p.name });
  };

  const savePublisher = async () => {
    const name = publisherDialog.name.trim();
    if (!name) return;
    if (publisherDialog.editingId == null) {
      await ensurePublisher(db, name);
    } else {
      await renamePublisher(db, publisherDialog.editingId, name);
    }
    setPublisherDialog((s) => ({ ...s, visible: false }));
    await load();
  };

  const onDeletePublisher = async (p: Publisher) => {
    const c = await countBooksInPublisher(db, p.name);
    if (c > 0) {
      setNotice(`「${p.name}」还有 ${c} 本书在用，先把它们的文库改掉再删`);
      return;
    }
    await deletePublisher(db, p.id);
    await load();
  };

  const ungrouped = tags.filter((t) => t.group_id == null);

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {groups.length === 0 && tags.length === 0 ? (
          <EmptyState icon="tag-outline" title="还没有标签" hint="创建分组和标签来归类你的藏书" />
        ) : null}

        {groups.map((g) => {
          const gtags = tags.filter((t) => t.group_id === g.id);
          return (
            <View key={g.id} style={styles.groupBlock}>
              <View style={styles.groupHeader}>
                <View style={styles.groupTitleRow}>
                  {g.color ? <IconButton icon="circle" iconColor={g.color} size={18} disabled /> : null}
                  <Text style={styles.groupName}>{g.name}</Text>
                  <Text style={styles.groupCount}>{gtags.length}</Text>
                </View>
                <View style={styles.groupActions}>
                  <IconButton icon="pencil" size={20} onPress={() => openEditGroup(g)} />
                  <IconButton icon="trash-can-outline" size={20} onPress={() => onDeleteGroup(g)} />
                </View>
              </View>
              <View style={styles.tagWrap}>
                {gtags.map((t) => (
                  <View key={t.id} style={styles.tagRow}>
                    <TagChip label={t.name} color={g.color ?? undefined} />
                    <IconButton icon="pencil" size={16} onPress={() => openEditTag(t)} />
                    <IconButton icon="close" size={16} onPress={() => onDeleteTag(t)} />
                  </View>
                ))}
                <Button mode="text" compact onPress={() => openNewTag(g.id)}>
                  + 标签
                </Button>
              </View>
            </View>
          );
        })}

        {ungrouped.length ? (
          <View style={styles.groupBlock}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupName}>未分组</Text>
            </View>
            <View style={styles.tagWrap}>
              {ungrouped.map((t) => (
                <View key={t.id} style={styles.tagRow}>
                  <TagChip label={t.name} />
                  <IconButton icon="pencil" size={16} onPress={() => openEditTag(t)} />
                  <IconButton icon="close" size={16} onPress={() => onDeleteTag(t)} />
                </View>
              ))}
              <Button mode="text" compact onPress={() => openNewTag(null)}>
                + 标签
              </Button>
            </View>
          </View>
        ) : null}

        {/* 文库：与标签同类的清单，但不分组 */}
        <View style={styles.groupBlock}>
          <View style={styles.groupHeader}>
            <View style={styles.groupTitleRow}>
              <Text style={styles.groupName}>文库</Text>
              <Text style={styles.groupCount}>{publishers.length}</Text>
            </View>
            <View style={styles.groupActions}>
              <IconButton icon="plus" size={20} onPress={openNewPublisher} />
            </View>
          </View>
          <View style={styles.tagWrap}>
            {publishers.length === 0 ? (
              <Text style={styles.groupCount}>还没有文库，点右上角 + 添加</Text>
            ) : null}
            {publishers.map((p) => (
              <View key={p.id} style={styles.tagRow}>
                <TagChip label={p.name} />
                <IconButton icon="pencil" size={16} onPress={() => openEditPublisher(p)} />
                <IconButton icon="close" size={16} onPress={() => onDeletePublisher(p)} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.footerActions}>
          <Button mode="outlined" icon="plus" onPress={openNewGroup} style={styles.footerBtn}>
            新建分组
          </Button>
          <Button mode="outlined" icon="tag-plus" onPress={() => openNewTag(null)} style={styles.footerBtn}>
            新建标签
          </Button>
        </View>
      </ScrollView>

      <Portal>
        <Dialog visible={groupDialog.visible} onDismiss={() => setGroupDialog((s) => ({ ...s, visible: false }))}>
          <Dialog.Title>{groupDialog.editingId == null ? '新建分组' : '编辑分组'}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              value={groupDialog.name}
              onChangeText={(v) => setGroupDialog((s) => ({ ...s, name: v }))}
              placeholder="分组名称"
              mode="outlined"
              style={styles.dialogInput}
            />
            <Text style={styles.colorLabel}>颜色</Text>
            <View style={styles.colorRow}>
              {TAG_COLORS.map((c) => (
                <IconButton
                  key={c}
                  icon={groupDialog.color === c ? 'check-circle' : 'circle'}
                  iconColor={c}
                  size={24}
                  onPress={() => setGroupDialog((s) => ({ ...s, color: c }))}
                />
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setGroupDialog((s) => ({ ...s, visible: false }))}>取消</Button>
            <Button onPress={saveGroup}>保存</Button>
          </Dialog.Actions>
        </Dialog>

        <Dialog visible={tagDialog.visible} onDismiss={() => setTagDialog((s) => ({ ...s, visible: false }))}>
          <Dialog.Title>{tagDialog.editingId == null ? '新建标签' : '编辑标签'}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              value={tagDialog.name}
              onChangeText={(v) => setTagDialog((s) => ({ ...s, name: v }))}
              placeholder="标签名称"
              mode="outlined"
              style={styles.dialogInput}
            />
            <Text style={styles.colorLabel}>分组</Text>
            <View style={styles.groupPicker}>
              <Button
                mode={tagDialog.groupId == null ? 'contained-tonal' : 'outlined'}
                compact
                onPress={() => setTagDialog((s) => ({ ...s, groupId: null }))}
              >
                无分组
              </Button>
              {groups.map((g) => (
                <Button
                  key={g.id}
                  mode={tagDialog.groupId === g.id ? 'contained-tonal' : 'outlined'}
                  compact
                  onPress={() => setTagDialog((s) => ({ ...s, groupId: g.id }))}
                >
                  {g.name}
                </Button>
              ))}
            </View>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setTagDialog((s) => ({ ...s, visible: false }))}>取消</Button>
            <Button onPress={saveTag}>保存</Button>
          </Dialog.Actions>
        </Dialog>
        <Dialog
          visible={publisherDialog.visible}
          onDismiss={() => setPublisherDialog((s) => ({ ...s, visible: false }))}
        >
          <Dialog.Title>{publisherDialog.editingId == null ? '新建文库' : '编辑文库'}</Dialog.Title>
          <Dialog.Content>
            <TextInput
              value={publisherDialog.name}
              onChangeText={(v) => setPublisherDialog((s) => ({ ...s, name: v }))}
              placeholder="文库名称"
              mode="outlined"
              style={styles.dialogInput}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setPublisherDialog((s) => ({ ...s, visible: false }))}>取消</Button>
            <Button onPress={savePublisher}>保存</Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!notice} onDismiss={() => setNotice('')} duration={3000}>
        {notice}
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
    paddingTop: 8,
    paddingBottom: 40,
  },
  groupBlock: {
    marginBottom: 14,
    backgroundColor: '#1A181E',
    borderRadius: 18,
    padding: 14,
  },
  groupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  groupTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  groupName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  groupCount: {
    marginLeft: 8,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
  },
  groupActions: {
    flexDirection: 'row',
  },
  tagWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  footerBtn: {
    flex: 1,
    borderRadius: 999,
  },
  dialogInput: {
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
  },
  colorLabel: {
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    marginBottom: 8,
  },
  colorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  groupPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});
