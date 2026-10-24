import { Text, type StyleProp, type TextStyle } from 'react-native';
import { splitHighlight } from '@/utils/highlight';
import { theme } from '@/theme/theme';

interface Props {
  text: string;
  query: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

/** Renders `text` with case-insensitive matches of `query` highlighted. */
export function HighlightText({ text, query, style, numberOfLines }: Props) {
  const segments = splitHighlight(text, query);
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {segments.map((seg, i) =>
        seg.hit ? (
          <Text
            key={i}
            style={{ backgroundColor: theme.colors.primaryContainer, color: theme.colors.onPrimaryContainer }}
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        )
      )}
    </Text>
  );
}
