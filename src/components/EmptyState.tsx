import { View, StyleSheet } from 'react-native';
import type { ComponentProps } from 'react';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '@/theme/theme';

interface Props {
  icon?: ComponentProps<typeof MaterialCommunityIcons>['name'];
  title: string;
  hint?: string;
}

export function EmptyState({ icon = 'book-outline', title, hint }: Props) {
  return (
    <View style={styles.container}>
      <MaterialCommunityIcons name={icon} size={48} color={theme.colors.onSurfaceVariant} />
      <Text style={styles.title}>{title}</Text>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  title: {
    marginTop: 12,
    fontSize: 16,
    color: theme.colors.onSurfaceVariant,
    textAlign: 'center',
  },
  hint: {
    marginTop: 6,
    fontSize: 13,
    color: theme.colors.onSurfaceVariant,
    opacity: 0.7,
    textAlign: 'center',
  },
});
