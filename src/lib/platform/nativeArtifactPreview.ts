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
export function withDesktopViewport(html: string, width: number): string {
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
  const injected = meta + SCALE_REPORTER;
  const existing = /<meta\s+[^>]*name=["']viewport["'][^>]*>/i;

  if (existing.test(html)) {
    return html.replace(existing, injected);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head[^>]*>/i, (head) => `${head}${injected}`);
  }

  return `${injected}${html}`;
}

/**
 * Reports the preview page's zoom state out to the host, so the host can size the
 * preview card to the rendered page and let it grow as the user pinches.
 * visualViewport fires on both pinch and pan.
 */
const SCALE_REPORTER = `<script>(function(){
  var vv = window.visualViewport;
  if (!vv || typeof GrenginPreviewReport === 'undefined') return;
  var last = -1;
  function report() {
    var s = vv.scale;
    if (Math.abs(s - last) < 0.001) return;
    last = s;
    try {
      GrenginPreviewReport.report(s,
        document.documentElement.scrollWidth,
        document.documentElement.scrollHeight);
    } catch (e) {}
  }
  vv.addEventListener('resize', report);
  vv.addEventListener('scroll', report);
  window.addEventListener('load', report);
  report();
})();</script>`;

export interface NativePreviewViewport {
  scale: number;
  contentWidth: number;
  contentHeight: number;
}

/** Subscribe to the native preview's zoom state. Returns an unsubscribe fn. */
export function onNativeArtifactPreviewViewport(
  listener: (viewport: NativePreviewViewport) => void
): () => void {
  if (typeof window === 'undefined') return () => {};

  const handler = (event: Event) => {
    const detail = (event as CustomEvent).detail;
    if (!detail || typeof detail.scale !== 'number' || !(detail.scale > 0)) return;

    listener({
      scale: detail.scale,
      contentWidth: Number(detail.contentWidth) || 0,
      contentHeight: Number(detail.contentHeight) || 0,
    });
  };

  window.addEventListener('grengin-artifact-preview-scale', handler);
  return () => window.removeEventListener('grengin-artifact-preview-scale', handler);
}

/** Layout width below which we stop narrowing: keeps desktop breakpoints active. */
const MIN_DESKTOP_LAYOUT_WIDTH = 1024;
/** Fit scales below this are too small to read on a phone. */
const MIN_READABLE_FIT_SCALE = 0.4;

/**
 * Desktop layout width to use for a preview panel of the given CSS width.
 *
 * Fitting a full 1440px layout into a ~360px phone panel lands around 25%, which
 * renders body text at roughly four pixels — the "too wide to read" case. Narrow
 * the layout on small panels so the fit scale stays usable, but never below
 * 1024px, since most desktop breakpoints (and this app's own) key off ~1000px and
 * going under it would show the mobile layout in "desktop" preview.
 */
export function desktopLayoutWidthFor(panelCssWidth: number, max = 1440): number {
  if (!Number.isFinite(panelCssWidth) || panelCssWidth <= 0) return max;

  const wanted = panelCssWidth / MIN_READABLE_FIT_SCALE;
  return Math.round(Math.min(max, Math.max(MIN_DESKTOP_LAYOUT_WIDTH, wanted)));
}

export interface PreviewRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function showNativeArtifactPreview(html: string, rect: PreviewRect): boolean {
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

export function setNativeArtifactPreviewRect(rect: PreviewRect): void {
  const api = bridge();
  if (!api) return;

  try {
    api.setRect(rect.x, rect.y, rect.width, rect.height, window.devicePixelRatio || 1);
  } catch (err) {
    console.debug('Failed to move native artifact preview:', err);
  }
}

export function hideNativeArtifactPreview(): void {
  const api = bridge();
  if (!api) return;

  try {
    api.hide();
  } catch (err) {
    console.debug('Failed to hide native artifact preview:', err);
  }
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
