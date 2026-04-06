"use client";

import { useEffect, useMemo, useRef } from "react";
import { findReferenceMatches } from "@/lib/reference";
import type { VerseContext } from "@/lib/types";
import "quill/dist/quill.snow.css";

type RichNoteEditorProps = {
  noteId: number;
  content: string;
  insertQuoteSignal: number;
  onChange: (contentHtml: string, plainText: string) => void;
  onBlur: () => void;
  onSelectVerse: (verseId: string | null) => void;
  selectedVerseLabel: string | null;
  verseContext: VerseContext | null;
  onInsertVerseQuote: (contentHtml: string, plainText: string) => void;
};

type QuillRange = {
  index: number;
  length: number;
};

type QuillSource = "user" | "api" | "silent";

type QuillLike = {
  root: HTMLElement;
  clipboard: {
    dangerouslyPasteHTML: {
      (html: string, source?: QuillSource): void;
      (index: number, html: string, source?: QuillSource): void;
    };
  };
  deleteText: (index: number, length: number, source?: QuillSource) => void;
  setSelection: (index: number, length?: number, source?: QuillSource) => void;
  on: (event: "text-change" | "selection-change", handler: (range?: QuillRange | null) => void) => void;
  off: (event: "text-change" | "selection-change", handler: (range?: QuillRange | null) => void) => void;
  formatText: (
    index: number,
    length: number,
    name: string,
    value: string | boolean,
    source?: QuillSource,
  ) => void;
  getText: {
    (): string;
    (index: number, length: number): string;
  };
  getLength: () => number;
  getSelection: (focus?: boolean) => QuillRange | null;
};

