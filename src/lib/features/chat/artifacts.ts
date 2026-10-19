// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

export type ArtifactType = 'html' | 'markdown' | 'code';

/** A single artifact ready to render in the preview panel or a message card. */
export interface ArtifactItem {
  /** Persisted artifact id — used to fetch content and to download. */
  id?: string;
  title?: string;
  /** Inline content when known (live streaming). Empty for persisted artifacts
   *  loaded from history — the panel fetches those by id. */
  code: string;
  type: ArtifactType;
  /** For `code` artifacts: the highlight.js language id (e.g. `java`), derived
   *  from the file extension. Drives syntax highlighting and the download name. */
  language?: string;
  /** True while this specific artifact is still streaming in. */
  streaming?: boolean;
}

/** An artifact accumulated from the `artifact_*` SSE stream. */
export interface StreamedArtifact {
  id: string;
  title: string;
  contentType: string;
  content: string;
  streaming: boolean;
}

/** The backend's structured artifact metadata, from `message.parts.artifacts`. */
export interface MessageArtifactMeta {
  id?: string;
  file_id?: string;
  title?: string;
  content_type?: string;
}

/** Filename extension → highlight.js language id. */
const EXT_TO_LANG: Record<string, string> = {
  java: 'java', kt: 'kotlin', kts: 'kotlin', scala: 'scala', groovy: 'groovy',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', swift: 'swift',
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  mjs: 'javascript', cjs: 'javascript',
  c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp',
  cs: 'csharp', php: 'php', pl: 'perl', lua: 'lua', r: 'r', dart: 'dart',
  sh: 'bash', bash: 'bash', zsh: 'bash',
  json: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini',
  xml: 'xml', sql: 'sql', css: 'css', scss: 'scss', less: 'less',
  dockerfile: 'dockerfile', makefile: 'makefile', diff: 'diff', patch: 'diff',
};

/** Lowercased filename extension of a title, e.g. `ProductRepository.java` → `java`. */
function extensionOf(title?: string): string {
  const match = /\.([a-z0-9]+)$/i.exec((title ?? '').trim());
  return match ? match[1].toLowerCase() : '';
}

/**
 * Classify an artifact into a render kind from its title and content type.
 *
 * The **title extension wins** over the content type, because the backend tags
 * every code artifact as `application/javascript` regardless of the real
 * language (a `.java` file arrives as `application/javascript`). Only markdown
 * and real HTML documents are rendered as such; everything else — `.java`,
 * `.py`, `.sql`, … — is a `code` artifact shown as syntax-highlighted source.
 * Without this, code fell through to `html` and the iframe rendered the source
 * AS an HTML document, collapsing it into one unreadable blob.
 */
export function classifyArtifact(
  contentType: string | undefined,
  title: string | undefined,
): { type: ArtifactType; language?: string } {
  const ext = extensionOf(title);

  if (contentType === 'text/markdown' || ext === 'md' || ext === 'markdown') {
    return { type: 'markdown' };
  }
  // A real HTML document renders live in the iframe (charts, web artifacts).
  // `text/html` is a trustworthy signal (unlike the content type for code), so
  // it wins even over a misleading extension.
  if (contentType === 'text/html' || ext === 'html' || ext === 'htm') {
    return { type: 'html' };
  }
  // A code file by its extension — authoritative even though the content type
  // claims application/javascript for every code artifact.
  if (ext) {
    return { type: 'code', language: EXT_TO_LANG[ext] ?? ext };
  }
  // No usable extension (the model titled it "CSV Column Row Counter", not
  // "…​.py"). The backend tags every code artifact as application/javascript and
  // only real HTML as text/html (handled above), so any other content type is
  // code — show it highlighted and let highlight.js auto-detect the language.
  if (contentType && contentType !== 'text/html') {
    return { type: 'code' };
  }
  return { type: 'html' };
}

function defaultTitle(title: string | undefined, type: ArtifactType): string {
  if (title) return title;
  return type === 'markdown' ? 'Markdown Document' : type === 'code' ? 'Code' : 'HTML Artifact';
}

/**
 * Build renderable artifacts from the backend's structured `parts.artifacts`
 * metadata. This is the server-driven source of truth (ENGG-387): the client
 * does NOT parse `<artifact>` tags out of the message text to discover artifacts.
 * Content is not present here — the preview panel fetches it by id on demand.
 */
export function extractMessageArtifacts(metas?: MessageArtifactMeta[]): ArtifactItem[] {
  return (metas ?? [])
    .filter((m): m is MessageArtifactMeta => !!m && !!m.id)
    .map((m) => {
      const { type, language } = classifyArtifact(m.content_type, m.title);
      return { id: m.id, title: defaultTitle(m.title, type), code: '', type, language };
    });
}

/** Convert accumulated streamed artifacts into renderable items (content known). */
export function streamedToItems(streamed: StreamedArtifact[]): ArtifactItem[] {
  return streamed.map((a) => {
    const { type, language } = classifyArtifact(a.contentType, a.title);
    return { id: a.id, title: defaultTitle(a.title, type), code: a.content, type, language, streaming: a.streaming };
  });
}

/**
 * Remove the persisted `<artifact>…</artifact>` block(s) from a message's text so
 * the raw artifact source is never rendered inline in the chat bubble. This is
 * display cleanup only — artifacts are discovered from `parts.artifacts`, not
 * from this text. Only applied when the message actually has an artifact.
 */
export function stripArtifactTags(content: string): string {
  return content
    // Complete <artifact>…</artifact> blocks.
    .replace(/<artifact\b[^>]*>[\s\S]*?<\/artifact>/gi, '')
    // A trailing artifact block still streaming in (opening tag, no close yet).
    .replace(/<artifact\b[\s\S]*$/i, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
