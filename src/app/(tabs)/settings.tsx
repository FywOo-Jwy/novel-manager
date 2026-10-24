import { useCallback, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { useSQLiteContext } from 'expo-sqlite';
import { router } from 'expo-router';
import { File } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { List, Button, Dialog, Portal, Snackbar } from 'react-native-paper';
import { theme } from '@/theme/theme';
import { exportBackup, importBackup } from '@/db/backup';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const [confirmImport, setConfirmImport] = useState(false);
  const [pendingImport, setPendingImport] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');

  const onExport = async () => {
    setBusy(true);
    try {
      const file = await exportBackup(db);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/zip',
          dialogTitle: '导出备份',
        });
      } else {
        setToast('当前设备不支持分享');
      }
    } catch {
      setToast('导出失败');
    } finally {
      setBusy(false);
    }
  };

  const onPickImport = async () => {
    try {
      const res = await File.pickFileAsync({ mimeTypes: ['application/zip'] });
      if (res.canceled || !res.result) return;
      setPendingImport(res.result);
      setConfirmImport(true);
    } catch {
      setToast('无法读取该文件');
    }
  };

  const doImport = async () => {
    setConfirmImport(false);
    const file = pendingImport;
    setPendingImport(null);
    if (!file) return;
    setBusy(true);
    try {
      await importBackup(db, file);
      setToast('导入完成');
    } catch {
      setToast('导入失败，文件可能已损坏');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.group}>
        <List.Section>
        <List.Item
          title="标签管理"
          description="分组、颜色与标签增删改"
          left={(p) => <List.Icon {...p} icon="tag-multiple-outline" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/tag-manager')}
        />
        <List.Item
          title="批量绑定电子书"
          description="一次多选 epub，自动匹配书籍与卷号"
          left={(p) => <List.Icon {...p} icon="file-multiple-outline" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={() => router.push('/epub/batch')}
        />
        <List.Item
          title="导出备份"
          description="备份全部书籍、标签与文件"
          left={(p) => <List.Icon {...p} icon="export-variant" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={onExport}
        />
        <List.Item
          title="导入备份"
          description="将清空当前数据并从备份还原"
          left={(p) => <List.Icon {...p} icon="import" />}
          right={(p) => <List.Icon {...p} icon="chevron-right" />}
          onPress={onPickImport}
        />
        <List.Item
          title="关于"
          description="小说阅读管理 v1.0"
          left={(p) => <List.Icon {...p} icon="information-outline" />}
        />
      </List.Section>
      </View>

      <Portal>
        <Dialog visible={confirmImport} onDismiss={() => setConfirmImport(false)}>
          <Dialog.Title>导入备份</Dialog.Title>
          <Dialog.Content>
            <List.Item
              title="将清空当前所有数据"
              description="导入会删除现有书籍、标签与文件，并从备份完整还原。此操作不可撤销。"
              left={(p) => <List.Icon {...p} icon="alert" />}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfirmImport(false)}>取消</Button>
            <Button onPress={doImport} loading={busy}>
              确认导入
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <Snackbar visible={!!toast} onDismiss={() => setToast('')} duration={3000}>
        {toast}
      </Snackbar>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    paddingTop: 8,
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  group: {
    backgroundColor: '#1A181E',
    borderRadius: 18,
    marginBottom: 14,
    overflow: 'hidden',
  },
});
