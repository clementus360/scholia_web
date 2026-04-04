import type { DetectedReference } from "@/lib/types";

const BOOKS: Array<{
  name: string;
  osis: string;
  aliases: string[];
}> = [
  { name: "Genesis", osis: "GEN", aliases: ["Gen"] },
  { name: "Exodus", osis: "EXO", aliases: ["Exod"] },
  { name: "Leviticus", osis: "LEV", aliases: ["Lev"] },
  { name: "Numbers", osis: "NUM", aliases: ["Num"] },
  { name: "Deuteronomy", osis: "DEU", aliases: ["Deut", "Dt"] },
  { name: "Joshua", osis: "JOS", aliases: ["Josh"] },
  { name: "Judges", osis: "JDG", aliases: ["Judg"] },
  { name: "Ruth", osis: "RUT", aliases: [] },
  { name: "1 Samuel", osis: "1SA", aliases: ["1 Sam", "1Sam"] },
  { name: "2 Samuel", osis: "2SA", aliases: ["2 Sam", "2Sam"] },
  { name: "1 Kings", osis: "1KI", aliases: ["1 Kgs", "1Kgs"] },
  { name: "2 Kings", osis: "2KI", aliases: ["2 Kgs", "2Kgs"] },
  { name: "1 Chronicles", osis: "1CH", aliases: ["1 Chr", "1Chr"] },
  { name: "2 Chronicles", osis: "2CH", aliases: ["2 Chr", "2Chr"] },
  { name: "Ezra", osis: "EZR", aliases: [] },
  { name: "Nehemiah", osis: "NEH", aliases: ["Neh"] },
  { name: "Esther", osis: "EST", aliases: ["Esth"] },
  { name: "Job", osis: "JOB", aliases: [] },
  { name: "Psalms", osis: "PSA", aliases: ["Psalm", "Psa"] },
  { name: "Ecclesiastes", osis: "ECC", aliases: ["Eccl", "Qoh"] },
  { name: "Song of Solomon", osis: "SNG", aliases: ["Song", "Songs", "Song of Songs"] },
  { name: "Proverbs", osis: "PRO", aliases: ["Prov"] },
  { name: "Lamentations", osis: "LAM", aliases: ["Lam"] },
  { name: "Isaiah", osis: "ISA", aliases: ["Isa"] },
  { name: "Jeremiah", osis: "JER", aliases: ["Jer"] },
  { name: "Ezekiel", osis: "EZK", aliases: ["Ezek"] },
  { name: "Daniel", osis: "DAN", aliases: ["Dan"] },
  { name: "Hosea", osis: "HOS", aliases: ["Hos"] },
  { name: "Joel", osis: "JOL", aliases: ["Joel"] },
  { name: "Amos", osis: "AMO", aliases: ["Amos"] },
  { name: "Obadiah", osis: "OBA", aliases: ["Obad"] },
  { name: "Jonah", osis: "JON", aliases: ["Jon"] },
  { name: "Micah", osis: "MIC", aliases: ["Mic"] },
  { name: "Nahum", osis: "NAM", aliases: ["Nah"] },
  { name: "Habakkuk", osis: "HAB", aliases: ["Hab"] },
  { name: "Zephaniah", osis: "ZEP", aliases: ["Zeph"] },
  { name: "Haggai", osis: "HAG", aliases: ["Hag"] },
  { name: "Zechariah", osis: "ZEC", aliases: ["Zech"] },
  { name: "Malachi", osis: "MAL", aliases: ["Mal"] },
  { name: "Matthew", osis: "MAT", aliases: ["Matt"] },
  { name: "Mark", osis: "MRK", aliases: [] },
  { name: "Luke", osis: "LUK", aliases: [] },
  { name: "John", osis: "JHN", aliases: ["Jn"] },
  { name: "Acts", osis: "ACT", aliases: [] },
  { name: "Romans", osis: "ROM", aliases: ["Rom"] },
  { name: "1 Corinthians", osis: "1CO", aliases: ["1 Cor", "1Cor"] },
  { name: "2 Corinthians", osis: "2CO", aliases: ["2 Cor", "2Cor"] },
  { name: "Galatians", osis: "GAL", aliases: ["Gal"] },
  { name: "Ephesians", osis: "EPH", aliases: ["Eph"] },
  { name: "Philippians", osis: "PHP", aliases: ["Phil"] },
  { name: "Colossians", osis: "COL", aliases: ["Col"] },
  { name: "1 Thessalonians", osis: "1TH", aliases: ["1 Thess", "1Thess"] },
  { name: "2 Thessalonians", osis: "2TH", aliases: ["2 Thess", "2Thess"] },
  { name: "1 Timothy", osis: "1TI", aliases: ["1 Tim", "1Tim"] },
  { name: "2 Timothy", osis: "2TI", aliases: ["2 Tim", "2Tim"] },
  { name: "Titus", osis: "TIT", aliases: [] },
  { name: "Philemon", osis: "PHM", aliases: ["Philem"] },
  { name: "Hebrews", osis: "HEB", aliases: ["Heb"] },
  { name: "James", osis: "JAS", aliases: ["Jas"] },
  { name: "1 Peter", osis: "1PE", aliases: ["1 Pet", "1Pet"] },
  { name: "2 Peter", osis: "2PE", aliases: ["2 Pet", "2Pet"] },
  { name: "1 John", osis: "1JN", aliases: ["1 Jn", "1Jn"] },
  { name: "2 John", osis: "2JN", aliases: ["2 Jn", "2Jn"] },
  { name: "3 John", osis: "3JN", aliases: ["3 Jn", "3Jn"] },
  { name: "Jude", osis: "JUD", aliases: [] },
  { name: "Revelation", osis: "REV", aliases: ["Rev"] },
];

