// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DOCUMENTS } from "@/lib/copper/documents";
import {
  cleanPage,
  passagesFromPage,
  splitSentences,
} from "@/lib/copper/rag/chunk";

const PAGE = `Copper Plus FAQ Copper Help Center
CSL-KB-0310 Help Center article Page 2 of 6
© 2026 Copper State Labs, Inc. · Fictional company and documents, for educational use only.
Copper Plus is a subscription. It costs $7.99 a month. It covers every device in the house.
Annual billing is $79 a year. You can cancel any time. Refunds are explained in the terms.
• Free trial: 30 days
• Priority support`;

describe("cleanPage", () => {
  it("drops the running header (title, document number, copyright)", () => {
    const text = cleanPage(PAGE);
    expect(text).not.toMatch(/CSL-KB|©|Page 2 of 6|Help Center/);
    expect(text.startsWith("Copper Plus is a subscription.")).toBe(true);
  });

  it("joins wrapped lines and turns bullets into separate sentences", () => {
    const text = cleanPage(PAGE);
    expect(text).not.toContain("\n");
    expect(text).toContain("Free trial: 30 days. Priority support");
  });
});

describe("splitSentences", () => {
  it("splits on . ? ! followed by a capital, not inside $7.99", () => {
    expect(
      splitSentences("It costs $7.99 a month. Can I cancel? Yes! Sure."),
    ).toEqual(["It costs $7.99 a month.", "Can I cancel?", "Yes!", "Sure."]);
  });
});

describe("passagesFromPage", () => {
  const input = {
    documentId: "doc",
    title: "Copper Plus FAQ",
    page: 2,
    rawText: PAGE,
  };

  it("keeps the title and page with each passage and starts the text with the title", () => {
    const passages = passagesFromPage(input);
    expect(passages.length).toBeGreaterThan(1);
    for (const p of passages) {
      expect(p.title).toBe("Copper Plus FAQ");
      expect(p.page).toBe(2);
      expect(p.documentId).toBe("doc");
      expect(p.text.startsWith("Copper Plus FAQ\n\n")).toBe(true);
    }
  });

  it("makes passages of a few sentences, never more than 3 plus a short tail", () => {
    for (const p of passagesFromPage(input)) {
      const body = p.text.slice("Copper Plus FAQ\n\n".length);
      expect(splitSentences(body).length).toBeLessThanOrEqual(4);
    }
  });

  it("makes no passages for an empty page", () => {
    expect(passagesFromPage({ ...input, rawText: "" })).toEqual([]);
  });

  it("splits a group of very long sentences early", () => {
    const long = `Word ${"word ".repeat(80).trim()}. `;
    const passages = passagesFromPage({ ...input, rawText: long.repeat(4) });
    expect(passages.length).toBeGreaterThan(1);
  });
});

// The saved file only exists after `npm run build:passages`.
const SAVED = "lib/copper/data/passages.json";
describe.skipIf(!existsSync(SAVED))("lib/copper/data/passages.json", () => {
  const load = () =>
    JSON.parse(readFileSync(SAVED, "utf8")) as {
      model: string;
      dimensions: number;
      passages: {
        id: string;
        documentId: string;
        title: string;
        page: number;
        text: string;
        embedding: number[];
      }[];
    };

  it("has passages from every document, each with title, page and an embedding", () => {
    const saved = load();
    for (const doc of DOCUMENTS) {
      const mine = saved.passages.filter((p) => p.documentId === doc.id);
      expect(mine.length, doc.title).toBeGreaterThan(0);
      for (const p of mine) {
        expect(p.title).toBe(doc.title);
        expect(p.text.startsWith(doc.title)).toBe(true);
        expect(Number.isInteger(p.page) && p.page >= 1).toBe(true);
        expect(p.embedding).toHaveLength(saved.dimensions);
      }
    }
  });

  it("was embedded with the model the app searches with", async () => {
    const { EMBEDDING_MODEL } = await import("@/lib/ai/call");
    expect(load().model).toBe(EMBEDDING_MODEL);
  });

  it("has unique ids and unit-length embeddings", () => {
    const saved = load();
    expect(new Set(saved.passages.map((p) => p.id)).size).toBe(
      saved.passages.length,
    );
    for (const p of saved.passages.slice(0, 20)) {
      const length = Math.sqrt(p.embedding.reduce((s, x) => s + x * x, 0));
      expect(length).toBeCloseTo(1, 3);
    }
  });
});

describe.skipIf(!existsSync(SAVED))("getPassages", () => {
  it("loads the saved passages in memory, the same ones as the file", async () => {
    const { getPassages } = await import("@/lib/copper/rag/passages");
    const saved = JSON.parse(readFileSync(SAVED, "utf8"));
    expect(getPassages()).toHaveLength(saved.passages.length);
    expect(getPassages()).toBe(getPassages());
  });
});
