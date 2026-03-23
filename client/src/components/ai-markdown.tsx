import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface AIMarkdownProps {
  content: string;
  className?: string;
  "data-testid"?: string;
}

export function AIMarkdown({ content, className = "", "data-testid": testId }: AIMarkdownProps) {
  return (
    <div
      className={`prose prose-sm dark:prose-invert max-w-none
        prose-headings:text-foreground prose-headings:font-semibold prose-headings:mt-3 prose-headings:mb-1.5
        prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
        prose-p:text-sm prose-p:leading-relaxed prose-p:my-1.5 prose-p:text-foreground
        prose-strong:text-foreground prose-strong:font-semibold
        prose-ul:my-1.5 prose-ul:pl-4 prose-ol:my-1.5 prose-ol:pl-4
        prose-li:text-sm prose-li:my-0.5 prose-li:text-foreground
        prose-a:text-primary prose-a:no-underline hover:prose-a:underline
        prose-hr:my-3 prose-hr:border-border
        ${className}`}
      data-testid={testId}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}
