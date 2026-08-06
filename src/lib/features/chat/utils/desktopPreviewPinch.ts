export const DESKTOP_PREVIEW_ZOOM_MIN = 0.5;
export const DESKTOP_PREVIEW_ZOOM_MAX = 2;
export const DESKTOP_PREVIEW_ZOOM_STEP = 0.1;

const SCALE_CHANGE_EPSILON = 0.001;
const ZOOM_CONVERGED_EPSILON = 0.0005;
const ZOOM_SMOOTHING = 0.55;

type PinchGesture = {
  startDistance: number;
  startZoom: number;
  startScale: number;
  startScrollLeft: number;
  startScrollTop: number;
  centerX: number;
  centerY: number;
  /** Latest finger separation, written by touchmove and read by the frame loop. */
  distance: number;
  /** Damped zoom actually being rendered, independent of reactive state. */
  liveZoom: number;
  /** Last scale handed to `previewScale`, so we can skip no-op writes. */
  appliedScale: number;
};

type DesktopPreviewPinchOptions = {
  viewport: HTMLElement;
  iframe?: HTMLIFrameElement;
  isEnabled: () => boolean;
  getZoom: () => number;
  getFitScale: () => number;
  getScale: () => number;
  /**
   * Apply a scale for the current frame. Must write the DOM directly and must
   * NOT touch reactive state — see the note on `attachDesktopPreviewPinch`.
   */
  previewScale: (scale: number) => void;
  /** Gesture finished: hand the settled zoom back to reactive state. */
  commitZoom: (zoom: number) => void;
  /** Brackets the gesture so the caller can toggle compositor hints. */
  setGestureActive: (active: boolean) => void;
};

type PinchTarget = Document | HTMLElement | Window;

export function clampDesktopPreviewZoom(value: number): number {
  return Math.min(DESKTOP_PREVIEW_ZOOM_MAX, Math.max(DESKTOP_PREVIEW_ZOOM_MIN, value));
}

/**
 * Pinch-to-zoom for the desktop artifact preview.
 *
 * The preview scales a fixed 1440x900 iframe with a CSS transform. Chromium
 * re-rasterizes an iframe's content whenever its effective scale changes, so a
 * heavy artifact — SVG especially, which has no cheap bitmap to interpolate —
 * cannot finish rasterizing within a frame. The compositor then alternates
 * between stale and fresh tiles, which reads as flicker. Light artifacts raster
 * fast enough to hide it.
 *
 * Three things here keep that from happening:
 *
 *  - The caller marks the transformed element `will-change: transform` for the
 *    duration of the gesture (via `setGestureActive`), which pins the raster
 *    scale and makes intermediate frames composite-only. One crisp re-raster
 *    happens when the hint is dropped at the end.
 *  - All DOM writes are coalesced into one `requestAnimationFrame` callback.
 *    Touch events can fire well above the display refresh rate, and each one
 *    used to trigger its own style write and reactive update.
 *  - Size, transform and scroll are written in that order within a single frame.
 *    Scroll offsets clamp against the *current* scroll extent, so anchoring the
 *    pinch point only works if the frame has already grown; the scroll write
 *    previously landed a whole frame after the transform, which visibly shifted
 *    the content and then snapped it back.
 *
 * Reactive state is deliberately left alone until the gesture ends: routing 60+
 * updates/second through it re-entered the whole derived chain and spammed the
 * `aria-live` zoom readout.
 */
