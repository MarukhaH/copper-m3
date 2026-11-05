import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// The card never calls the server action; this keeps the AI code out of it.
vi.mock("@/lib/copper/assistant/ask", () => ({ askCopper: vi.fn() }));

import { ToolCard } from "@/components/copper/ask-copper";
import type { ToolStep } from "@/lib/copper/assistant/progress";

afterEach(cleanup);

const step = (
  output: unknown,
  state: ToolStep["state"] = "done",
): ToolStep => ({
  type: "tool",
  id: "t1",
  name: "search_docs",
  state,
  input: { query: "C-47" },
  output,
});

const results = [
  {
    rank: 1,
    documentId: "copper-home-user-guide",
    title: "Copper Home User Guide",
    page: 9,
    score: 0.588,
    text: "C-47 Microphone array fault Unplug Copper Home for 30 seconds.",
    url: "/docs/copper-home-user-guide.pdf#page=9",
  },
  {
    rank: 2,
    documentId: "copper-terms-and-conditions",
    title: "Copper State Labs Terms and Conditions",
    page: 4,
    score: 0.569,
    text: "Annual: full refund if you cancel within 14 days.",
    url: "/docs/copper-terms-and-conditions.pdf#page=4",
  },
];

describe("search_docs tool card", () => {
  it("shows what Copper searched for", () => {
    render(<ToolCard step={step({ query: "C-47", results })} number={1} />);
    const card = screen.getByTestId("tool-call");
    expect(card).toHaveAttribute("data-tool", "search_docs");
    expect(within(card).getByText("C-47")).toBeInTheDocument();
  });

  it("shows each passage with its document title, page and a link that opens the PDF at that page", () => {
    render(<ToolCard step={step({ query: "C-47", results })} number={1} />);
    const list = screen.getByTestId("doc-results");
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(
      within(list).getByText("Copper Home User Guide"),
    ).toBeInTheDocument();
    expect(within(list).getByText("Page 9")).toBeInTheDocument();
    expect(
      within(list).getByText(/Microphone array fault/),
    ).toBeInTheDocument();

    const link = within(list).getByRole("link", {
      name: /Open the PDF at page 9/,
    });
    expect(link).toHaveAttribute(
      "href",
      "/docs/copper-home-user-guide.pdf#page=9",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(
      within(list).getByRole("link", { name: /Open the PDF at page 4/ }),
    ).toHaveAttribute("href", "/docs/copper-terms-and-conditions.pdf#page=4");
  });

  it("says so when the documents can't be searched", () => {
    render(
      <ToolCard
        step={step({
          query: "C-47",
          results: [],
          unavailable: "The documents can't be searched right now.",
        })}
        number={1}
      />,
    );
    expect(screen.getByText(/can't be searched right now/)).toBeInTheDocument();
    expect(screen.queryByTestId("doc-results")).toBeNull();
  });
});
