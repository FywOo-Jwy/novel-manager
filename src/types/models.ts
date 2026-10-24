export type ReadingStatus = '未读' | '在读' | '弃书' | '已读';
export type PublicationStatus = '连载中' | '已完结';
export type ReadingMethod = '实体书' | '电子书' | '混合';
export type EpubType = '正文' | '短篇';

export const READING_STATUSES: ReadingStatus[] = ['未读', '在读', '弃书', '已读'];
export const PUBLICATION_STATUSES: PublicationStatus[] = ['连载中', '已完结'];
export const READING_METHODS: ReadingMethod[] = ['实体书', '电子书', '混合'];
export const EPUB_TYPES: EpubType[] = ['正文', '短篇'];

export interface Book {
  id: number;
  title_cn: string;
  title_jp: string | null;
  author: string | null;
  illustrator: string | null;
  publisher: string | null;
  total_volumes: number | null;
  reading_status: ReadingStatus;
  publication_status: PublicationStatus | null;
  reading_volume: number | null;
  reading_method: ReadingMethod | null;
  cost: number | null;
  recovered: number | null;
  rating: number | null;
  review: string | null;
  cover_path: string | null;
  /** 最新一卷的出版日期（ISO YYYY-MM-DD）。 */
  latest_publish_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface ReadingLog {
  id: number;
  book_id: number;
  start_date: string | null;
  end_date: string | null;
  start_volume: number | null;
  end_volume: number | null;
}

export interface TagGroup {
  id: number;
  name: string;
  color: string | null;
}

export interface Tag {
  id: number;
  name: string;
  group_id: number | null;
}

/** 文库清单条目（不分组的标签式管理）。 */
export interface Publisher {
  id: number;
  name: string;
}

export interface TagWithGroup extends Tag {
  group_name: string | null;
  group_color: string | null;
}

export interface EpubFile {
  id: number;
  book_id: number;
  file_path: string | null;
  volume_number: number | null;
  type: EpubType;
  is_cover_source: number;
}

export interface BookWithTags extends Book {
  tags: TagWithGroup[];
}

export interface DashboardStats {
  totalBooks: number;
  readThisYear: number;
  totalCost: number;
  totalRecovered: number;
  currentlyReading: Book[];
  ongoingSeries: Book[];
  lastFinished: Book | null;
}

export type SortKey = 'updated_at' | 'rating' | 'title_cn' | 'author' | 'total_volumes' | 'latest_publish_date';
export type SortDirection = 'asc' | 'desc';

export interface SortState {
  key: SortKey;
  direction: SortDirection;
}

export interface Filters {
  includeTagIds: number[];
  excludeTagIds: number[];
  readingStatuses: ReadingStatus[];
  publicationStatuses: PublicationStatus[];
  authors: string[];
  publishers: string[];
  readingMethods: ReadingMethod[];
}

export const EMPTY_FILTERS: Filters = {
  includeTagIds: [],
  excludeTagIds: [],
  readingStatuses: [],
  publicationStatuses: [],
  authors: [],
  publishers: [],
  readingMethods: [],
};
