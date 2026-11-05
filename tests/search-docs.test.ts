// @vitest-environment node
import { existsSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getPassages } from "@/lib/copper/rag/passages";

// Same as the other live test: use the key in .env.local when there is one.
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

// The offline tests give the search a question vector we choose, so they need
// no key. The live tests at the bottom run the real embedding model.
let nextVector: number[] | Error = [];
vi.mock("@/lib/ai/call", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/ai/call")>();
  return {
    ...original,
    callEmbed: async () => {
      if (nextVector instanceof Error) throw nextVector;
      return [nextVector];
    },
  };
});

const passageNamed = (id: string) => getPassages().find((p) => p.id === id)!;

describe("search_docs (offline)", () => {
  it("returns the 5 closest passages, closest first", async () => {
    const { searchDocs } = await import("@/lib/copper/rag/search");
    nextVector = passageNamed("copper-home-user-guide-p9-2").embedding;
    const { results } = await searchDocs({ query: "microphone fault" });
    expect(results).toHaveLength(5);
    expect(results.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5]);
    const scores = results.map((r) => r.score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    // A passage is closest to its own vector.
    expect(results[0].title).toBe("Copper Home User Guide");
    expect(results[0].page).toBe(9);
    expect(results[0].text).toContain("C-47");
  });

  it("gives each result its document title, page number and a link to that page", async () => {
    const { searchDocs } = await import("@/lib/copper/rag/search");
    nextVector = passageNamed("copper-terms-and-conditions-p4-6").embedding;
    const { results } = await searchDocs({ query: "annual refund" });
    expect(results[0]).toMatchObject({
      title: "Copper State Labs Terms and Conditions",
      page: 4,
      url: "/docs/copper-terms-and-conditions.pdf#page=4",
    });
    for (const r of results) {
      expect(r.url).toBe(`/docs/${r.documentId}.pdf#page=${r.page}`);
      // The title is its own field, not repeated at the start of the text.
      expect(r.text.startsWith(r.title)).toBe(false);
    }
  });

  it("says the documents can't be searched when embedding fails, instead of throwing", async () => {
    const { searchDocs } = await import("@/lib/copper/rag/search");
    nextVector = new Error("quota");
    const search = await searchDocs({ query: "reset Wi-Fi" });
    expect(search.results).toEqual([]);
    expect(search.unavailable).toMatch(/can't be searched/);
  });

  it("won't rank passages that were embedded with a different model", async () => {
    vi.resetModules();
    vi.doMock("@/lib/copper/rag/passages", async (importOriginal) => ({
      ...(await importOriginal<typeof import("@/lib/copper/rag/passages")>()),
      EMBEDDING_INFO: {
        model: "some-older-model",
        dimensions: 768,
        createdAt: "",
      },
    }));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    nextVector = passageNamed("copper-home-user-guide-p9-2").embedding;
    const { searchDocs } = await import("@/lib/copper/rag/search");
    const search = await searchDocs({ query: "C-47" });
    vi.doUnmock("@/lib/copper/rag/passages");
    vi.resetModules();
    expect(search.results).toEqual([]);
    expect(search.unavailable).toMatch(/can't be searched/);
    expect(JSON.stringify(spy.mock.calls)).toContain("npm run build:passages");
  });

  it("rejects a missing or empty question", async () => {
    const { searchDocsInput } = await import("@/lib/copper/rag/search");
    for (const bad of [{}, { query: "" }, { query: "  " }, { query: 5 }])
      expect(searchDocsInput.safeParse(bad).success).toBe(false);
    expect(searchDocsInput.safeParse({ query: "C-47" }).success).toBe(true);
  });

  it("is one of Copper's tools, for setup, troubleshooting, warranty and policy", async () => {
    const { copperTools } = await import("@/lib/copper/assistant/tools");
    const { TOOL_LABELS } = await import("@/lib/copper/assistant/progress");
    const { COPPER_INSTRUCTIONS } =
      await import("@/lib/copper/assistant/instructions");
    expect(Object.keys(copperTools)).toContain("search_docs");
    expect(copperTools.search_docs.description).toMatch(/page number/);
    expect(TOOL_LABELS.search_docs).toBeTruthy();
    expect(COPPER_INSTRUCTIONS).toContain("search_docs");
    for (const topic of ["setup", "troubleshooting", "warranty", "policy"])
      expect(COPPER_INSTRUCTIONS).toContain(topic);
  });
});

// Live: embeds the question with Gemini. Skipped without a key.
describe.skipIf(!process.env.GOOGLE_GENERATIVE_AI_API_KEY)(
  "search_docs (live embeddings)",
  () => {
    const find = async (query: string) => {
      const { searchDocs } = await vi.importActual<
        typeof import("@/lib/copper/rag/search")
      >("@/lib/copper/rag/search");
      const { callEmbed } =
        await vi.importActual<typeof import("@/lib/ai/call")>("@/lib/ai/call");
      // Use the real embedding model for this search.
      nextVector = (
        await callEmbed(
          { module: 3, feature: "test" },
          [query],
          "RETRIEVAL_QUERY",
        )
      )[0];
      return searchDocs({ query });
    };
    const has = (
      results: { title: string; page: number }[],
      title: string,
      page: number,
    ) => results.some((r) => r.title === title && r.page === page);

    it('"C-47" finds the Copper Home troubleshooting table on page 9', async () => {
      const { results } = await find("C-47");
      expect(has(results, "Copper Home User Guide", 9)).toBe(true);
    });

    it('"annual refund" finds the refund rule in the Terms and the Copper Plus FAQ', async () => {
      const { results } = await find("annual refund");
      expect(has(results, "Copper State Labs Terms and Conditions", 4)).toBe(
        true,
      );
      expect(has(results, "Copper Plus FAQ", 5)).toBe(true);
    });

    it('"reset Wi-Fi" finds the Wi-Fi steps in the Copper Home guide on page 4', async () => {
      const { results } = await find("reset Wi-Fi");
      expect(has(results, "Copper Home User Guide", 4)).toBe(true);
    });
  },
);
