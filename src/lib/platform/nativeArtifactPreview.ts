// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Bridge to the Android-native artifact preview (see NativeArtifactPreview.kt).
 *
 * On Android the desktop artifact preview is rendered by a real WebView layered
 * over the app, not by an <iframe> scaled with a CSS transform. A WebView zooming
 * itself scales its existing tiles on the GPU and re-rasterises progressively;
 * an iframe under a CSS transform has to re-rasterise the whole subtree whenever
 * the effective scale changes, which heavy artifacts cannot do within a frame.
 *
 * Everywhere else (web, desktop) the iframe path is unchanged.
 */

interface NativeArtifactPreviewBridge {
  isAvailable(): boolean;
  show(html: string, x: number, y: number, width: number, height: number, dpr: number): void;
  setRect(x: number, y: number, width: number, height: number, dpr: number): void;
  hide(): void;
  resetZoom(): void;
}

function bridge(): NativeArtifactPreviewBridge | null {
  if (typeof window === 'undefined') return null;

  const candidate = (window as unknown as Record<string, unknown>).GrenginArtifactPreview;
  if (!candidate) return null;

  try {
    const api = candidate as NativeArtifactPreviewBridge;
    return api.isAvailable() ? api : null;
  } catch {
    return null;
  }
}

export function isNativeArtifactPreviewAvailable(): boolean {
  return bridge() != null;
}

/**
 * The artifact declares its own mobile viewport, but desktop preview means
 * "lay this out at a desktop width". Replace/insert the viewport meta so the
 * native WebView lays out at `width` CSS px and then zooms out to fit
 * (loadWithOverviewMode), which is the native equivalent of our fit scale.
 */
function withDesktopViewport(html: string, width: number): string {
  // No initial-scale: pinning it would defeat WebView.loadWithOverviewMode, which
  // is what zooms the desktop-width layout out to fit the panel (the native
  // equivalent of our fit scale).
  //
  // maximum-scale caps zoom at 1:1 with the desktop layout. Without it the
  // WebView happily zooms to 5x — roughly 14x the fit scale — and rasterising a
  // heavy artifact that large stalls frames again. 1:1 is already crisp and is
  // the most a desktop preview needs; it also matches the zoom ceiling the CSS
  // transform path enforced.
  const meta = `<meta name="viewport" content="width=${width}, maximum-scale=1">`;
  const existing = /<meta\s+[^>]*name=["']viewport["'][^>]*>/i;

  if (existing.test(html)) {
    return html.replace(existing, meta);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${meta}`);
  }

  return `${meta}${html}`;
}

interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function showNativeArtifactPreview(html: string, rect: PreviewRect): boolean {
  const api = bridge();
  if (!api) return false;

  try {
    api.show(html, rect.x, rect.y, rect.width, rect.height, window.devicePixelRatio || 1);
    return true;
  } catch (err) {
    console.error('Failed to show native artifact preview:', err);
    return false;
  }
}

function setNativeArtifactPreviewRect(rect: PreviewRect): void {
  const api = bridge();
  if (!api) return;

  try {
    api.setRect(rect.x, rect.y, rect.width, rect.height, window.devicePixelRatio || 1);
  } catch (err) {
    console.debug('Failed to move native artifact preview:', err);
  }
}

function hideNativeArtifactPreview(): void {
  const api = bridge();
  if (!api) return;

  try {
    api.hide();
  } catch (err) {
    console.debug('Failed to hide native artifact preview:', err);
  }
}

/**
 * Mount the native preview over a DOM surface and keep both layouts aligned.
 * Returning a cleanup function mirrors the lifecycle helpers used by the web
 * preview and keeps Android geometry out of the Svelte component.
 */
export function attachNativeArtifactPreview(
  surface: HTMLElement,
  html: string,
  desktopWidth: number,
): () => void {
  const previewHtml = withDesktopViewport(html, desktopWidth);
  let animationFrame = 0;
  let lastRect = '';
  let shown = false;

  const sync = () => {
    const box = surface.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return;

    const rect = { x: box.left, y: box.top, width: box.width, height: box.height };
    const rectKey = `${rect.x}|${rect.y}|${rect.width}|${rect.height}`;

    if (!shown) {
      shown = showNativeArtifactPreview(previewHtml, rect);
      if (shown) lastRect = rectKey;
      return;
    }

    if (rectKey !== lastRect) {
      lastRect = rectKey;
      setNativeArtifactPreviewRect(rect);
    }
  };

  const queueSync = () => {
    cancelAnimationFrame(animationFrame);
    animationFrame = requestAnimationFrame(sync);
  };

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queueSync);
  observer?.observe(surface);
  window.addEventListener('resize', queueSync);
  window.addEventListener('scroll', queueSync, true);
  window.visualViewport?.addEventListener('resize', queueSync);
  sync();

  return () => {
    cancelAnimationFrame(animationFrame);
    observer?.disconnect();
    window.removeEventListener('resize', queueSync);
    window.removeEventListener('scroll', queueSync, true);
    window.visualViewport?.removeEventListener('resize', queueSync);
    hideNativeArtifactPreview();
  };
}

export function resetNativeArtifactPreviewZoom(): void {
  const api = bridge();
  if (!api) return;

  try {
    api.resetZoom();
  } catch (err) {
    console.debug('Failed to reset native artifact preview zoom:', err);
  }
}
