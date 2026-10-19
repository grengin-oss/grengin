// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Lazy Mermaid rendering for artifact markdown previews.
 *
 * Mermaid is a large dependency (~500KB), so it is imported dynamically and only
 * when a diagram is actually on screen — it never weighs on the main bundle. The
 * markdown renderer emits ```mermaid fences as `<pre class="mermaid-source">`
 * blocks; this turns those into rendered SVG diagrams in place.
 */

type MermaidApi = typeof import('mermaid').default;

let mermaidPromise: Promise<MermaidApi> | null = null;

function loadMermaid(): Promise<MermaidApi> {
  if (!mermaidPromise) {
    mermaidPromise = import('mermaid').then((m) => m.default);
  }
  return mermaidPromise;
}

let idSeq = 0;

/**
 * Render every `.mermaid-source` block inside `container` as a diagram.
 *
 * - No-op (and no mermaid import) when the container has no diagrams.
 * - `securityLevel: 'strict'` disables HTML in labels and click handlers, so
 *   untrusted diagram source can't inject scripts.
 * - An invalid diagram falls back to showing its source, so nothing is lost.
 */
export async function renderMermaidDiagrams(
  container: HTMLElement,
  isDark: boolean,
): Promise<void> {
  const blocks = Array.from(
    container.querySelectorAll<HTMLElement>('.mermaid-source'),
  );
  if (blocks.length === 0) return;

  const mermaid = await loadMermaid();
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    theme: isDark ? 'dark' : 'default',
  });

  for (const block of blocks) {
    const source = (block.textContent ?? '').trim();
    if (!source) continue;

    const wrapper = document.createElement('div');
    wrapper.className = 'mermaid-diagram';
    try {
      const { svg } = await mermaid.render(`mermaid-${Date.now()}-${idSeq++}`, source);
      wrapper.innerHTML = svg;
    } catch (err) {
      const pre = document.createElement('pre');
      pre.className = 'mermaid-error';
      pre.textContent = source;
      wrapper.appendChild(pre);
      console.error('Mermaid render error:', err);
    }
    block.replaceWith(wrapper);
  }
}
