import { apiFetch } from "@/lib/api";
import { stripHtml } from "@/lib/editor";
import type { LexiconDetail, LocalNote, Note, VerseContext } from "@/lib/types";

type NotesData = Note[];

type NotePayload = {
  title: string;
  main_reference: string;
  content: string;
  verse_ids: string[];
};

const WRITE_API_KEY = process.env.NEXT_PUBLIC_SCHOLIA_API_KEY ?? "scholia-dev";

export async function fetchNotes(): Promise<LocalNote[]> {
  const response = await apiFetch<NotesData>("/notes?limit=100&offset=0");
  const notes = (response.data ?? []).map(mapNoteToLocal);

  return notes.sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export async function createNote(): Promise<LocalNote> {
  const payload: NotePayload = {
    title: "Untitled Note",
    main_reference: "",
    content: "",
    verse_ids: [],
  };

  const response = await apiFetch<Note>(
    "/notes",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
    WRITE_API_KEY,
  );

  if (!response.data) {
    throw new Error("The API did not return the created note.");
  }

  return mapNoteToLocal(response.data);
}

export async function updateNote(note: LocalNote): Promise<LocalNote> {
  const payload: NotePayload = {
    title: note.title.trim() || "Untitled Note",
    main_reference: note.referenceHint ?? note.verseIds[0] ?? "",
    content: note.content,
    verse_ids: note.verseIds,
  };

  const response = await apiFetch<Note>(
    `/notes/${note.id}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    },
    WRITE_API_KEY,
  );

  if (!response.data) {
    throw new Error("The API did not return the updated note.");
  }

  return mapNoteToLocal(response.data);
}

export async function deleteNote(noteId: number): Promise<void> {
  await apiFetch<null>(
    `/notes/${noteId}`,
    {
      method: "DELETE",
    },
    WRITE_API_KEY,
  );
}

export async function fetchVerseContext(osisId: string): Promise<VerseContext> {
  const response = await apiFetch<VerseContext>(`/verse/${encodeURIComponent(osisId)}/context`);

  if (!response.data) {
    throw new Error("The API did not return verse context.");
  }

  return normalizeVerseContext(response.data);
}

function normalizeVerseContext(context: VerseContext): VerseContext {
  const normalized: VerseContext = {
    ...context,
    analysis: context.analysis ?? [],
    lexicon: context.lexicon ?? [],
    locations: context.locations ?? [],
    people: context.people ?? [],
    groups: context.groups ?? [],
    events: context.events ?? [],
    cross_references: context.cross_references ?? [],
    notes: context.notes ?? [],
  };

  if ("verses" in normalized) {
    return {
      ...normalized,
      analysis_by_verse: normalized.analysis_by_verse ?? {},
    };
  }

  return normalized;
}

export async function fetchLexiconDetail(strongsId: string): Promise<LexiconDetail> {
  const response = await apiFetch<LexiconDetail | { entry?: Partial<LexiconDetail>; occurrences?: LexiconDetail["occurrences"] }>(
    `/lexicon/${encodeURIComponent(strongsId)}`,
  );

  if (!response.data) {
    throw new Error("The API did not return lexicon data.");
  }

  return normalizeLexiconDetail(response.data, strongsId);
}

function mapNoteToLocal(note: Note): LocalNote {
  const createdAt = note.created_at ?? new Date().toISOString();
  const updatedAt = note.updated_at ?? createdAt;

  return {
    id: note.id,
    title: note.title,
    createdAt,
    updatedAt,
    content: note.content,
    verseIds: note.verse_ids ?? [],
    excerpt: makeExcerpt(note.content),
    referenceHint: note.main_reference,
  };
}

function makeExcerpt(content: string): string {
  const compact = stripHtml(content).replace(/\s+/g, " ").trim();

  if (!compact) {
    return "Start writing your reading notes.";
  }

  return compact.length > 88 ? `${compact.slice(0, 88)}...` : compact;
}

function normalizeLexiconDetail(
  value: LexiconDetail | { entry?: Partial<LexiconDetail>; occurrences?: LexiconDetail["occurrences"] },
  strongsId: string,
): LexiconDetail {
  const merged: Partial<LexiconDetail> =
    "entry" in value && value.entry
      ? { ...value.entry, occurrences: value.occurrences ?? value.entry.occurrences }
      : value;

  return {
    strongs_id: merged.strongs_id ?? strongsId,
    word: merged.word ?? "",
    transliteration: merged.transliteration ?? "",
    definition: merged.definition ?? "",
    occurrences: normalizeOccurrences(merged.occurrences),
  };
}

function normalizeOccurrences(value: unknown): LexiconDetail["occurrences"] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      const record = isRecord(item) ? item : {};
      const wordOrder = asNumber(record.word_order);

      return {
        verse_id: asString(record.verse_id),
        word_order: wordOrder,
        surface_word: asString(record.surface_word),
        english_gloss: asString(record.english_gloss ?? record.english_glossary),
        morph_code: asString(record.morph_code),
        manuscript_type: asString(record.manuscript_type),
        morphology: isRecord(record.morphology)
          ? {
              code: asString(record.morphology.code),
              short_def: asString(record.morphology.short_def),
              long_exp: asString(record.morphology.long_exp),
            }
          : null,
      };
    })
    .sort((left, right) => {
      if (left.verse_id !== right.verse_id) {
        return left.verse_id.localeCompare(right.verse_id);
      }

      return left.word_order - right.word_order;
    });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}