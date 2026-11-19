import React, { useState } from 'react';
import { Check, Copy } from 'lucide-react';

interface MarkdownContentProps {
  content: string;
}

function renderInline(text: string): React.ReactNode[] {
  const tokens = text.split(/(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  return tokens.map((token, idx) => {
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={idx} className="font-semibold text-slate-900">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 text-[13px] font-mono bg-slate-100 text-slate-800 rounded"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    const linkMatch = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline font-medium"
        >
          {linkMatch[1]}
        </a>
      );
    }
    return <React.Fragment key={idx}>{token}</React.Fragment>;
  });
}

const CodeBlock: React.FC<{ code: string; language?: string }> = ({ code, language }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard blocked in some headless contexts
    }
  };

  return (
    <div className="my-3 rounded-lg border border-slate-200 bg-slate-950 text-slate-100 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-800 bg-slate-900 text-xs text-slate-400">
        <span className="font-mono">{language || 'code'}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white transition-colors"
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[13px] leading-relaxed font-mono">
        <code>{code}</code>
      </pre>
    </div>
  );
};

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content }) => {
  const blocks = content.split(/(```[\s\S]*?```)/g);

  return (
    <div className="space-y-2.5 text-[15px] leading-relaxed text-slate-700">
      {blocks.map((block, blockIdx) => {
        if (block.startsWith('```') && block.endsWith('```')) {
          const inner = block.slice(3, -3);
          const firstNewline = inner.indexOf('\n');
          const language = firstNewline > -1 ? inner.slice(0, firstNewline).trim() : '';
          const code = firstNewline > -1 ? inner.slice(firstNewline + 1) : inner;
          return <CodeBlock key={blockIdx} code={code.trimEnd()} language={language} />;
        }

        const lines = block.split('\n');
        const elements: React.ReactNode[] = [];
        let listBuffer: { ordered: boolean; items: string[] } | null = null;

        const flushList = (keyPrefix: string) => {
          if (!listBuffer) return;
          if (listBuffer.ordered) {
            elements.push(
              <ol key={keyPrefix} className="list-decimal pl-5 space-y-1 text-slate-700">
                {listBuffer.items.map((item, idx) => (
                  <li key={idx}>{renderInline(item)}</li>
                ))}
              </ol>
            );
          } else {
            elements.push(
              <ul key={keyPrefix} className="list-disc pl-5 space-y-1 text-slate-700">
                {listBuffer.items.map((item, idx) => (
                  <li key={idx}>{renderInline(item)}</li>
                ))}
              </ul>
            );
          }
          listBuffer = null;
        };

        lines.forEach((rawLine, lineIdx) => {
          const line = rawLine.trim();
          if (!line) {
            flushList(`list-${blockIdx}-${lineIdx}`);
            return;
          }

          if (line.startsWith('### ')) {
            flushList(`list-${blockIdx}-${lineIdx}`);
            elements.push(
              <h4 key={lineIdx} className="text-sm font-semibold text-slate-900 pt-1">
                {renderInline(line.slice(4))}
              </h4>
            );
            return;
          }
          if (line.startsWith('## ')) {
            flushList(`list-${blockIdx}-${lineIdx}`);
            elements.push(
              <h3 key={lineIdx} className="text-base font-semibold text-slate-900 pt-1">
                {renderInline(line.slice(3))}
              </h3>
            );
            return;
          }

          const bulletMatch = line.match(/^[-*]\s+(.+)$/);
          if (bulletMatch) {
            if (listBuffer && listBuffer.ordered) flushList(`list-${blockIdx}-${lineIdx}`);
            if (!listBuffer) listBuffer = { ordered: false, items: [] };
            listBuffer.items.push(bulletMatch[1]);
            return;
          }

          const orderedMatch = line.match(/^\d+\.\s+(.+)$/);
          if (orderedMatch) {
            if (listBuffer && !listBuffer.ordered) flushList(`list-${blockIdx}-${lineIdx}`);
            if (!listBuffer) listBuffer = { ordered: true, items: [] };
            listBuffer.items.push(orderedMatch[1]);
            return;
          }

          flushList(`list-${blockIdx}-${lineIdx}`);
          elements.push(<p key={lineIdx}>{renderInline(line)}</p>);
        });

        flushList(`list-end-${blockIdx}`);
        return <React.Fragment key={blockIdx}>{elements}</React.Fragment>;
      })}
    </div>
  );
};
