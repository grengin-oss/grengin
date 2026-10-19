// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { marked } from 'marked';
import hljs from 'highlight.js/lib/common';
import DOMPurify from 'dompurify';

import { escapeHtml } from './html';

// Configure marked renderer for code blocks
const renderer = new marked.Renderer();

renderer.link = function({ href, title, text }: { href: string; title?: string | null; text: string }) {
  const titleAttr = title ? ` title="${title}"` : '';
  return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
};

renderer.code = function({ text, lang }: { text: string; lang?: string }) {
  // Mermaid fences aren't highlighted — they carry the raw diagram source in a
  // tagged block that the artifact panel later turns into a rendered diagram.
  // Anywhere the diagram isn't upgraded (e.g. chat), it degrades to a code block.
  if (lang === 'mermaid') {
    return `<pre class="mermaid-source"><code>${escapeHtml(text)}</code></pre>`;
  }
  if (lang && hljs.getLanguage(lang)) {
    try {
      const highlighted = hljs.highlight(text, { language: lang }).value;
      return `<pre><code class="hljs language-${lang}">${highlighted}</code></pre>`;
    } catch (err) {
      console.error('Highlight error:', err);
    }
  }
  const highlighted = hljs.highlightAuto(text).value;
  return `<pre><code class="hljs">${highlighted}</code></pre>`;
};

marked.setOptions({
  renderer,
  breaks: true,
  gfm: true,
});

// The common bundle (~37 languages, incl. Java and every mainstream one) is
// loaded eagerly for chat markdown. The full highlight.js build (~190 languages)
// is pulled in lazily, once, for a rarer language or for auto-detection.
let fullHljsPromise: Promise<typeof hljs> | null = null;

function loadFullHljs(): Promise<typeof hljs> {
  if (!fullHljsPromise) {
    fullHljsPromise = import('highlight.js').then((m) => m.default);
  }
  return fullHljsPromise;
}

// highlight.js escapes the tokens it emits, but the output lands in `{@html}`,
// so sanitise defensively — allowing only the `<span class>` markup it uses.
function sanitizeHighlighted(value: string): string {
  return DOMPurify.sanitize(value, { ALLOWED_TAGS: ['span'], ALLOWED_ATTR: ['class'] });
}

/**
 * Syntax-highlight a standalone source file into HTML for `{@html}`.
 *
 * Used by the artifact panel to render a `code` artifact (e.g. a `.java` file).
 * With a known language it highlights precisely — lazily loading the full build
 * for a grammar outside the common set. With no language hint it auto-detects
 * against the common set (reliable for mainstream languages; auto-detection of
 * rarer ones is inherently fuzzy — those are accurate when the title carries an
 * extension). highlight.js escapes its tokens; output is also sanitised.
 */
export async function highlightCode(code: string, language?: string): Promise<string> {
  try {
    if (language) {
      const hl = hljs.getLanguage(language) ? hljs : await loadFullHljs().catch(() => hljs);
      if (hl.getLanguage(language)) {
        return sanitizeHighlighted(hl.highlight(code, { language }).value);
      }
    }
    return sanitizeHighlighted(hljs.highlightAuto(code).value);
  } catch (err) {
    console.error('Highlight error:', err);
    return escapeHtml(code);
  }
}

/**
 * Render markdown to HTML with syntax highlighting
 */
export function renderMarkdown(content: string): string {
  const rawHtml = marked.parse(content) as string;
  return DOMPurify.sanitize(rawHtml, {
    ALLOWED_TAGS: [
      'p', 'br', 'strong', 'em', 'u', 's', 'code', 'pre',
      'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
      'ul', 'ol', 'li',
      'blockquote',
      'a', 'img',
      'table', 'thead', 'tbody', 'tr', 'th', 'td',
      'span', 'div',
    ],
    ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
  });
}

/**
 * Extract code blocks from markdown
 */
export function extractCodeBlocks(content: string): Array<{ lang: string; code: string }> {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: Array<{ lang: string; code: string }> = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    blocks.push({
      lang: match[1] || 'plaintext',
      code: match[2].trim(),
    });
  }

  return blocks;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}
