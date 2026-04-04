import { Mark, mergeAttributes, markInputRule, markPasteRule } from "@tiptap/core";
import type { DetectedReference } from "@/lib/types";
import { findReferenceMatches } from "@/lib/reference";

const HAS_HTML_TAGS = /<\/?[a-z][\s\S]*>/i;

export const VerseReferenceMark = Mark.create({
  name: "verseReference",

  inclusive: false,

  addAttributes() {
    return {
      verseId: {
        default: null,
      },
      verseLabel: {
        default: null,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span[data-verse-id]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class:
          "verse-reference inline-flex items-center rounded-full border border-[#f1c48d] bg-[#fff1db] px-2 py-0.5 font-medium text-[#8b4d11]",
      }),
      0,
    ];
  },

  addInputRules() {
    return [
      markInputRule({
        find: /\b((?:[1-3]\s)?[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?)\s+(\d+):(\d+)\b$/,
        type: this.type,
        getAttributes: (match) => {
          const reference = resolveReferenceFromMatch(match as RegExpMatchArray);

          return reference ? toMarkAttributes(reference) : {};
        },
      }),
    ];
  },

  addPasteRules() {
    return [
      markPasteRule({
        find: /\b((?:[1-3]\s)?[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?)\s+(\d+):(\d+)\b/g,
        type: this.type,
        getAttributes: (match) => {
          const reference = resolveReferenceFromMatch(match as RegExpMatchArray);

          return reference ? toMarkAttributes(reference) : {};
        },
      }),
    ];
  },
});

export function buildEditorHtml(content: string): string {
  const trimmed = content.trim();

  if (!trimmed) {
    return "<p></p>";
  }

  if (HAS_HTML_TAGS.test(trimmed)) {
      return highlightReferencesInHtml(content);
  }

  const blocks = content.split(/\n{2,}/);
  const htmlBlocks = blocks.map((block) => {
    const trimmedBlock = block.trim();

    if (!trimmedBlock) {
      return "<p></p>";
    }

    if (trimmedBlock.startsWith(">")) {
      const quoteText = trimmedBlock.replace(/^>\s?/gm, "");

      return `<blockquote><p>${highlightBibleReferences(escapeHtml(quoteText))}</p></blockquote>`;
    }

    const lines = trimmedBlock.split(/\n/).map((line) => highlightBibleReferences(escapeHtml(line)));

    return `<p>${lines.join("<br />")}</p>`;
  });

  return htmlBlocks.join("");
}

export function buildVerseQuoteHtml(reference: string, verseText: string): string {
  return `
    <blockquote data-verse-id="${escapeHtmlAttribute(reference)}" class="verse-quote">
      <p class="verse-quote-reference">${escapeHtml(reference)}</p>
      <p class="verse-quote-text">${escapeHtml(verseText)}</p>
    </blockquote>
  `;
}

export function stripHtml(content: string): string {
  if (!content) {
    return "";
  }

  return content
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

export function highlightReferencesInHtml(html: string): string {
  if (!html || typeof document === "undefined") {
    return html;
  }

  const root = document.createElement("div");
  root.innerHTML = html;

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;

    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;

      if (parent && parent.closest("[data-verse-id]")) {
        continue;
      }

      if (node.textContent?.match(/\b((?:[1-3]\s)?[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?)\s+(\d+):(\d+)\b/)) {
        textNodes.push(node as Text);
      }
    }
  }

  for (const textNode of textNodes) {
    const parent = textNode.parentNode;

    if (!parent) {
      continue;
    }

    const fragment = document.createDocumentFragment();
    const text = textNode.textContent ?? "";
    let cursor = 0;

    text.replace(
      /\b((?:[1-3]\s)?[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?)\s+(\d+):(\d+)\b/g,
      (match, _book, _chapter, _verse, offset) => {
        const reference = getReferenceFromText(match);

        if (!reference) {
          return match;
        }

        if (offset > cursor) {
          fragment.appendChild(document.createTextNode(text.slice(cursor, offset)));
        }

        const span = document.createElement("span");
        span.setAttribute("data-verse-id", reference.osisId);
        span.setAttribute("data-verse-label", reference.label);
        span.className = "verse-reference";
        span.textContent = reference.label;
        fragment.appendChild(span);

        cursor = offset + match.length;

        return match;
      },
    );

    if (cursor === 0) {
      continue;
    }

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    parent.replaceChild(fragment, textNode);
  }

  return root.innerHTML;
}

export function getReferenceFromText(text: string): DetectedReference | null {
  const first = findReferenceMatches(text)[0];

  return first ?? null;
}

function highlightBibleReferences(text: string): string {
  return text.replace(
    /\b((?:[1-3]\s)?[A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?)\s+(\d+):(\d+)\b/g,
    (fullMatch) => {
      const reference = getReferenceFromText(fullMatch);

      if (!reference) {
        return fullMatch;
      }

      return `<span data-verse-id="${escapeHtmlAttribute(reference.osisId)}" data-verse-label="${escapeHtmlAttribute(reference.label)}" class="verse-reference">${escapeHtml(reference.label)}</span>`;
    },
  );
}

function resolveReferenceFromMatch(match: RegExpMatchArray): DetectedReference | null {
  if (match.length < 4) {
    return null;
  }

  const label = `${match[1]} ${match[2]}:${match[3]}`;
  const reference = getReferenceFromText(label);

  return reference ? { label: reference.label, osisId: reference.osisId } : null;
}

function toMarkAttributes(reference: DetectedReference) {
  return {
    verseId: reference.osisId,
    verseLabel: reference.label,
  };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}