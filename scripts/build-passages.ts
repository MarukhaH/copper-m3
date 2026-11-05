// Reads every PDF in public/docs, splits each page into passages, embeds them
// with Gemini and saves everything to lib/copper/data/passages.json, which the
// app loads into memory when it starts.
//
//   npm run build:passages            embed and save (needs the Google AI key)
//   npm run build:passages -- --dry   only count passages, no key needed
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractText, getDocumentProxy } from "unpdf";
import {
  callEmbed,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MODEL,
} from "@/lib/ai/call";
import { DOCUMENTS } from "@/lib/copper/documents";
import { passagesFromPage, type RawPassage } from "@/lib/copper/rag/chunk";

const OUT = join("lib", "copper", "data", "passages.json");
const dry = process.argv.includes("--dry");

/** Scales a vector to length 1. Shortened embeddings aren't unit length. */
function normalize(vector: number[]): number[] {
  const length = Math.sqrt(vector.reduce((sum, x) => sum + x * x, 0));
  return vector.map((x) => Math.round((x / length) * 1e6) / 1e6);
}

async function main() {
  const passages: (RawPassage & { id: string })[] = [];
  const counts: { title: string; pages: number; passages: number }[] = [];

  for (const doc of DOCUMENTS) {
    const bytes = new Uint8Array(await readFile(join("public", doc.file)));
    const pdf = await getDocumentProxy(bytes);
    const { totalPages, text } = await extractText(pdf, { mergePages: false });

    let count = 0;
    text.forEach((rawText, index) => {
      const onPage = passagesFromPage({
        documentId: doc.id,
        title: doc.title,
        page: index + 1,
        rawText,
      });
      onPage.forEach((passage, n) => {
        passages.push({
          ...passage,
          id: `${doc.id}-p${passage.page}-${n + 1}`,
        });
        count++;
      });
    });
    counts.push({ title: doc.title, pages: totalPages, passages: count });
  }

  console.table(counts);
  console.log(`Total: ${passages.length} passages`);

  if (dry) return;

  console.log(`Embedding with ${EMBEDDING_MODEL}...`);
  // Google's free tier allows 100 embedding requests a minute, so send the
  // passages in batches and wait a minute between them.
  const BATCH = 50;
  const vectors: number[][] = [];
  for (let start = 0; start < passages.length; start += BATCH) {
    if (start > 0) {
      console.log("Waiting 62 seconds for Google's per-minute limit...");
      await new Promise((resolve) => setTimeout(resolve, 62_000));
    }
    const batch = passages.slice(start, start + BATCH);
    vectors.push(
      ...(await callEmbed(
        { module: 3, feature: "embed-passages" },
        batch.map((p) => p.text),
        "RETRIEVAL_DOCUMENT",
      )),
    );
    console.log(`Embedded ${vectors.length} of ${passages.length}`);
  }

  const file = {
    model: EMBEDDING_MODEL,
    dimensions: EMBEDDING_DIMENSIONS,
    createdAt: new Date().toISOString(),
    passages: passages.map((p, i) => ({
      ...p,
      embedding: normalize(vectors[i]),
    })),
  };
  await writeFile(OUT, JSON.stringify(file));
  console.log(`Saved ${file.passages.length} passages to ${OUT}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
