import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import type { Book } from '@/types/models';
import { theme } from '@/theme/theme';
import { CoverThumb } from './CoverThumb';
import { HighlightText } from './HighlightText';
import { readingStatusColor, publicationStatusColor } from '@/utils/status';
import { formatRating, trimNumber } from '@/utils/format';

interface Props {
  book: Book;
  query?: string;
  onPress: () => void;
}

function StatusChip({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.statusChip, { backgroundColor: color + '26' }]}>
      <View style={[styles.statusDot, { backgroundColor: color }]} />
      <Text style={[styles.statusChipText, { color }]}>{label}</Text>
    </View>
  );
}

/** Cover-first shelf card: large rounded cover on the left, rich text on the right. */
export function BookCard({ book, query = '', onPress }: Props) {
  const progress =
    book.reading_volume != null || book.total_volumes != null
      ? [
          book.reading_volume != null ? `第 ${trimNumber(book.reading_volume)} 卷` : null,
          book.total_volumes != null ? `共 ${trimNumber(book.total_volumes)} 卷` : null,
        ]
          .filter(Boolean)
          .join(' / ')
      : null;

  const byline = [book.author, book.illustrator].filter(Boolean).join(' · ');

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: theme.colors.primary + '22' }}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      <CoverThumb path={book.cover_path} width={86} height={129} radius={10} />
      <View style={styles.body}>
        <HighlightText
          text={book.title_cn}
          query={query}
          numberOfLines={2}
          style={styles.title}
        />
        {book.title_jp ? (
          <Text numberOfLines={1} style={styles.subtitle}>
            {book.title_jp}
          </Text>
        ) : null}
        {byline ? (
          <Text numberOfLines={1} style={styles.byline}>
            {byline}
          </Text>
        ) : null}

        <View style={styles.chipRow}>
          <StatusChip label={book.reading_status} color={readingStatusColor(book.reading_status)} />
          {book.publication_status ? (
            <StatusChip
              label={book.publication_status}
              color={publicationStatusColor(book.publication_status)}
            />
          ) : null}
        </View>

        <View style={styles.footRow}>
          {progress ? <Text style={styles.progress}>{progress}</Text> : <View style={styles.spacer} />}
          <View style={styles.spacer} />
          {book.rating != null ? (
            <View style={styles.ratingWrap}>
              <MaterialCommunityIcons name="star" size={13} color="#F2C48A" />
              <Text style={styles.rating}>{formatRating(book.rating)}</Text>
            </View>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginVertical: 6,
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#1A181E',
  },
  cardPressed: {
    backgroundColor: '#201D26',
  },
  body: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'flex-start',
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: theme.colors.onSurface,
  },
  subtitle: {
    fontSize: 12.5,
    color: theme.colors.onSurfaceVariant,
    marginTop: 3,
  },
  byline: {
    fontSize: 12.5,
    color: theme.colors.onSurfaceVariant,
    marginTop: 3,
    opacity: 0.9,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 3,
    marginRight: 6,
    marginBottom: 4,
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusChipText: {
    fontSize: 11.5,
    fontWeight: '600',
  },
  footRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  spacer: {
    flex: 1,
  },
  progress: {
    fontSize: 12.5,
    color: theme.colors.onSurfaceVariant,
  },
  ratingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  rating: {
    fontSize: 12.5,
    color: '#F2C48A',
    marginLeft: 3,
    fontWeight: '600',
  },
});
