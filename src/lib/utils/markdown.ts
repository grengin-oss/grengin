import { marked } from 'marked';
import hljs from 'highlight.js';
import DOMPurify from 'dompurify';

// Configure marked renderer for code blocks
const renderer = new marked.Renderer();

renderer.code = function({ text, lang }: { text: string; lang?: string }) {
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
