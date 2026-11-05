import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ReplyText, citationHref } from "@/components/copper/reply-text";
import { COPPER_INSTRUCTIONS } from "@/lib/copper/assistant/instructions";
import { DOCUMENTS } from "@/lib/copper/documents";

afterEach(cleanup);

describe("Copper's instructions for document questions", () => {
  it("send setup, troubleshooting, warranty and policy questions to search_docs, answered only from what it returns", () => {
    for (const topic of ["setup", "troubleshooting", "warranty", "policy"])
      expect(COPPER_INSTRUCTIONS).toContain(topic);
    expect(COPPER_INSTRUCTIONS).toContain("search_docs");
    expect(COPPER_INSTRUCTIONS).toMatch(/ONLY from the passages/);
    expect(COPPER_INSTRUCTIONS).toMatch(/never guess/i);
  });

  it("make every sentence cite its source, as a link to the page", () => {
    expect(COPPER_INSTRUCTIONS).toMatch(/Every sentence/);
    expect(COPPER_INSTRUCTIONS).toContain("[Copper Home User Guide, p. 9]");
    expect(COPPER_INSTRUCTIONS).toContain(
      "[Copper Home User Guide, p. 9](/docs/copper-home-user-guide.pdf#page=9)",
    );
  });

  it("give the exact not-found sentence and point to the Copper Crew", () => {
    expect(COPPER_INSTRUCTIONS).toContain(
      'say exactly "I couldn\'t find that in our support docs."',
    );
    expect(COPPER_INSTRUCTIONS).toMatch(/contacting the Copper Crew/);
  });

  it("still send shopping questions (prices, stock, totals) to the other tools", () => {
    for (const tool of ["calculate_cost", "get_products", "check_availability"])
      expect(COPPER_INSTRUCTIONS).toContain(tool);
  });

  it("use only example links that match a real document", () => {
    const links = [...COPPER_INSTRUCTIONS.matchAll(/\(\/docs\/[^)]+\)/g)].map(
      (m) => m[0].slice(1, -1).split("#")[0],
    );
    expect(links.length).toBeGreaterThan(0);
    for (const link of links)
      expect(DOCUMENTS.map((d) => d.file)).toContain(link);
  });
});

describe("citationHref", () => {
  it("opens the PDF at the cited page, whatever the title's capitalization", () => {
    expect(citationHref("Copper Home User Guide", 9)).toBe(
      "/docs/copper-home-user-guide.pdf#page=9",
    );
    expect(citationHref("copper plus faq", 5)).toBe(
      "/docs/copper-plus-faq.pdf#page=5",
    );
  });

  it("returns null for a title that isn't one of our documents", () => {
    expect(citationHref("Some Other Manual", 3)).toBeNull();
  });
});

describe("ReplyText", () => {
  it("turns a citation with a link into a link to that page", () => {
    render(
      <p>
        <ReplyText text="Unplug it for 30 seconds. [Copper Home User Guide, p. 9](/docs/copper-home-user-guide.pdf#page=9)" />
      </p>,
    );
    const link = screen.getByRole("link", {
      name: /Copper Home User Guide, p\. 9/,
    });
    expect(link).toHaveAttribute(
      "href",
      "/docs/copper-home-user-guide.pdf#page=9",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(screen.getByText(/Unplug it for 30 seconds/)).toBeInTheDocument();
  });

  it("links a citation written without a link, using the document title", () => {
    render(
      <p>
        <ReplyText text="Annual plans get a full refund within 14 days. [Copper Plus FAQ, p. 5]" />
      </p>,
    );
    expect(
      screen.getByRole("link", { name: /Copper Plus FAQ, p\. 5/ }),
    ).toHaveAttribute("href", "/docs/copper-plus-faq.pdf#page=5");
  });

  it("ignores the link the model wrote and goes by the title and page", () => {
    render(
      <p>
        <ReplyText text="Fact. [Copper Plus FAQ, p. 5](https://evil.example/x)" />
      </p>,
    );
    const link = screen.getByTestId("citation");
    expect(link).toHaveAttribute("href", "/docs/copper-plus-faq.pdf#page=5");
  });

  it("leaves a citation to an unknown document as plain text, not a link", () => {
    render(
      <p>
        <ReplyText text="Something. [Some Other Manual, p. 3](https://evil.example/x)" />
      </p>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText(/\[Some Other Manual, p\. 3\]/),
    ).toBeInTheDocument();
  });

  it("links every citation in a reply and draws **bold**", () => {
    render(
      <p>
        <ReplyText text="**C-47** is a microphone fault. [Copper Home User Guide, p. 9] Contact us. [Copper State Labs Terms and Conditions, p. 4]" />
      </p>,
    );
    expect(screen.getAllByTestId("citation")).toHaveLength(2);
    expect(screen.getByText("C-47").tagName).toBe("STRONG");
  });

  it("shows a reply with no citations as it is", () => {
    render(
      <p>
        <ReplyText text="I couldn't find that in our support docs. Please contact the Copper Crew." />
      </p>,
    );
    expect(screen.queryByRole("link")).toBeNull();
    expect(
      screen.getByText(/I couldn't find that in our support docs/),
    ).toBeInTheDocument();
  });
});
