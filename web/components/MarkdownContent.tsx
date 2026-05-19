import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface Props {
  content: string;
}

/**
 * Renders assistant message content as GitHub-flavored markdown. Links open in
 * a new tab; raw HTML is not passed through (react-markdown's safe default).
 * Code blocks render as styled <pre> without syntax highlighting — we can add
 * Prism/Shiki later if needed, but keeping the bundle small for now.
 */
export default function MarkdownContent({ content }: Props) {
  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ node, ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
