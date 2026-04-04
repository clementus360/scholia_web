export type ApiError = {
  message: string;
};

export type ApiMeta = {
  limit?: number;
  offset?: number;
  count?: number;
  verses_count?: number;
  entities_count?: number;
  notes_count?: number;
  cross_references_count?: number;
  people_count?: number;
  groups_count?: number;
};

export type ApiEnvelope<T> = {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
};

export type Verse = {
  id: string;
  translation: string;
  book: string;
  chapter: number;
  verse: number;
  text: string;
};

export type Note = {
  id: number;
  title: string;
  main_reference: string;
  content: string;
  verse_ids?: string[];
  created_at?: string;
  updated_at?: string;
};

export type Person = {
  id: string;
  name: string;
  lookup_name: string;
  gender: string;
  birth_year: number;
  death_year: number;
  dictionary_text: string;
  slug: string;
};

export type Group = {
  id: string;
  name: string;
};

export type Event = {
  id: string;
  title: string;
  start_date: string;
  duration: string;
  sort_key: number;
};

export type Location = {
  id: string;
  name: string;
  modern_name: string;
  latitude?: number;
  longitude?: number;
  feature_type: string;
  geometry_type: string;
  image_file: string;
  image_url: string;
  credit_url: string;
  image_author: string;
  source_info: string;
};

export type Book = {
  id: string;
  osis_name: string;
  book_name: string;
  testament: string;
  book_order: number;
  slug: string;
};

export type Chapter = {
  id: string;
  book_id: string;
  osis_ref: string;
  chapter_num: number;
};

export type LexiconEntry = {
  strongs_id: string;
  word: string;
  transliteration: string;
  definition: string;
};

export type LexiconOccurrence = {
  verse_id: string;
  word_order: number;
  surface_word: string;
  english_gloss: string;
  morph_code: string;
  manuscript_type: string;
  morphology?: MorphologyEntry | null;
};

export type LexiconDetail = LexiconEntry & {
  occurrences: LexiconOccurrence[];
};

export type MorphologyEntry = {
  code: string;
  short_def: string;
  long_exp: string;
};

export type VerseAnalysisToken = {
  word_order: number;
  surface_word: string;
  english_gloss: string;
  strongs_id: string;
  morph_code: string;
  manuscript_type: string;
  lexicon?: LexiconEntry;
  morphology?: MorphologyEntry;
};

export type VerseContext = {
  verse: Verse;
  analysis: VerseAnalysisToken[];
  lexicon: LexiconEntry[];
  locations: Location[];
  people: Person[];
  groups: Group[];
  events: Event[];
  cross_references: string[];
  notes: Note[];
};

export type DetectedReference = {
  label: string;
  osisId: string;
};

export type ContextTabKey =
  | "lexicon"
  | "geography"
  | "history"
  | "people"
  | "events"
  | "crossReferences";

export type LocalNote = {
  id: number;
  title: string;
  createdAt: string;
  updatedAt: string;
  content: string;
  verseIds: string[];
  excerpt: string;
  pinned?: boolean;
  referenceHint?: string;
};