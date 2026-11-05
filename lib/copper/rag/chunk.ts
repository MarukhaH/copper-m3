// Splits a PDF page into short passages for retrieval. Pure text in, text out,
// so it is easy to test and has no idea where the text came from.

export type RawPassage = {
  documentId: string;
  title: string;
  /** 1-based page number in the PDF. */
  page: number;
  /** Starts with the document title, then a few sentences. */
  text: string;
};

/** A passage is this many sentences, unless that would be very long. */
const SENTENCES_PER_PASSAGE = 3;
/** Characters. A group of sentences that runs past this is split earlier. */
const MAX_CHARS = 700;

const COPYRIGHT = /©\s*\d{4}\s+Copper State Labs/;

/**
 * Takes the running header off a page (title line, document number and page
 * number, copyright line) and turns line-wrapped text into plain paragraphs.
 */
export function cleanPage(raw: string): string {
  const lines = raw.split("\n").map((line) => line.trim());

  // Every page starts with up to three header lines ending in the copyright.
  const copyrightAt = lines.findIndex((line) => COPYRIGHT.test(line));
  const body =
    copyrightAt >= 0 && copyrightAt <= 3 ? lines.slice(copyrightAt + 1) : lines;

  return (
    body
      .filter((line) => line !== "" && !COPYRIGHT.test(line))
      .join("\n")
      // A bullet starts a new thought, so it ends the sentence before it.
      .replace(/\n•\s*/g, ". ")
      .replace(/^•\s*/, "")
      .replace(/\s*\n\s*/g, " ")
      .replace(/\s{2,}/g, " ")
      .trim()
  );
}

/** Sentences, split where a full stop, ? or ! is followed by a capital or digit. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=["“(A-Z0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && !/^[.\s]+$/.test(s));
}

/** One page of one document, as passages of a few sentences each. */
export function passagesFromPage(input: {
  documentId: string;
  title: string;
  page: number;
  rawText: string;
}): RawPassage[] {
  const sentences = splitSentences(cleanPage(input.rawText));
  const groups: string[][] = [];
  let current: string[] = [];

  for (const sentence of sentences) {
    const joined = [...current, sentence].join(" ");
    const full =
      current.length >= SENTENCES_PER_PASSAGE ||
      (current.length > 0 && joined.length > MAX_CHARS);
    if (full) {
      groups.push(current);
      current = [];
    }
    current.push(sentence);
  }
  if (current.length > 0) groups.push(current);

  // A lone short sentence left over at the end joins the passage before it.
  const last = groups[groups.length - 1];
  if (groups.length > 1 && last.length === 1 && last[0].length < 80) {
    groups[groups.length - 2].push(...groups.pop()!);
  }

  return groups.map((group) => ({
    documentId: input.documentId,
    title: input.title,
    page: input.page,
    text: `${input.title}\n\n${group.join(" ")}`,
  }));
}