function escapeHtml(text: string): string {
  const map: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  };
  return text.replace(/[&<>"']/g, (c) => map[c]);
}

export function RichNoteEditor({
  noteId,
  content,
  insertQuoteSignal,
  onChange,
  onBlur,
  onSelectVerse,
  selectedVerseLabel,
  verseContext,
  onInsertVerseQuote,
}: RichNoteEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const quillRef = useRef<QuillLike | null>(null);
  const syncingRef = useRef(false);
  const highlightRef = useRef(false);
  const contentRef = useRef(content);
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onSelectVerseRef = useRef(onSelectVerse);
  const selectedVerseLabelRef = useRef(selectedVerseLabel);
  const verseContextRef = useRef(verseContext);
  const onInsertVerseQuoteRef = useRef(onInsertVerseQuote);

  const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const modules = useMemo(
    () => ({
      toolbar: [
        ["bold", "italic", "underline"],
        ["blockquote", "code-block"],
        [{ list: "ordered" }, { list: "bullet" }],
        ["clean"],
      ],
    }),
    [],
  );

  useEffect(() => {
    contentRef.current = content;
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
    onSelectVerseRef.current = onSelectVerse;
    selectedVerseLabelRef.current = selectedVerseLabel;
    verseContextRef.current = verseContext;
    onInsertVerseQuoteRef.current = onInsertVerseQuote;
  }, [content, onChange, onBlur, onSelectVerse, selectedVerseLabel, verseContext, onInsertVerseQuote]);

  useEffect(() => {
    let disposed = false;
    const containerNode = containerRef.current;

    const init = async () => {
      if (!containerNode || quillRef.current) {
        return;
      }

      const quillModule = await import("quill");
      const QuillCtor = quillModule.default;

      if (disposed || !containerNode) {
        return;
      }

      const quill = new QuillCtor(containerNode, {
        theme: "snow",
        modules,
        placeholder: "Start writing...",
      });

      quillRef.current = quill;

      const findVerseAtCursor = (plainText: string, cursorIndex: number) => {
        const matches = findReferenceMatches(plainText);

        for (const match of matches) {
          const labelPattern = new RegExp(`\\b${escapeRegex(match.label)}\\b`, "gi");
          let result: RegExpExecArray | null;

          while ((result = labelPattern.exec(plainText)) !== null) {
            const start = result.index;
            const end = start + result[0].length;

            if (cursorIndex >= start && cursorIndex <= end) {
              return match.osisId;
            }
          }
        }

        return null;
      };

      const applyVerseHighlights = () => {
        if (!quillRef.current || highlightRef.current) {
          return;
        }

        const editor = quillRef.current;
        const plainText = editor.getText().trimEnd();
        const matches = findReferenceMatches(plainText);

        highlightRef.current = true;
        editor.formatText(0, editor.getLength(), "background", false, "silent");
        editor.formatText(0, editor.getLength(), "color", false, "silent");

        for (const match of matches) {
          const labelPattern = new RegExp(`\\b${escapeRegex(match.label)}\\b`, "gi");
          let result: RegExpExecArray | null;

          while ((result = labelPattern.exec(plainText)) !== null) {
            editor.formatText(result.index, result[0].length, "background", "#ffefd9", "silent");
            editor.formatText(result.index, result[0].length, "color", "#7a4817", "silent");
          }
        }
        highlightRef.current = false;
      };

      const handleTextChange = () => {
        if (syncingRef.current || !quillRef.current) {
          return;
        }

        applyVerseHighlights();

        const html = quillRef.current.root.innerHTML;
        const plainText = quillRef.current.getText().trimEnd();
        const verses = findReferenceMatches(plainText);
        const selection = quillRef.current.getSelection();
        const cursorIndex = selection?.index ?? plainText.length;

        onChangeRef.current(html, plainText);

        if (verses.length > 0) {
          const verseAtCursor = findVerseAtCursor(plainText, cursorIndex);
          const fallbackVerse = verses[verses.length - 1]?.osisId ?? null;
          onSelectVerseRef.current(verseAtCursor ?? fallbackVerse);
        }
      };

      const handleSelectionChange = (range?: QuillRange | null) => {
        if (range === null) {
          onBlurRef.current();
          return;
        }

        if (!range) {
          return;
        }

        if (!quillRef.current) {
          return;
        }

        const plainText = quillRef.current.getText().trimEnd();
        const cursorIndex = range.index;
        const verseAtCursor = findVerseAtCursor(plainText, cursorIndex);

        if (verseAtCursor) {
          onSelectVerseRef.current(verseAtCursor);
        }
      };

      quill.on("text-change", handleTextChange);
      quill.on("selection-change", handleSelectionChange);

      const initialHtml = contentRef.current || "";
      if (initialHtml.trim().length > 0) {
        syncingRef.current = true;
        quill.clipboard.dangerouslyPasteHTML(initialHtml, "api");
        syncingRef.current = false;
      }

      applyVerseHighlights();

      const cleanup = () => {
        quill.off("text-change", handleTextChange);
        quill.off("selection-change", handleSelectionChange);
      };

      (quill as unknown as { __cleanup?: () => void }).__cleanup = cleanup;
    };

    void init();

    return () => {
      disposed = true;

      if (quillRef.current) {
        const cleanup = (quillRef.current as unknown as { __cleanup?: () => void }).__cleanup;
        cleanup?.();
      }

      quillRef.current = null;

      if (containerNode) {
        containerNode.innerHTML = "";
      }
    };
  }, [modules]);

  useEffect(() => {
    if (!quillRef.current) {
      return;
    }

    const currentHtml = quillRef.current.root.innerHTML;
    const nextHtml = content || "";

    if (currentHtml !== nextHtml) {
      syncingRef.current = true;
      quillRef.current.clipboard.dangerouslyPasteHTML(nextHtml || "<p><br></p>", "api");
      syncingRef.current = false;
    }
  }, [content, noteId]);

  useEffect(() => {
    if (!insertQuoteSignal || !quillRef.current) {
      return;
    }

    const label = selectedVerseLabelRef.current;
    const context = verseContextRef.current;

    if (!label || !context?.verse) {
      return;
    }

    const cursorMarker = `__SCHOLIA_CURSOR_${Date.now()}__`;

    const quoteHtml = `<p><br></p><blockquote class="verse-quote"><span class="verse-quote-reference">${escapeHtml(
      label,
    )}</span> ${escapeHtml(context.verse.text)}</blockquote><p>${cursorMarker}</p>`;

    const quill = quillRef.current;
    const selection = quill.getSelection(true);
    const startIndex = selection ? selection.index : quill.getLength();
    const text = quill.getText();
    const lineBreakIndex = text.indexOf("\n", startIndex);
    const insertIndex = lineBreakIndex === -1 ? quill.getLength() : lineBreakIndex + 1;
    const beforeLength = quill.getLength();

    quill.clipboard.dangerouslyPasteHTML(insertIndex, quoteHtml, "user");

    const afterLength = quill.getLength();
    const insertedLength = Math.max(afterLength - beforeLength, 0);
    const insertedText = quill.getText(insertIndex, insertedLength);
    const markerOffset = insertedText.indexOf(cursorMarker);

    if (markerOffset !== -1) {
      const markerIndex = insertIndex + markerOffset;
      quill.deleteText(markerIndex, cursorMarker.length, "silent");
      quill.setSelection(markerIndex, 0, "silent");
    }

    const html = quill.root.innerHTML;
    const plainText = quill.getText().trimEnd();
    onChangeRef.current(html, plainText);
    onInsertVerseQuoteRef.current(html, plainText);
  }, [insertQuoteSignal]);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col rounded-[28px] border border-black/6 bg-white shadow-[0_12px_32px_rgba(26,20,14,0.05)]">
        <div className="flex items-center justify-between border-b border-black/6 px-4 py-3 text-xs text-[#8e8478]">
          <span>Editor · Type references like John 3:16 to highlight and select them.</span>
        </div>

        <div className="quill-wrapper min-h-0 flex-1 overflow-hidden">
          <div ref={containerRef} className="h-full min-h-0 bg-white" />
        </div>
      </div>
    </div>
  );
}