const BOOK_CANDIDATES = BOOKS.flatMap((book) => [book.name, ...book.aliases]);

const BOOK_PATTERN = BOOK_CANDIDATES
  .sort((left, right) => right.length - left.length)
  .map((candidate) => escapeRegex(candidate).replace(/\s+/g, "\\s+"))
  .join("|");

const REFERENCE_PATTERN = new RegExp(`\\b(${BOOK_PATTERN})\\s+(\\d+):(\\d+)\\b`, "i");
const REFERENCE_PATTERN_GLOBAL = new RegExp(`\\b(${BOOK_PATTERN})\\s+(\\d+):(\\d+)\\b`, "gi");

export function detectReference(text: string): DetectedReference | null {
  const match = text.match(REFERENCE_PATTERN);

  if (!match) {
    return null;
  }

  const bookCandidate = match[1].trim();
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  const book = resolveBook(bookCandidate);

  if (!book || Number.isNaN(chapter) || Number.isNaN(verse)) {
    return null;
  }

  return {
    label: `${book.name} ${chapter}:${verse}`,
    osisId: `${book.osis}.${chapter}.${verse}`,
  };
}

export function findReferenceMatches(text: string): DetectedReference[] {
  const matches: DetectedReference[] = [];

  for (const match of text.matchAll(REFERENCE_PATTERN_GLOBAL)) {
    const bookCandidate = match[1].trim();
    const chapter = Number(match[2]);
    const verse = Number(match[3]);
    const book = resolveBook(bookCandidate);

    if (!book || Number.isNaN(chapter) || Number.isNaN(verse)) {
      continue;
    }

    matches.push({
      label: `${book.name} ${chapter}:${verse}`,
      osisId: `${book.osis}.${chapter}.${verse}`,
    });
  }

  return matches;
}

export function formatReferenceLabel(reference: string): string {
  const parts = reference.split(".");

  if (parts.length !== 3) {
    return reference;
  }

  const [book, chapter, verse] = parts;
  const label = resolveOsisBook(book)?.name ?? book;

  return `${label} ${chapter}:${verse}`;
}

function resolveBook(candidate: string): { name: string; osis: string } | null {
  const normalized = candidate.replace(/\./g, "").replace(/\s+/g, " ").trim();

  for (const book of BOOKS) {
    const names = [book.name, ...book.aliases];

    for (const name of names) {
      const cleaned = name.replace(/\./g, "").replace(/\s+/g, " ").trim();

      if (cleaned.toLowerCase() === normalized.toLowerCase()) {
        return { name: book.name, osis: book.osis };
      }
    }
  }

  return null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function resolveOsisBook(osis: string): { name: string; osis: string } | null {
  return BOOKS.find((book) => book.osis === osis) ?? null;
}