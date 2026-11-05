// The embedded passages from the customer PDFs (built by
// `npm run build:passages`). Importing the JSON file loads it into memory once,
// when the server starts, so looking passages up never reads a file.
import data from "@/lib/copper/data/passages.json";

export type Passage = {
  id: string;
  documentId: string;
  /** The document's title, e.g. "Copper Plus FAQ". */
  title: string;
  /** 1-based page number in the PDF. */
  page: number;
  /** Starts with the document title, then a few sentences. */
  text: string;
  /** Unit-length vector from the embedding model. */
  embedding: number[];
};

export const EMBEDDING_INFO = {
  model: data.model,
  dimensions: data.dimensions,
  createdAt: data.createdAt,
};

const PASSAGES: Passage[] = data.passages;

export function getPassages(): Passage[] {
  return PASSAGES;
}