export function attachDesktopPreviewPinch(options: DesktopPreviewPinchOptions): () => void {
  let gesture: PinchGesture | null = null;
  let frameHandle = 0;
  const cleanups: Array<() => void> = [];

  const canUsePinch = () => options.isEnabled() && options.viewport.isConnected;

  const touchPoint = (touch: Touch, frame?: DOMRect) => ({
    x: touch.clientX + (frame?.left ?? 0),
    y: touch.clientY + (frame?.top ?? 0),
  });

  const getTouchDistance = (touches: TouchList, frame?: DOMRect) => {
    const first = touchPoint(touches[0], frame);
    const second = touchPoint(touches[1], frame);
    return Math.hypot(second.x - first.x, second.y - first.y);
  };

  const claimPinchEvent = (event: TouchEvent) => {
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const scheduleFrame = () => {
    if (frameHandle !== 0) return;
    frameHandle = requestAnimationFrame(renderFrame);
  };

  function renderFrame(): void {
    frameHandle = 0;

    const current = gesture;
    if (!current) return;

    if (!canUsePinch()) {
      finishGesture();
      return;
    }

    const targetZoom = clampDesktopPreviewZoom(
      current.startZoom * (current.distance / current.startDistance),
    );

    // Damp touch-coordinate noise. Running this per frame rather than per touch
    // event makes the rate independent of the device's touch sampling frequency.
    const converged = Math.abs(targetZoom - current.liveZoom) < ZOOM_CONVERGED_EPSILON;
    current.liveZoom = converged
      ? targetZoom
      : current.liveZoom + (targetZoom - current.liveZoom) * ZOOM_SMOOTHING;

    const nextScale = Number((options.getFitScale() * current.liveZoom).toFixed(3));

    if (Math.abs(nextScale - current.appliedScale) >= SCALE_CHANGE_EPSILON) {
      current.appliedScale = nextScale;
      options.previewScale(nextScale);
    }

    const scaleRatio = current.appliedScale / current.startScale;
    options.viewport.scrollLeft =
      (current.startScrollLeft + current.centerX) * scaleRatio - current.centerX;
    options.viewport.scrollTop =
      (current.startScrollTop + current.centerY) * scaleRatio - current.centerY;

    // Keep running until the damped value catches up, so a finger that stops
    // moving still settles. Then stop — touchmove reschedules on the next
    // movement, which keeps a missed touchend from spinning the loop forever.
    if (!converged) {
      scheduleFrame();
    }
  }

  function finishGesture(): void {
    const settled = gesture;
    gesture = null;

    cancelAnimationFrame(frameHandle);
    frameHandle = 0;

    if (!settled) return;

    options.setGestureActive(false);

    // Commit what is on screen — the damped value, not the raw finger target —
    // so dropping the compositor hint cannot produce a visible jump.
    options.commitZoom(Number(clampDesktopPreviewZoom(settled.liveZoom).toFixed(3)));
  }

  const beginPinch = (event: TouchEvent, frame?: DOMRect) => {
    if (!canUsePinch() || event.touches.length < 2) return;

    const startDistance = getTouchDistance(event.touches, frame);
    if (startDistance <= 0) return;

    const first = touchPoint(event.touches[0], frame);
    const second = touchPoint(event.touches[1], frame);
    const viewportBounds = options.viewport.getBoundingClientRect();
    const startZoom = options.getZoom();
    const startScale = options.getScale();

    gesture = {
      startDistance,
      startZoom,
      startScale,
      startScrollLeft: options.viewport.scrollLeft,
      startScrollTop: options.viewport.scrollTop,
      centerX: (first.x + second.x) / 2 - viewportBounds.left,
      centerY: (first.y + second.y) / 2 - viewportBounds.top,
      distance: startDistance,
      liveZoom: startZoom,
      appliedScale: startScale,
    };

    options.setGestureActive(true);
    claimPinchEvent(event);
    scheduleFrame();
  };

  const movePinch = (event: TouchEvent, frame?: DOMRect) => {
    if (!canUsePinch() || event.touches.length < 2) return;

    if (!gesture) {
      beginPinch(event, frame);
      return;
    }

    const distance = getTouchDistance(event.touches, frame);
    if (distance > 0) {
      gesture.distance = distance;
    }

    scheduleFrame();
    claimPinchEvent(event);
  };

  const endPinch = (event: TouchEvent) => {
    if (event.touches.length >= 2) return;
    finishGesture();
  };

  const bindTarget = (target: PinchTarget, frameProvider?: () => DOMRect | undefined) => {
    const listenerOptions: AddEventListenerOptions = { capture: true, passive: false };
    const start: EventListener = (event) => beginPinch(event as TouchEvent, frameProvider?.());
    const move: EventListener = (event) => movePinch(event as TouchEvent, frameProvider?.());
    const end: EventListener = (event) => endPinch(event as TouchEvent);

    target.addEventListener("touchstart", start, listenerOptions);
    target.addEventListener("touchmove", move, listenerOptions);
    target.addEventListener("touchend", end, listenerOptions);
    target.addEventListener("touchcancel", end, listenerOptions);

    return () => {
      target.removeEventListener("touchstart", start, listenerOptions);
      target.removeEventListener("touchmove", move, listenerOptions);
      target.removeEventListener("touchend", end, listenerOptions);
      target.removeEventListener("touchcancel", end, listenerOptions);
    };
  };

  cleanups.push(bindTarget(options.viewport));

  if (options.iframe) {
    const iframe = options.iframe;
    let cleanupFrameTarget: (() => void) | undefined;

    const bindFrameTarget = () => {
      cleanupFrameTarget?.();
      cleanupFrameTarget = undefined;

      let frameDocument: Document | null = null;
      try {
        frameDocument = iframe.contentDocument;
      } catch {
        return;
      }

      if (!frameDocument) return;

      const root = frameDocument.documentElement;
      const body = frameDocument.body;
      const previousRootTouchAction = root.style.touchAction;
      const previousBodyTouchAction = body?.style.touchAction;
      root.style.touchAction = "pan-x pan-y";
      if (body) {
        body.style.touchAction = "pan-x pan-y";
      }

      const cleanupEvents = [
        bindTarget(frameDocument, () => iframe.getBoundingClientRect()),
        frameDocument.defaultView
          ? bindTarget(frameDocument.defaultView, () => iframe.getBoundingClientRect())
          : undefined,
      ];
      cleanupFrameTarget = () => {
        cleanupEvents.forEach((cleanup) => cleanup?.());
        root.style.touchAction = previousRootTouchAction;
        if (body && previousBodyTouchAction !== undefined) {
          body.style.touchAction = previousBodyTouchAction;
        }
      };
    };

    bindFrameTarget();
    iframe.addEventListener("load", bindFrameTarget);
    cleanups.push(() => {
      iframe.removeEventListener("load", bindFrameTarget);
      cleanupFrameTarget?.();
    });
  }

  return () => {
    // Leave the gesture bracketed even if we are torn down mid-pinch, otherwise
    // the compositor hint would stay on forever.
    if (gesture) {
      finishGesture();
    }

    cancelAnimationFrame(frameHandle);
    cleanups.forEach((cleanup) => cleanup());
  };
}
