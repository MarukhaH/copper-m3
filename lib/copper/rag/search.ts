// search_docs: finds the passages in the customer PDFs that are closest in
// meaning to a question. The question is embedded the same way the passages
// were, and the passages whose vectors point the same way come back first.
import { z } from "zod";
import { callEmbed } from "@/lib/ai/call";
import { DOCUMENTS } from "@/lib/copper/documents";
import { getPassages, type Passage } from "@/lib/copper/rag/passages";

/** How many passages come back. */
export const RESULT_COUNT = 5;

export type DocResult = {
  /** 1 is the closest. */
  rank: number;
  documentId: string;
  title: string;
  page: number;
  /** Cosine similarity, 0 to 1. Higher is closer. */
  score: number;
  /** The passage, without the title that starts its stored text. */
  text: string;
  /** Opens the PDF at this page, e.g. /docs/copper-home-user-guide.pdf#page=9 */
  url: string;
};

export type DocSearch = {
  query: string;
  results: DocResult[];
  /** Set when the question couldn't be searched, so the model says so. */
  unavailable?: string;
};

export type SearchDocsInput = { query: string };

export const searchDocsInput: z.ZodType<SearchDocsInput> = z.object({
  query: z.string().trim().min(2).max(300),
});

/** A link that opens a PDF at a page. */
export function pdfLink(file: string, page: number): string {
  return `${file}#page=${page}`;
}

function normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return length === 0 ? vector : vector.map((x) => x / length);
}

const dot = (a: number[], b: number[]) =>
  a.reduce((sum, x, i) => sum + x * b[i], 0);

/** The `count` passages closest to a (unit-length) question vector. */
export function closestPassages(
  question: number[],
  passages: Passage[],
  count = RESULT_COUNT,
): { passage: Passage; score: number }[] {
  return passages
    .map((passage) => ({ passage, score: dot(question, passage.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count);
}

/** search_docs: the 5 closest passages, each with title, page and a PDF link. */
export async function searchDocs(input: SearchDocsInput): Promise<DocSearch> {
  const query = input.query.trim();

  let vector: number[];
  try {
    const [embedded] = await callEmbed(
      { module: 3, feature: "search-docs" },
      [query],
      "RETRIEVAL_QUERY",
    );
    vector = normalize(embedded);
  } catch {
    return {
      query,
      results: [],
      unavailable:
        "The documents can't be searched right now. Please try again soon.",
    };
  }

  const files = new Map(DOCUMENTS.map((doc) => [doc.id, doc.file]));
  const results = closestPassages(vector, getPassages()).map(
    ({ passage, score }, index): DocResult => ({
      rank: index + 1,
      documentId: passage.documentId,
      title: passage.title,
      page: passage.page,
      score: Math.round(score * 1000) / 1000,
      text: passage.text.slice(passage.title.length).trim(),
      url: pdfLink(files.get(passage.documentId) ?? "", passage.page),
    }),
  );
  return { query, results };
}
