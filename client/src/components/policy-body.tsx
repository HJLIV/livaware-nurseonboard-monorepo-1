// Shared renderer for policy body text. Used by both the nurse-facing
// portal page and the admin "Preview" tab so the two views are
// guaranteed to look the same.
//
// The body field is treated as Markdown (admins can paste in
// markdown-ish text and the importer also produces Markdown), but
// existing plain-text policies still render correctly because:
//   - blank-line paragraph breaks are preserved by the Markdown spec,
//   - `remark-breaks` turns single newlines into <br/> so plain-text
//     policies that wrap with hard newlines still keep their line
//     structure (no paragraph collapse).

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import { cn } from "@/lib/utils";

interface PolicyBodyProps {
  body: string | null | undefined;
  className?: string;
  "data-testid"?: string;
}

export function PolicyBody({ body, className, "data-testid": testId }: PolicyBodyProps) {
  if (!body) return null;
  return (
    <div
      className={cn(
        "policy-body prose prose-sm dark:prose-invert max-w-none text-muted-foreground",
        "prose-headings:font-serif prose-headings:font-light prose-headings:tracking-tight prose-headings:text-foreground",
        "prose-h1:text-xl prose-h1:mt-4 prose-h1:mb-2",
        "prose-h2:text-lg prose-h2:mt-4 prose-h2:mb-2",
        "prose-h3:text-base prose-h3:mt-3 prose-h3:mb-1.5",
        "prose-p:text-sm prose-p:leading-relaxed prose-p:my-2",
        "prose-strong:text-foreground prose-strong:font-semibold",
        "prose-ul:my-2 prose-ul:pl-5 prose-ol:my-2 prose-ol:pl-5",
        "prose-li:text-sm prose-li:my-0.5",
        "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
        "prose-blockquote:border-l-2 prose-blockquote:border-primary/40 prose-blockquote:pl-3 prose-blockquote:italic",
        "prose-hr:my-4 prose-hr:border-border",
        "prose-table:text-sm prose-table:my-3 prose-table:border prose-table:border-border",
        "prose-th:border prose-th:border-border prose-th:bg-muted/40 prose-th:px-2 prose-th:py-1 prose-th:text-left",
        "prose-td:border prose-td:border-border prose-td:px-2 prose-td:py-1 prose-td:align-top",
        "prose-code:rounded prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:text-xs prose-code:before:content-none prose-code:after:content-none",
        className,
      )}
      data-testid={testId}
    >
      {/* remark-breaks turns single newlines into <br/> so legacy
          plain-text policies that use single-line wrapping (instead of
          blank-line paragraph breaks) still render with their original
          line structure preserved. Markdown-formatted policies are
          unaffected. */}
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]}>{body}</ReactMarkdown>
    </div>
  );
}
