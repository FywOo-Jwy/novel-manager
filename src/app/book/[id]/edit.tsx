import { useLocalSearchParams } from 'expo-router';
import { BookForm } from '@/components/BookForm';

export default function EditBookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <BookForm bookId={Number(id)} />;
}
