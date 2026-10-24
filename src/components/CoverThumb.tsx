import { View, Image, StyleSheet } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { theme } from '@/theme/theme';
import { resolveFileUri } from '@/utils/files';

interface Props {
  path: string | null | undefined;
  width?: number;
  height?: number;
  radius?: number;
}

/** Cover thumbnail with a book glyph placeholder when no cover is set. */
export function CoverThumb({ path, width = 56, height = 84, radius = 6 }: Props) {
  const uri = resolveFileUri(path);
  if (!uri) {
    return (
      <View
        style={[
          styles.placeholder,
          { width, height, borderRadius: radius },
        ]}
      >
        <MaterialCommunityIcons
          name="book-open-page-variant-outline"
          color={theme.colors.onSurfaceVariant}
          size={Math.min(width, height) * 0.5}
        />
      </View>
    );
  }
  return <Image source={{ uri }} style={{ width, height, borderRadius: radius }} resizeMode="cover" />;
}

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: theme.colors.surfaceVariant,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
