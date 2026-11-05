// Copper's reply as text, with each citation like [Copper Home User Guide, p. 9]
// drawn as a link that opens that PDF at that page. The page comes from the
// document title (not from whatever link the model wrote), so a made-up link
// can't send anyone somewhere else. **bold** is drawn bold.
import { ExternalLinkIcon } from "lucide-react";
import { DOCUMENTS } from "@/lib/copper/documents";

// [Title, p. 9] with an optional (link) after it, or **bold**.
const PARTS = /(\[[^\]\n]+?,\s*p\.\s*\d+\](?:\([^)\s]*\))?|\*\*[^*]+\*\*)/;
const CITATION = /^\[([^\]\n]+?),\s*p\.\s*(\d+)\]/;

/** Where a cited page lives, or null when the title isn't one of our documents. */
export function citationHref(title: string, page: number): string | null {
  const doc = DOCUMENTS.find(
    (d) => d.title.toLowerCase() === title.trim().toLowerCase(),
  );
  return doc ? `${doc.file}#page=${page}` : null;
}

export function ReplyText({ text }: { text: string }) {
  return text.split(PARTS).map((part, i) => {
    const citation = CITATION.exec(part);
    if (citation) {
      const title = citation[1].trim();
      const page = Number(citation[2]);
      const href = citationHref(title, page);
      const label = `[${title}, p. ${page}]`;
      if (!href) return label;
      return (
        <a
          key={i}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="citation"
          className="text-primary inline-flex items-baseline gap-0.5 font-medium underline underline-offset-2"
        >
          {label}
          <ExternalLinkIcon className="size-3 self-center" />
        </a>
      );
    }
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    return part;
  });
}
