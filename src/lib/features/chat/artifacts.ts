export type ArtifactType = 'html' | 'markdown';

/** A single artifact ready to render in the preview panel or a message card. */
export interface ArtifactItem {
  /** Persisted artifact id — used to fetch content and to download. */
  id?: string;
  title?: string;
  /** Inline content when known (live streaming). Empty for persisted artifacts
   *  loaded from history — the panel fetches those by id. */
  code: string;
  type: ArtifactType;
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

function typeFromContentType(contentType?: string): ArtifactType {
  return contentType === 'text/markdown' ? 'markdown' : 'html';
}

function defaultTitle(title: string | undefined, type: ArtifactType): string {
  return title || (type === 'markdown' ? 'Markdown Document' : 'HTML Artifact');
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
      const type = typeFromContentType(m.content_type);
      return { id: m.id, title: defaultTitle(m.title, type), code: '', type };
    });
}

/** Convert accumulated streamed artifacts into renderable items (content known). */
export function streamedToItems(streamed: StreamedArtifact[]): ArtifactItem[] {
  return streamed.map((a) => {
    const type = typeFromContentType(a.contentType);
    return { id: a.id, title: defaultTitle(a.title, type), code: a.content, type, streaming: a.streaming };
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
