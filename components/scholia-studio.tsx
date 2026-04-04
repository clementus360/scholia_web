"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { findReferenceMatches, formatReferenceLabel } from "@/lib/reference";
import { RichNoteEditor } from "@/components/rich-note-editor";
import { stripHtml } from "@/lib/editor";
import { createNote, deleteNote, fetchLexiconDetail, fetchNotes, fetchVerseContext, updateNote } from "@/lib/scholia";
import type { ContextTabKey, LexiconDetail, LexiconOccurrence, LocalNote, VerseContext } from "@/lib/types";

type ContextResult = {
  data: VerseContext | null;
  loading: boolean;
  error: string | null;
};

type LexiconDetailsState = Record<
  string,
  {
    loading: boolean;
    data: LexiconDetail | null;
    error: string | null;
  }
>;

const contextTabs: Array<{
  key: ContextTabKey;
  label: string;
}> = [
    { key: "lexicon", label: "Lexicon" },
    { key: "geography", label: "Geography" },
    { key: "history", label: "History" },
    { key: "people", label: "People" },
    { key: "events", label: "Events" },
    { key: "crossReferences", label: "Cross Refs" },
  ];

export function ScholiaStudio() {
  const [notes, setNotes] = useState<LocalNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [selectedVerseId, setSelectedVerseId] = useState<string | null>(null);
  const [insertQuoteSignal, setInsertQuoteSignal] = useState(0);
  const [notePendingDeletion, setNotePendingDeletion] = useState<LocalNote | null>(null);
  const [activeTab, setActiveTab] = useState<ContextTabKey>("lexicon");
  const [isLoadingNotes, setIsLoadingNotes] = useState(true);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isNotesSidebarOpen, setIsNotesSidebarOpen] = useState(false);
  const [isContextSidebarOpen, setIsContextSidebarOpen] = useState(false);
  const [isDesktopLayout, setIsDesktopLayout] = useState(false);
  const [lexiconDetails, setLexiconDetails] = useState<LexiconDetailsState>({});
  const [contextResult, setContextResult] = useState<ContextResult>({
    data: null,
    loading: false,
    error: null,
  });
  const lastSavedSnapshotRef = useRef<string>("");
  const autosaveTimerRef = useRef<number | null>(null);
  const activeNoteRef = useRef<LocalNote | null>(null);
  const persistNoteRef = useRef<(note: LocalNote) => Promise<void>>(async () => { });

  const activeNote = useMemo(
    () => notes.find((note) => note.id === activeNoteId) ?? null,
    [activeNoteId, notes],
  );

  const selectedReferenceLabel = selectedVerseId
    ? formatReferenceLabel(selectedVerseId)
    : null;

  const lexiconSignature = useMemo(
    () => (contextResult.data?.lexicon ?? []).map((entry) => entry.strongs_id).join("|"),
    [contextResult.data?.lexicon],
  );

  activeNoteRef.current = activeNote;

  const serializeNoteForSave = (note: LocalNote) =>
    JSON.stringify({
      id: note.id,
      title: note.title,
      content: note.content,
      verseIds: note.verseIds,
      referenceHint: note.referenceHint ?? null,
    });

  useEffect(() => {
    const mediaQuery = window.matchMedia("(min-width: 1024px)");

    const syncLayout = (matches: boolean) => {
      setIsDesktopLayout(matches);

      if (matches) {
        setIsNotesSidebarOpen(true);
        setIsContextSidebarOpen(true);
      } else {
        setIsNotesSidebarOpen(false);
        setIsContextSidebarOpen(false);
      }
    };

    syncLayout(mediaQuery.matches);

    const onChange = (event: MediaQueryListEvent) => {
      syncLayout(event.matches);
    };

    mediaQuery.addEventListener("change", onChange);

    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    setIsLoadingNotes(true);
    setNotesError(null);

    fetchNotes()
      .then((loadedNotes) => {
        if (!isActive) {
          return;
        }

        setNotes(loadedNotes);

        if (loadedNotes.length > 0) {
          setActiveNoteId(loadedNotes[0].id);
        }
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setNotesError(error instanceof Error ? error.message : "Failed to load notes.");
      })
      .finally(() => {
        if (!isActive) {
          return;
        }

        setIsLoadingNotes(false);
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    setSelectedVerseId(null);
  }, [activeNoteId]);

  useEffect(() => {
    if (!activeNoteRef.current) {
      lastSavedSnapshotRef.current = "";
      return;
    }

    lastSavedSnapshotRef.current = serializeNoteForSave(activeNoteRef.current);
  }, [activeNoteId]);

  useEffect(() => {
    let isActive = true;

    if (!selectedVerseId) {
      setContextResult({ data: null, loading: false, error: null });
      return () => {
        isActive = false;
      };
    }

    setContextResult((current) => ({
      ...current,
      loading: true,
      error: null,
    }));

    fetchVerseContext(selectedVerseId)
      .then((data) => {
        if (!isActive) {
          return;
        }

        setContextResult({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (!isActive) {
          return;
        }

        setContextResult({
          data: null,
          loading: false,
          error: error instanceof Error ? error.message : "Failed to load verse context.",
        });
      });

    return () => {
      isActive = false;
    };
  }, [selectedVerseId]);

  useEffect(() => {
    const entries = contextResult.data?.lexicon ?? [];

    if (entries.length === 0) {
      return;
    }

    let isCancelled = false;

    for (const entry of entries) {
      const strongsId = entry.strongs_id;

      setLexiconDetails((current) => {
        if (current[strongsId]) {
          return current;
        }

        return {
          ...current,
          [strongsId]: {
            loading: true,
            data: null,
            error: null,
          },
        };
      });

      void fetchLexiconDetail(strongsId)
        .then((data) => {
          if (isCancelled) {
            return;
          }

          setLexiconDetails((current) => ({
            ...current,
            [strongsId]: {
              loading: false,
              data,
              error: null,
            },
          }));
        })
        .catch((error: unknown) => {
          if (isCancelled) {
            return;
          }

          setLexiconDetails((current) => ({
            ...current,
            [strongsId]: {
              loading: false,
              data: null,
              error: error instanceof Error ? error.message : "Failed to load occurrences.",
            },
          }));
        });
    }

    return () => {
      isCancelled = true;
    };
  }, [lexiconSignature, contextResult.data?.lexicon]);

  const handleCreateNote = async () => {
    setNotesError(null);

    try {
      const created = await createNote();
      setNotes((current) => [created, ...current]);
      setActiveNoteId(created.id);
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "Failed to create note.");
    }
  };

  const handleDeleteActiveNote = async () => {
    if (!notePendingDeletion) {
      return;
    }

    setNotesError(null);

    try {
      await deleteNote(notePendingDeletion.id);

      setNotes((current) => {
        const remaining = current.filter((note) => note.id !== notePendingDeletion.id);
        setActiveNoteId(remaining[0]?.id ?? null);
        return remaining;
      });

      setSelectedVerseId(null);
      setNotePendingDeletion(null);
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "Failed to delete note.");
    }
  };

  const handleUpdateActiveNote = (patch: Partial<LocalNote>) => {
    if (!activeNote) {
      return;
    }

    setNotes((current) =>
      current.map((note) =>
        note.id === activeNote.id
          ? {
            ...note,
            ...patch,
            updatedAt: new Date().toISOString(),
            excerpt: patch.content
              ? stripHtml(patch.content).slice(0, 88).replace(/\s+/g, " ")
              : note.excerpt,
          }
          : note,
      ),
    );
  };

  const persistNote = useCallback(async (note: LocalNote) => {
    if (!note) {
      return;
    }

    setIsSaving(true);
    setNotesError(null);

    try {
      const saved = await updateNote(note);
      lastSavedSnapshotRef.current = serializeNoteForSave(saved);
      setNotes((current) =>
        current.map((note) => (note.id === saved.id ? { ...note, ...saved } : note)),
      );
    } catch (error) {
      setNotesError(error instanceof Error ? error.message : "Failed to save note.");
    } finally {
      setIsSaving(false);
    }
  }, []);

  useEffect(() => {
    persistNoteRef.current = persistNote;
  }, [persistNote]);

  const persistActiveNote = async () => {
    if (!activeNote) {
      return;
    }

    await persistNote(activeNote);
  };

  const activeNoteAutosaveSignature = activeNote ? serializeNoteForSave(activeNote) : "";

  useEffect(() => {
    if (!activeNoteRef.current) {
      return;
    }

    const currentSnapshot = activeNoteAutosaveSignature;

    if (currentSnapshot === lastSavedSnapshotRef.current) {
      return;
    }

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = window.setTimeout(() => {
      const note = activeNoteRef.current;

      if (note) {
        void persistNoteRef.current(note);
      }
    }, 900);

    return () => {
      if (autosaveTimerRef.current) {
        window.clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [activeNoteAutosaveSignature]);

  const handleContentChange = (contentHtml: string, plainText: string) => {
    const verseIds = Array.from(
      new Set(findReferenceMatches(plainText).map((reference) => reference.osisId)),
    );

    handleUpdateActiveNote({
      content: contentHtml,
      referenceHint: verseIds[0] ? formatReferenceLabel(verseIds[0]) : undefined,
      verseIds,
    });
  };

  const handleInsertVerseQuote = (contentHtml: string, plainText: string) => {
    if (!activeNote || !selectedVerseId || !contextResult.data?.verse) {
      return;
    }

    const verseIds = Array.from(
      new Set([selectedVerseId, ...findReferenceMatches(plainText).map((reference) => reference.osisId)]),
    );

    const nextNote: LocalNote = {
      ...activeNote,
      content: contentHtml,
      verseIds,
      referenceHint: selectedReferenceLabel ?? undefined,
      updatedAt: new Date().toISOString(),
      excerpt: stripHtml(contentHtml).slice(0, 88).replace(/\s+/g, " "),
    };

    handleUpdateActiveNote(nextNote);

    void persistNote(nextNote);
  };

  const contextBody =
    contextResult.data != null ? (
      renderContextBody(activeTab, contextResult.data, lexiconDetails)
    ) : (
      <EmptyContextCard
        title={contextResult.loading ? "Loading context" : "No context data"}
        description={
          contextResult.loading
            ? "Fetching the verse study data now."
            : "Select a verse to load its lexicon, people, geography, and related references."
        }
      />
    );

  const handleSelectVerse = (verseId: string | null) => {
    setSelectedVerseId(verseId);

    if (verseId && isDesktopLayout) {
      setIsContextSidebarOpen(true);
    }
  };

  if (isLoadingNotes) {
    return (
      <main className="h-dvh w-full p-0">
        <div className="flex h-full w-full items-center justify-center rounded-none border border-black/6 bg-white/72 text-[#6d6357] backdrop-blur-md">
          Loading notes...
        </div>
      </main>
    );
  }

  if (!activeNote) {
    return (
      <main className="h-dvh w-full p-0">
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 rounded-none border border-black/6 bg-white/72 text-[#6d6357] backdrop-blur-md">
          <p>No notes found in the API yet.</p>
          <button
            type="button"
            onClick={handleCreateNote}
            className="rounded-full bg-[#db6700] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#bf5b00]"
          >
            Create first note
          </button>
          {notesError ? <p className="text-sm text-[#a53e1f]">{notesError}</p> : null}
        </div>
      </main>
    );
  }

  return (
    <main className="h-dvh w-full p-0">
      <div className="flex h-full w-full flex-col overflow-hidden bg-white/72 backdrop-blur-md lg:flex-row">
        {isDesktopLayout && isNotesSidebarOpen ? (
          <NotesSidebar
            notes={notes}
            activeNoteId={activeNote.id}
            selectedVerseId={selectedVerseId}
            onSelectNote={(noteId) => {
              void persistActiveNote();
              setActiveNoteId(noteId);
            }}
            onCreateNote={handleCreateNote}
            onToggleSidebar={() => setIsNotesSidebarOpen(false)}
            isOpen={isNotesSidebarOpen}
          />
        ) : null}

        <section className="flex min-w-0 flex-1 flex-col  bg-[#fcfaf7] px-5 py-5 lg:border-y-0 lg:px-7 lg:py-6">
          <div className="flex flex-wrap items-center justify-between gap-4 pb-5">
            <div className="w-full">
              <p className="text-xs uppercase tracking-[0.24em] text-[#b06b36]">Scholia Notes</p>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
                <input
                  aria-label="Note title"
                  value={activeNote.title}
                  onChange={(event) => handleUpdateActiveNote({ title: event.target.value })}
                  onBlur={() => void persistActiveNote()}
                  className="min-w-0 border-0 bg-transparent text-2xl font-semibold tracking-tight text-[#1d1813] outline-none placeholder:text-[#978e82]"
                />

                <div className="flex gap-2">
                  <span className="flex items-center justify-center rounded-full border border-black/8 bg-white px-3 py-1 text-xs font-medium text-[#8a7f74]">
                    Updated {formatDate(activeNote.updatedAt)}
                  </span>
                  {isSaving ? (
                    <span className="rounded-full border border-black/8 bg-white px-3 py-1 text-xs font-medium text-[#8a7f74]">
                      Saving...
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setNotePendingDeletion(activeNote)}
                    aria-label="Delete note"
                    title="Delete note"
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-[#f0c5bd] bg-[#fff3ef] text-[#a53e1f] transition hover:bg-[#ffe8e2]"
                  >
                    <TrashIcon />
                  </button>
                </div>
              </div>
              <p className="mt-2 text-sm text-[#7e7468]">
                Write sermon notes, reading observations, or a simple thought flow while the verse context hydrates beside you.
              </p>
              {notesError ? <p className="mt-2 text-sm text-[#a53e1f]">{notesError}</p> : null}
            </div>
          </div>

          <RichNoteEditor
            key={activeNote.id}
            noteId={activeNote.id}
            content={activeNote.content}
            insertQuoteSignal={insertQuoteSignal}
            onChange={handleContentChange}
            onBlur={() => void persistActiveNote()}
            onSelectVerse={handleSelectVerse}
            selectedVerseLabel={selectedReferenceLabel}
            verseContext={contextResult.data}
            onInsertVerseQuote={handleInsertVerseQuote}
          />

          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-black/6 bg-white/80 px-4 py-3 text-sm text-[#6f6458]">
            <span className="font-medium text-[#1f1913]">Linked verses</span>
            {activeNote.verseIds.length > 0 ? (
              activeNote.verseIds.map((verseId) => {
                const selected = verseId === selectedVerseId;

                return (
                  <button
                    key={verseId}
                    type="button"
                    onClick={() => handleSelectVerse(verseId)}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition ${selected
                      ? "bg-[#db6700] text-white"
                      : "bg-[#f3e5d5] text-[#7b4b17] hover:bg-[#ecd3b4]"
                      }`}
                  >
                    {formatReferenceLabel(verseId)}
                  </button>
                );
              })
            ) : (
              <span className="text-[#988c7c]">No verses added yet.</span>
            )}
          </div>

          {!isDesktopLayout && selectedReferenceLabel ? (
            <button
              type="button"
              onClick={() => {
                setIsContextSidebarOpen(true);
                setIsNotesSidebarOpen(false);
              }}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[#db6700] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#bf5b00]"
            >
              <SidebarToggleIcon side="right" isOpen={false} />
              Show context for {selectedReferenceLabel}
            </button>
          ) : null}
        </section>

        {isDesktopLayout && isContextSidebarOpen ? (
          <ContextRail
            selectedReferenceLabel={selectedReferenceLabel}
            verseText={contextResult.data?.verse.text ?? ""}
            contextError={contextResult.error}
            context={contextBody}
            activeTab={activeTab}
            onSelectTab={setActiveTab}
            onInsertQuote={() => setInsertQuoteSignal((current) => current + 1)}
            canInsertQuote={Boolean(selectedReferenceLabel && contextResult.data?.verse)}
            onToggleSidebar={() => setIsContextSidebarOpen(false)}
            isOpen={isContextSidebarOpen}
            mode="desktop"
          />
        ) : null}
      </div>

      {!isNotesSidebarOpen ? (
        <button
          type="button"
          onClick={() => {
            setIsNotesSidebarOpen(true);
            if (!isDesktopLayout) {
              setIsContextSidebarOpen(false);
            }
          }}
          aria-label="Show notes sidebar"
          title="Show notes sidebar"
          className="fixed left-4 top-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#db6700] text-white shadow-[0_14px_34px_rgba(97,58,12,0.3)] transition hover:scale-[1.03] hover:bg-[#bf5b00] lg:top-5"
        >
          <SidebarToggleIcon side="left" isOpen={false} />
        </button>
      ) : null}

      {isDesktopLayout && !isContextSidebarOpen ? (
        <button
          type="button"
          onClick={() => {
            setIsContextSidebarOpen(true);
            if (!isDesktopLayout) {
              setIsNotesSidebarOpen(false);
            }
          }}
          aria-label="Show context sidebar"
          title="Show context sidebar"
          className="fixed right-4 top-4 z-40 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#db6700] text-white shadow-[0_14px_34px_rgba(97,58,12,0.3)] transition hover:scale-[1.03] hover:bg-[#bf5b00] lg:top-5"
        >
          <SidebarToggleIcon side="right" isOpen={false} />
        </button>
      ) : null}

      {!isDesktopLayout && isNotesSidebarOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setIsNotesSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 left-0 z-50 w-[86vw] max-w-[320px] shadow-xl">
            <NotesSidebar
              notes={notes}
              activeNoteId={activeNote.id}
              selectedVerseId={selectedVerseId}
              onSelectNote={(noteId) => {
                void persistActiveNote();
                setActiveNoteId(noteId);
                setIsNotesSidebarOpen(false);
              }}
              onCreateNote={handleCreateNote}
              onToggleSidebar={() => setIsNotesSidebarOpen(false)}
              isOpen={isNotesSidebarOpen}
            />
          </div>
        </>
      ) : null}

      {!isDesktopLayout && isContextSidebarOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[1px]"
            onClick={() => setIsContextSidebarOpen(false)}
            aria-hidden="true"
          />
          <div className="fixed inset-y-0 right-0 z-50 w-[90vw] max-w-[360px] shadow-xl">
            <ContextRail
              selectedReferenceLabel={selectedReferenceLabel}
              verseText={contextResult.data?.verse.text ?? ""}
              contextError={contextResult.error}
              context={contextBody}
              activeTab={activeTab}
              onSelectTab={setActiveTab}
              onInsertQuote={() => setInsertQuoteSignal((current) => current + 1)}
              canInsertQuote={Boolean(selectedReferenceLabel && contextResult.data?.verse)}
              onToggleSidebar={() => setIsContextSidebarOpen(false)}
              isOpen={isContextSidebarOpen}
              mode="mobile"
            />
          </div>
        </>
      ) : null}

      {notePendingDeletion ? (
        <DeleteNoteModal
          noteTitle={notePendingDeletion.title}
          onCancel={() => setNotePendingDeletion(null)}
          onConfirm={() => void handleDeleteActiveNote()}
        />
      ) : null}
    </main>
  );
}

function TrashIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 6l1 14h10l1-14" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M10 11v6M14 11v6" />
    </svg>
  );
}

function SidebarToggleIcon({ side, isOpen }: { side: "left" | "right"; isOpen: boolean }) {
  const arrowPointsTo =
    side === "left"
      ? isOpen
        ? "left"
        : "right"
      : isOpen
        ? "right"
        : "left";

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path strokeLinecap="round" strokeLinejoin="round" d={side === "left" ? "M10 4v16" : "M14 4v16"} />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d={arrowPointsTo === "left" ? "M15 12H9m0 0 2.5-2.5M9 12l2.5 2.5" : "M9 12h6m0 0-2.5-2.5M15 12l-2.5 2.5"}
      />
    </svg>
  );
}

function DeleteNoteModal({
  noteTitle,
  onCancel,
  onConfirm,
}: {
  noteTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 px-4 py-6 backdrop-blur-[2px]">
      <div className="w-full max-w-md rounded-[28px] border border-black/8 bg-[#fffdf9] p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[#b06b36]">Are you sure?</p>
        <h3 className="mt-3 text-2xl font-semibold tracking-tight text-[#1d1813]">Delete this note?</h3>
        <p className="mt-3 text-sm leading-6 text-[#6f6458]">
          &quot;{noteTitle || "Untitled Note"}&quot; will be permanently removed. This cannot be undone.
        </p>

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-black/8 bg-white px-4 py-2 text-sm font-medium text-[#5e5449] transition hover:bg-[#f8f5f0]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-full bg-[#b63b1f] px-4 py-2 text-sm font-medium text-white transition hover:bg-[#9f3219]"
          >
            Delete note
          </button>
        </div>
      </div>
    </div>
  );
}

function NotesSidebar({
  notes,
  activeNoteId,
  selectedVerseId,
  onSelectNote,
  onCreateNote,
  onToggleSidebar,
  isOpen,
}: {
  notes: LocalNote[];
  activeNoteId: number;
  selectedVerseId: string | null;
  onSelectNote: (noteId: number) => void;
  onCreateNote: () => void;
  onToggleSidebar: () => void;
  isOpen: boolean;
}) {
  return (
    <aside className="h-full w-full rounded-none bg-white px-4 py-4 lg:w-65 lg:px-4 lg:py-5 lg:overflow-y-auto">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-[#2b2218]">Notes</h2>
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isOpen ? "Hide notes sidebar" : "Show notes sidebar"}
          title={isOpen ? "Hide notes sidebar" : "Show notes sidebar"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/8 bg-white text-[#7b6d5c] transition hover:bg-[#f8f5f0]"
        >
          <SidebarToggleIcon side="left" isOpen={isOpen} />
        </button>
      </div>

      <button
        type="button"
        onClick={onCreateNote}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-full bg-[#db6700] text-sm font-medium text-white transition hover:bg-[#bf5b00]"
      >
        <span aria-hidden>✎</span>
        Add Note
      </button>

      <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-[0.14em] text-[#8c7b6a]">All notes</p>
          <span className="rounded-full bg-white px-2 py-1 text-[11px] font-medium text-[#92877c]">
            {notes.length}
          </span>
        </div>

        <div className="space-y-2">
          {notes.map((note) => {
            const selected = note.id === activeNoteId;

            return (
              <button
                key={note.id}
                type="button"
                onClick={() => onSelectNote(note.id)}
                className={`w-full rounded-lg px-3 py-3 text-left transition ${selected
                  ? "bg-[#fdebd9]"
                  : "bg-transparent hover:border-black/6 hover:bg-white/70"
                  }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-[#241d17]">{note.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-[#6f655c]">{note.excerpt}</p>
                  </div>
                  {note.pinned ? (
                    <span className="rounded-full bg-[#db6700] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-white">
                      Pin
                    </span>
                  ) : null}
                </div>
                {selectedVerseId && note.verseIds.includes(selectedVerseId) ? (
                  <p className="mt-2 text-[11px] font-medium text-[#b06b36]">Current verse linked</p>
                ) : null}
                <p className="mt-3 text-[11px] text-[#aea196]">{formatDate(note.updatedAt)}</p>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

function ContextRail({
  selectedReferenceLabel,
  verseText,
  contextError,
  context,
  activeTab,
  onSelectTab,
  onInsertQuote,
  canInsertQuote,
  onToggleSidebar,
  isOpen,
  mode,
}: {
  selectedReferenceLabel: string | null;
  verseText: string;
  contextError: string | null;
  context: React.ReactNode;
  activeTab: ContextTabKey;
  onSelectTab: (tab: ContextTabKey) => void;
  onInsertQuote: () => void;
  canInsertQuote: boolean;
  onToggleSidebar: () => void;
  isOpen: boolean;
  mode: "desktop" | "mobile";
}) {
  const railClassName =
    mode === "mobile"
      ? "h-full overflow-y-auto border-l border-black/6 bg-white px-4 py-5"
      : "w-full border-t border-black/6 bg-white px-4 py-5 lg:w-[320px] lg:border-l lg:border-t-0 lg:px-4 lg:py-5 lg:overflow-y-auto";

  if (!selectedReferenceLabel) {
    return (
      <aside className={railClassName}>
        <div className="mb-4 flex justify-end">
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={isOpen ? "Hide context sidebar" : "Show context sidebar"}
            title={isOpen ? "Hide context sidebar" : "Show context sidebar"}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/8 bg-white text-[#7b6d5c] transition hover:bg-[#f8f5f0]"
          >
            <SidebarToggleIcon side="right" isOpen={isOpen} />
          </button>
        </div>
        <div className="flex h-full min-h-55 flex-col items-start justify-center rounded-3xl border border-dashed border-[#e2d8ca] bg-[#fffdf9] p-5 text-[#7e7468]">
          <p className="text-sm font-medium text-[#2e2317]">Scripture</p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-[#17120e]">No verse selected</h2>
          <p className="mt-3 text-sm leading-6">
            Click a verse chip in the note, or use a detected reference from the editor, to load context here.
          </p>
        </div>
      </aside>
    );
  }

  return (
    <aside className={railClassName}>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label={isOpen ? "Hide context sidebar" : "Show context sidebar"}
          title={isOpen ? "Hide context sidebar" : "Show context sidebar"}
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-black/8 bg-white text-[#7b6d5c] transition hover:bg-[#f8f5f0]"
        >
          <SidebarToggleIcon side="right" isOpen={isOpen} />
        </button>
      </div>
      <div className="rounded-3xl border border-black/6 bg-[#fffdf9] p-4">
        <p className="text-sm text-[#2e2317]">Scripture</p>
        <h2 className="mt-4 text-3xl font-semibold tracking-tight text-[#17120e]">{selectedReferenceLabel}</h2>

        <div className="mt-4 rounded-[14px] bg-[#fae7d2] px-4 py-3 text-sm leading-6 text-[#3c2d1f]">
          {verseText || "The selected verse will appear here together with its study context."}
        </div>

        <button
          type="button"
          onClick={onInsertQuote}
          disabled={!canInsertQuote}
          className="mt-3 flex w-full items-center justify-center rounded-full bg-[#db6700] px-4 py-2.5 text-sm font-medium text-white transition hover:bg-[#bf5b00] disabled:cursor-not-allowed disabled:bg-[#d8c8b8]"
        >
          Insert quote
        </button>
      </div>

      <div className="mt-6">
        <h3 className="text-sm font-semibold text-[#2b2218]">Context</h3>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {contextTabs.map((tab) => {
            const selected = tab.key === activeTab;

            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onSelectTab(tab.key)}
                className={`rounded-md border px-3 py-2 text-left text-sm font-medium transition ${selected
                  ? "border-transparent bg-[#db6700] text-white"
                  : "border-black/8 bg-white text-[#5e5142] hover:border-[#e8d7c6] hover:bg-[#fff8f1]"
                  }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        {contextError ? <p className="mt-3 text-sm text-[#a53e1f]">{contextError}</p> : null}
        <div className="mt-4">{context}</div>
      </div>
    </aside>
  );
}

function renderContextBody(activeTab: ContextTabKey, context: VerseContext, lexiconDetails: LexiconDetailsState) {
  if (activeTab === "lexicon") {
    return (
      <div className="space-y-3">
        {context.lexicon.map((entry) => {
          const detailState = lexiconDetails[entry.strongs_id];
          const detail = detailState?.data;
          const definitionSource = detail?.definition || entry.definition;
          const occurrences = (detail?.occurrences ?? []).slice().sort((left, right) => {
            if (left.verse_id !== right.verse_id) {
              return left.verse_id.localeCompare(right.verse_id);
            }

            return left.word_order - right.word_order;
          });
          const meaning = buildLexiconMeaningPresentation(definitionSource, occurrences);

          return (
            <section key={entry.strongs_id} className="rounded-[18px] border border-black/6 bg-[#fff8f2] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.2em] text-[#a58d73]">{entry.strongs_id}</p>
                  <h4 className="mt-2 text-sm font-semibold text-[#241d17]">{entry.word}</h4>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#6a5a4a]">
                    {entry.transliteration}
                  </span>
                  <span className="text-[11px] font-medium uppercase tracking-[0.12em] text-[#b06b36]">
                    {entry.strongs_id.startsWith("G") ? "Greek" : "Hebrew"}
                  </span>
                </div>
              </div>

              <div className="mt-3 rounded-[16px] bg-white/80 px-3 py-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b06b36]">{meaning.label}</p>
                  <span className="rounded-full bg-[#f6eadb] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[#8f6d49]">
                    {meaning.confidence}
                  </span>
                </div>
                <p className="mt-1 text-sm leading-6 text-[#3e352c]">{meaning.headline}</p>
              </div>

              {meaning.senses.length > 0 ? (
                <ul className="mt-3 space-y-1.5 rounded-[14px] bg-white/80 px-3 py-3 text-sm leading-6 text-[#4a3d30]">
                  {meaning.senses.map((sense) => (
                    <li key={`${entry.strongs_id}-${sense.slice(0, 24)}`} className="flex gap-2">
                      <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#db6700]" />
                      <span>{sense}</span>
                    </li>
                  ))}
                </ul>
              ) : null}

              <div className="mt-3 rounded-[14px] border border-black/8 bg-white/70 px-3 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b6d5c]">Occurrences</p>
                {detailState?.loading ? (
                  <p className="mt-2 text-xs text-[#7f7367]">Loading examples...</p>
                ) : detailState?.error ? (
                  <p className="mt-2 text-xs text-[#a53e1f]">{detailState.error}</p>
                ) : occurrences.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {occurrences.slice(0, 5).map((occurrence) => (
                      <li
                        key={`${entry.strongs_id}-${occurrence.verse_id}-${occurrence.word_order}`}
                        className="rounded-[10px] bg-[#fffaf4] px-2.5 py-2 text-xs text-[#5d5044]"
                      >
                        <p className="font-semibold text-[#7b6045]">{formatReferenceLabel(occurrence.verse_id)}</p>
                        <p className="mt-0.5">
                          {occurrence.surface_word}
                          {occurrence.english_gloss ? ` - ${occurrence.english_gloss}` : ""}
                        </p>
                        <p className="mt-0.5 text-[#8f8171]">Word order: {occurrence.word_order}</p>
                        <p className="mt-0.5 text-[#8f8171]">
                          {occurrence.morph_code}
                          {occurrence.manuscript_type ? ` • ${occurrence.manuscript_type}` : ""}
                        </p>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-xs text-[#7f7367]">No occurrence examples available yet.</p>
                )}
              </div>

              <details className="mt-3 rounded-[14px] border border-black/8 bg-white/60 px-3 py-2 text-xs text-[#6f6458]">
                <summary className="cursor-pointer font-medium text-[#7a6d5f]">Show raw lexical entry</summary>
                <p className="mt-2 whitespace-pre-wrap leading-5 text-[#5f554b]">{definitionSource}</p>
              </details>
            </section>
          );
        })}
      </div>
    );
  }

  if (activeTab === "geography") {
    return (
      <div className="space-y-3">
        {context.locations.length > 0 ? (
          context.locations.map((location) => {
            const profile = buildLocationProfile(location.source_info);

            return (
              <section key={location.id} className="overflow-hidden rounded-[18px] border border-black/6 bg-[#fff8f2]">
                {location.image_url ? (
                  <Image
                    src={location.image_url}
                    alt={location.name}
                    width={640}
                    height={256}
                    className="h-32 w-full object-cover"
                    unoptimized
                  />
                ) : null}
                <div className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.2em] text-[#a58d73]">
                        {location.modern_name || "Unknown modern name"}
                      </p>
                      <h4 className="mt-2 text-sm font-semibold text-[#241d17]">{location.name}</h4>
                    </div>
                    <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#6a5a4a]">
                      {location.feature_type || "Location"}
                    </span>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    {location.geometry_type ? (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#7b6045]">
                        {location.geometry_type}
                      </span>
                    ) : null}
                    {location.modern_name ? (
                      <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-[#7b6045]">
                        Modern: {location.modern_name}
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#6f6458]">
                    <div className="rounded-[14px] bg-white px-3 py-2">
                      <p className="text-[#a09082]">Latitude</p>
                      <p className="mt-1 font-medium text-[#241d17]">{formatCoordinate(location.latitude, "lat")}</p>
                    </div>
                    <div className="rounded-[14px] bg-white px-3 py-2">
                      <p className="text-[#a09082]">Longitude</p>
                      <p className="mt-1 font-medium text-[#241d17]">{formatCoordinate(location.longitude, "lng")}</p>
                    </div>
                  </div>

                  <div className="mt-3 rounded-[14px] bg-white/80 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b06b36]">Overview</p>
                    <p className="mt-1 text-sm leading-6 text-[#3e352c]">{profile.overview}</p>
                  </div>

                  {profile.highlights.length > 0 ? (
                    <ul className="mt-3 space-y-1.5 rounded-[14px] bg-white/80 px-3 py-3 text-sm leading-6 text-[#4a3d30]">
                      {profile.highlights.map((highlight) => (
                        <li key={`${location.id}-${highlight.slice(0, 24)}`} className="flex gap-2">
                          <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#db6700]" />
                          <span>{highlight}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  {profile.references.length > 0 ? (
                    <div className="mt-3 rounded-[14px] border border-black/8 bg-white/70 px-3 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b6d5c]">References mentioned</p>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {profile.references.map((reference) => (
                          <span
                            key={`${location.id}-${reference}`}
                            className="rounded-full bg-[#fff6ec] px-2.5 py-1 text-[11px] font-medium text-[#7b6045]"
                          >
                            {reference}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {location.credit_url ? (
                    <a
                      href={location.credit_url}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex text-xs font-medium text-[#b06b36]"
                    >
                      Image credit
                    </a>
                  ) : null}

                  <details className="mt-3 rounded-[14px] border border-black/8 bg-white/60 px-3 py-2 text-xs text-[#6f6458]">
                    <summary className="cursor-pointer font-medium text-[#7a6d5f]">Show full location entry</summary>
                    <p className="mt-2 whitespace-pre-wrap leading-5 text-[#5f554b]">{profile.fullText}</p>
                  </details>
                </div>
              </section>
            );
          })
        ) : (
          <EmptyContextCard
            title="No geography context"
            description="This verse does not currently have linked locations in the dataset."
          />
        )}
      </div>
    );
  }

  if (activeTab === "history") {
    return (
      <div className="space-y-3">
        {context.groups.length > 0 ? (
          context.groups.map((group) => (
            <section key={group.id} className="rounded-[18px] border border-black/6 bg-[#fff8f2] p-4">
              <p className="text-[11px] uppercase tracking-[0.2em] text-[#a58d73]">Group</p>
              <h4 className="mt-2 text-sm font-semibold text-[#241d17]">{group.name}</h4>
            </section>
          ))
        ) : (
          <EmptyContextCard title="No group history" description="This verse has no group records in the current dataset." />
        )}
      </div>
    );
  }

  if (activeTab === "people") {
    return (
      <div className="space-y-3">
        {context.people.length > 0 ? (
          context.people.map((person) => {
            const profile = buildPersonProfile(person.dictionary_text);

            return (
              <section key={person.id} className="rounded-[18px] border border-black/6 bg-[#fff8f2] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.2em] text-[#a58d73]">{person.lookup_name}</p>
                    <h4 className="mt-2 text-sm font-semibold text-[#241d17]">{person.name}</h4>
                  </div>
                  <span className="rounded-full bg-white px-2.5 py-1 text-xs font-medium text-[#6a5a4a]">
                    {person.gender || "Unknown"}
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#6f6458]">
                  <div className="rounded-[14px] bg-white px-3 py-2">
                    <p className="text-[#a09082]">Birth</p>
                    <p className="mt-1 font-medium text-[#241d17]">{formatHistoricalYear(person.birth_year)}</p>
                  </div>
                  <div className="rounded-[14px] bg-white px-3 py-2">
                    <p className="text-[#a09082]">Death</p>
                    <p className="mt-1 font-medium text-[#241d17]">{formatHistoricalYear(person.death_year)}</p>
                  </div>
                </div>

                <div className="mt-3 rounded-[14px] bg-white/80 px-3 py-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#b06b36]">Overview</p>
                  <p className="mt-1 text-sm leading-6 text-[#3e352c]">{profile.overview}</p>
                </div>

                {profile.highlights.length > 0 ? (
                  <ul className="mt-3 space-y-1.5 rounded-[14px] bg-white/80 px-3 py-3 text-sm leading-6 text-[#4a3d30]">
                    {profile.highlights.map((highlight) => (
                      <li key={`${person.id}-${highlight.slice(0, 24)}`} className="flex gap-2">
                        <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#db6700]" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {profile.references.length > 0 ? (
                  <div className="mt-3 rounded-[14px] border border-black/8 bg-white/70 px-3 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[#7b6d5c]">References mentioned</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {profile.references.map((reference) => (
                        <span
                          key={`${person.id}-${reference}`}
                          className="rounded-full bg-[#fff6ec] px-2.5 py-1 text-[11px] font-medium text-[#7b6045]"
                        >
                          {reference}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <details className="mt-3 rounded-[14px] border border-black/8 bg-white/60 px-3 py-2 text-xs text-[#6f6458]">
                  <summary className="cursor-pointer font-medium text-[#7a6d5f]">Show full dictionary entry</summary>
                  <p className="mt-2 whitespace-pre-wrap leading-5 text-[#5f554b]">{profile.fullText}</p>
                </details>
              </section>
            );
          })
        ) : (
          <EmptyContextCard
            title="No people context"
            description="This verse does not currently have linked people entries."
          />
        )}
      </div>
    );
  }

  if (activeTab === "events") {
    return (
      <div className="space-y-3">
        {context.events.map((event) => (
          <section key={event.id} className="rounded-[18px] border border-black/6 bg-[#fff8f2] p-4">
            <p className="text-[11px] uppercase tracking-[0.2em] text-[#a58d73]">Event</p>
            <h4 className="mt-2 text-sm font-semibold text-[#241d17]">{event.title}</h4>
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-[#6f6458]">
              <span className="rounded-full bg-white px-2.5 py-1 font-medium">{event.start_date}</span>
              <span className="rounded-full bg-white px-2.5 py-1 font-medium">{event.duration}</span>
            </div>
          </section>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {context.cross_references.length > 0 ? (
        context.cross_references.map((reference) => (
          <div
            key={reference}
            className="rounded-[18px] border border-black/6 bg-[#fff8f0] px-4 py-3 text-sm text-[#4e4133]"
          >
            {formatReferenceLabel(reference)}
          </div>
        ))
      ) : (
        <EmptyContextCard
          title="No cross references"
          description="This verse does not currently have linked cross references."
        />
      )}
    </div>
  );
}

function EmptyContextCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-[#e2d8ca] bg-[#fffdf9] p-4 text-sm text-[#6f6458]">
      <p className="font-semibold text-[#241d17]">{title}</p>
      <p className="mt-2 leading-6">{description}</p>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function formatHistoricalYear(value: number): string {
  if (!Number.isFinite(value) || value === 0) {
    return "—";
  }

  if (value < 0) {
    return `${Math.abs(value)} BCE`;
  }

  return `${value} CE`;
}

function formatCoordinate(value: number | undefined, axis: "lat" | "lng"): string {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return "—";
  }

  const absolute = Math.abs(value).toFixed(4);

  if (axis === "lat") {
    return `${absolute} ${value >= 0 ? "N" : "S"}`;
  }

  return `${absolute} ${value >= 0 ? "E" : "W"}`;
}

function buildLocationProfile(sourceInfo: string): {
  overview: string;
  highlights: string[];
  references: string[];
  fullText: string;
} {
  const fullText = cleanDictionaryText(sourceInfo);
  const sentences = splitReadableSentences(fullText);
  const overview = pickOverviewSentence(sentences, fullText || "No location notes available.");
  const highlights = sentences
    .filter((sentence) => sentence !== overview)
    .map(simplifyProfileSentence)
    .filter((sentence) => sentence.length >= 28 && sentence.length <= 180)
    .slice(0, 4);
  const references = extractLinkedReferences(sourceInfo).slice(0, 10);

  return {
    overview,
    highlights,
    references,
    fullText: fullText || "No location notes available.",
  };
}

function buildPersonProfile(dictionaryText: string): {
  overview: string;
  highlights: string[];
  references: string[];
  fullText: string;
} {
  const fullText = cleanDictionaryText(dictionaryText);
  const sentences = splitReadableSentences(fullText);
  const overview = pickOverviewSentence(sentences, fullText);
  const highlights = sentences
    .filter((sentence) => sentence !== overview)
    .map(simplifyProfileSentence)
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 180)
    .slice(0, 4);
  const references = extractLinkedReferences(dictionaryText).slice(0, 10);

  return {
    overview,
    highlights,
    references,
    fullText,
  };
}

function cleanDictionaryText(value: string): string {
  return value
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .trim();
}

function splitReadableSentences(value: string): string[] {
  return value
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12);
}

function pickOverviewSentence(sentences: string[], fallback: string): string {
  for (const sentence of sentences) {
    if (sentence.length >= 40 && sentence.length <= 220) {
      return sentence;
    }
  }

  return fallback.length > 220 ? `${fallback.slice(0, 220)}...` : fallback || "No description available.";
}

function simplifyProfileSentence(value: string): string {
  return value
    .replace(/^this\s+(?:is|name denotes|means)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

function extractLinkedReferences(dictionaryText: string): string[] {
  const references = new Set<string>();
  const bracketed = dictionaryText.match(/\[([^\]]+)]/g) ?? [];

  for (const match of bracketed) {
    const cleaned = match.replace(/^\[|]$/g, "").trim();

    if (/\d/.test(cleaned) && /[A-Za-z]/.test(cleaned)) {
      references.add(cleaned);
    }
  }

  return Array.from(references);
}

function normalizeLexiconText(value: string): string {
  return value
    .replace(/\[[^\]]*]/g, " ")
    .replace(/__+/g, " ")
    .replace(/\(\s*[?,.;:]+\s*\)/g, "")
    .replace(/\b(?:[1-3]\s*)?[A-Z][a-z]{1,6}\.?(?:\s*\d+(?::\d+(?:-\d+)?)?)\b/g, "")
    .replace(/\b(?:LXX|NT|Od|Tr|WH|Rec|cf|compare|same place)\b\.?/gi, " ")
    .replace(/\b[IVX]+\.(?=\d)/g, "")
    .replace(/[()]/g, " ")
    .replace(/[:;,-]{2,}/g, ". ")
    .replace(/\s+/g, " ")
    .trim();
}

function summarizeLexiconFallback(definition: string): string {
  const cleaned = normalizeLexiconText(definition);
  const sentenceBreak = cleaned.search(/[.;](?:\s|$)/);

  if (sentenceBreak > 24) {
    return cleaned.slice(0, sentenceBreak + 1);
  }

  return cleaned.length > 180 ? `${cleaned.slice(0, 180)}...` : cleaned;
}

function extractLexiconHighlights(definition: string): string[] {
  const normalized = normalizeLexiconText(definition);
  const fragments = normalized
    .split(/(?:__+|;|—)/)
    .map((fragment) => cleanLexiconFragment(fragment))
    .filter(Boolean);

  const highlights: string[] = [];

  for (const fragment of fragments) {
    const pieces = fragment
      .split(/,\s*/)
      .map((piece) => cleanLexiconClause(piece))
      .filter(Boolean);

    for (const piece of pieces) {
      const highlight = findLexiconHighlight(piece);

      if (highlight) {
        highlights.push(highlight);
      }
    }
  }

  return Array.from(new Set(highlights.map((highlight) => highlight.replace(/\s+/g, " ").trim()))).slice(0, 8);
}

function buildLexiconMeaningPresentation(definition: string, occurrences: LexiconOccurrence[]) {
  const highlights = extractLexiconHighlights(definition);
  const fallback = summarizeLexiconFallback(definition);
  const usageGlosses = extractUsageGlosses(occurrences);
  const parsedHeadline = highlights[0] ?? "";

  if (isReadableMeaning(parsedHeadline)) {
    return {
      label: "Core meaning",
      confidence: "high",
      headline: parsedHeadline,
      senses: mergeUniqueMeaningItems(highlights.slice(1), usageGlosses).slice(0, 6),
    };
  }

  if (usageGlosses.length > 0) {
    return {
      label: "Likely sense",
      confidence: "medium",
      headline: usageGlosses[0],
      senses: mergeUniqueMeaningItems(usageGlosses.slice(1), highlights.filter(isReadableMeaning)).slice(0, 6),
    };
  }

  return {
    label: isReadableMeaning(fallback) ? "Working gloss" : "Raw gloss",
    confidence: isReadableMeaning(fallback) ? "medium" : "low",
    headline: fallback || "Definition unavailable.",
    senses: [],
  };
}

function extractUsageGlosses(occurrences: LexiconOccurrence[]): string[] {
  const counts = new Map<string, { label: string; count: number }>();

  for (const occurrence of occurrences) {
    const gloss = occurrence.english_gloss.replace(/\s+/g, " ").trim();

    if (!gloss) {
      continue;
    }

    const key = gloss.toLowerCase();
    const existing = counts.get(key);

    if (existing) {
      existing.count += 1;
      continue;
    }

    counts.set(key, { label: gloss, count: 1 });
  }

  return Array.from(counts.values())
    .sort((left, right) => {
      if (left.count !== right.count) {
        return right.count - left.count;
      }

      return left.label.localeCompare(right.label);
    })
    .map((item) => item.label);
}

function mergeUniqueMeaningItems(primary: string[], secondary: string[]): string[] {
  const merged = [...primary, ...secondary]
    .map((item) => item.replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return Array.from(new Set(merged));
}

function isReadableMeaning(value: string): boolean {
  const text = value.replace(/\s+/g, " ").trim();

  if (text.length < 3 || text.length > 140) {
    return false;
  }

  if (/(?:\b(?:LXX|NT|Od|Tr|WH|Rec|cf|compare|same place|Trag)\b|\b[A-Z][a-z]{1,6}\.?\s*\d(?::\d+)?)\b/i.test(text)) {
    return false;
  }

  const punctuationCount = (text.match(/[;:(){}\[\]]/g) ?? []).length;

  if (punctuationCount > 2) {
    return false;
  }

  return /[A-Za-z]/.test(text);
}

function cleanLexiconFragment(fragment: string): string {
  return fragment
    .replace(/^\s*(?:[IVX]+(?:\.\d+)?)\s*/i, "")
    .replace(
      /^\s*(?:Doric dialect|Epic dialect|Attic dialect|poetical|passive|generally|especially(?: of children)?|more commonly|frequently|rarely|absolutely|once in|with participle|with infinitive|with dative(?: of things)?|with accusative(?: of things)?|with genitive|of things|in Trag\.?|uncertain(?: in)?|so in LXX)\b[:\s,.-]*/i,
      "",
    )
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanLexiconClause(value: string): string {
  return value
    .replace(/^\s*(?:passive|generally|especially(?: of children)?|more commonly|frequently|rarely|absolutely|once in|with participle|with infinitive|with dative(?: of things)?|with accusative(?: of things)?|with genitive|of things)\b[:\s,.-]*/i, "")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findLexiconHighlight(value: string): string | null {
  const cleaned = value
    .replace(/^[:;,.-]+|[:;,.-]+$/g, "")
    .trim();

  if (!cleaned || !/[A-Za-z]/.test(cleaned)) {
    return null;
  }

  const highlightPatterns = [
    /greet with affection/i,
    /show affection(?: for the dead)?/i,
    /to be regarded with affection/i,
    /\blove\b/i,
    /be fond of(?:,)?\s*prize(?:,)?\s*desire/i,
    /be fond of/i,
    /\bprize\b/i,
    /\bdesire\b/i,
    /be well pleased(?:,)?\s*contented/i,
    /be content with/i,
    /tolerate,?\s*put up with/i,
    /persuade,?\s*entreat/i,
    /caress,?\s*pet/i,
    /denoting purpose or end/i,
    /in order that/i,
    /that,?\s*in order that/i,
  ];

  for (const pattern of highlightPatterns) {
    const match = cleaned.match(pattern);

    if (match) {
      return match[0].replace(/\s+/g, " ").trim();
    }
  }

  return null;
}