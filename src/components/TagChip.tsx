import { Text, StyleSheet, View } from 'react-native';
import { theme } from '@/theme/theme';

interface Props {
  label: string;
  color?: string;
}

/** Small colored chip for a tag label. */
export function TagChip({ label, color }: Props) {
  const c = color ?? theme.colors.primary;
  return (
    <View style={[styles.chip, { borderColor: c }]}>
      <View style={[styles.dot, { backgroundColor: c }]} />
      <Text style={[styles.label, { color: c }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  label: {
    fontSize: 12,
    fontWeight: '500',
  },
});
