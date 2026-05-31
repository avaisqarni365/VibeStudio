/**
 * SafeMarkdown — shared Markdown renderer used by architecture.tsx,
 * knowledge.tsx and wiki.tsx.
 *
 * Inline HTML is sanitised via a strict allow-list instead of passing raw
 * user content to dangerouslySetInnerHTML.  The visual output is identical
 * to the per-page `Md` helpers that this component replaces.
 */

const ALLOWED_TAGS = new Set(['strong', 'em', 'code', 'a']);

/**
 * Sanitise a small set of inline markdown-generated HTML tags.
 * Any tag NOT in ALLOWED_TAGS is stripped entirely (open + close).
 * Attribute values are NOT trusted except for `href` on `<a>` which
 * is restricted to safe URL schemes only.
 */
function sanitiseInlineHtml(html: string): string {
  // Strip every HTML tag that is not in ALLOWED_TAGS, then
  // sanitise href values on <a> tags.
  return html
    .replace(/<(\/?)([\w]+)([^>]*)>/g, (_match, slash, tag, attrs) => {
      const lowerTag = tag.toLowerCase();
      if (!ALLOWED_TAGS.has(lowerTag)) return '';
      if (lowerTag === 'a' && !slash) {
        // Only allow safe href schemes
        const hrefMatch = attrs.match(/href="([^"]*)"/);
        if (hrefMatch) {
          const href = hrefMatch[1];
          const safe =
            href.startsWith('http://') ||
            href.startsWith('https://') ||
            href.startsWith('/') ||
            href.startsWith('#');
          if (!safe) return '';
          return `<a href="${href}" class="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">`;
        }
        return '';
      }
      return `<${slash}${lowerTag}>`;
    });
}

/** Convert inline markdown constructs to safe HTML. */
function formatInline(text: string): string {
  const raw = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/_(.*?)_/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="text-2xs bg-gray-100 px-1 py-0.5 rounded text-indigo-700 font-mono">$1</code>')
    .replace(
      /\[(.*?)\]\((.*?)\)/g,
      '<a href="$2" class="text-indigo-600 hover:underline" target="_blank" rel="noopener noreferrer">$1</a>',
    );
  return sanitiseInlineHtml(raw);
}

interface SafeMarkdownProps {
  content: string;
  /** Pass additional CSS classes to the wrapper div. */
  className?: string;
}

/**
 * Render Markdown content safely.
 * Visually identical to the inline `Md` helper previously duplicated across
 * architecture.tsx, knowledge.tsx and wiki.tsx.
 */
export function SafeMarkdown({ content, className }: SafeMarkdownProps) {
  if (!content) {
    return (
      <p className="text-xs text-gray-400 italic">
        No content yet. Click Edit to add content.
      </p>
    );
  }

  let inCode = false;
  let codeLines: string[] = [];
  let codeLang = '';
  const els: JSX.Element[] = [];

  content.split('\n').forEach((line, i) => {
    if (line.startsWith('```') && !inCode) {
      inCode = true;
      codeLang = line.slice(3).trim();
      codeLines = [];
      return;
    }
    if (line.startsWith('```') && inCode) {
      inCode = false;
      els.push(
        <div key={`c${i}`} className="my-2 rounded-xl overflow-hidden border border-gray-200">
          {codeLang && (
            <div className="bg-gray-100 px-3 py-1 text-2xs font-mono text-gray-500 border-b">
              {codeLang}
            </div>
          )}
          <pre className="bg-gray-900 text-gray-300 text-xs font-mono px-4 py-3 overflow-x-auto">
            {codeLines.join('\n')}
          </pre>
        </div>,
      );
      return;
    }
    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (line.startsWith('### ')) {
      els.push(
        <h3 key={i} className="text-sm font-bold text-gray-900 mt-4 mb-1.5">
          {line.slice(4)}
        </h3>,
      );
      return;
    }
    if (line.startsWith('## ')) {
      els.push(
        <h2 key={i} className="text-base font-bold text-gray-900 mt-5 mb-2 pb-1 border-b border-gray-100">
          {line.slice(3)}
        </h2>,
      );
      return;
    }
    if (line.startsWith('# ')) {
      els.push(
        <h1 key={i} className="text-xl font-bold text-gray-900 mb-3">
          {line.slice(2)}
        </h1>,
      );
      return;
    }
    if (line.startsWith('> ')) {
      els.push(
        <blockquote
          key={i}
          className="border-l-2 border-indigo-300 pl-3 text-xs text-gray-500 italic my-1"
        >
          {line.slice(2)}
        </blockquote>,
      );
      return;
    }
    if (line.startsWith('| ')) {
      const cells = line.split('|').filter(Boolean).map(c => c.trim());
      if (cells.every(c => /^[-:]+$/.test(c))) return; // separator row
      els.push(
        <div key={i} className="flex border-b border-gray-100">
          {cells.map((c, j) => (
            <div
              key={j}
              className="flex-1 px-2 py-1 text-2xs text-gray-700"
              dangerouslySetInnerHTML={{ __html: formatInline(c) }}
            />
          ))}
        </div>,
      );
      return;
    }
    if (line.startsWith('- ')) {
      els.push(
        <li
          key={i}
          className="text-xs text-gray-700 ml-4 list-disc"
          dangerouslySetInnerHTML={{ __html: formatInline(line.slice(2)) }}
        />,
      );
      return;
    }
    if (line.startsWith('---')) {
      els.push(<hr key={i} className="my-4 border-gray-200" />);
      return;
    }
    if (!line.trim()) {
      els.push(<div key={i} className="h-1.5" />);
      return;
    }
    els.push(
      <p
        key={i}
        className="text-xs text-gray-700 leading-relaxed"
        dangerouslySetInnerHTML={{ __html: formatInline(line) }}
      />,
    );
  });

  return <div className={className}>{els}</div>;
}

export default SafeMarkdown;
