export const DESKTOP_PREVIEW_ZOOM_MIN = 0.5;
export const DESKTOP_PREVIEW_ZOOM_MAX = 2;
export const DESKTOP_PREVIEW_ZOOM_STEP = 0.1;

const ZOOM_CHANGE_EPSILON = 0.002;
const ZOOM_SMOOTHING = 0.55;

type PinchGesture = {
  startDistance: number;
  startZoom: number;
  startScale: number;
  startScrollLeft: number;
  startScrollTop: number;
  centerX: number;
  centerY: number;
};

type DesktopPreviewPinchOptions = {
  viewport: HTMLElement;
  iframe?: HTMLIFrameElement;
  isEnabled: () => boolean;
  getZoom: () => number;
  setZoom: (zoom: number) => void;
  getFitScale: () => number;
  getScale: () => number;
};

type PinchTarget = Document | HTMLElement | Window;

export function clampDesktopPreviewZoom(value: number): number {
  return Math.min(DESKTOP_PREVIEW_ZOOM_MAX, Math.max(DESKTOP_PREVIEW_ZOOM_MIN, value));
}

export function attachDesktopPreviewPinch(options: DesktopPreviewPinchOptions): () => void {
  let gesture: PinchGesture | null = null;
  let scrollFrame = 0;
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

  const beginPinch = (event: TouchEvent, frame?: DOMRect) => {
    if (!canUsePinch() || event.touches.length < 2) return;

    const startDistance = getTouchDistance(event.touches, frame);
    if (startDistance <= 0) return;

    const first = touchPoint(event.touches[0], frame);
    const second = touchPoint(event.touches[1], frame);
    const viewportBounds = options.viewport.getBoundingClientRect();

    gesture = {
      startDistance,
      startZoom: options.getZoom(),
      startScale: options.getScale(),
      startScrollLeft: options.viewport.scrollLeft,
      startScrollTop: options.viewport.scrollTop,
      centerX: (first.x + second.x) / 2 - viewportBounds.left,
      centerY: (first.y + second.y) / 2 - viewportBounds.top,
    };

    claimPinchEvent(event);
  };

  const movePinch = (event: TouchEvent, frame?: DOMRect) => {
    if (!canUsePinch() || event.touches.length < 2) return;

    if (!gesture) {
      beginPinch(event, frame);
      return;
    }

    const currentGesture = gesture;
    const distance = getTouchDistance(event.touches, frame);
    const targetZoom = clampDesktopPreviewZoom(
      currentGesture.startZoom * (distance / currentGesture.startDistance),
    );
    const currentZoom = options.getZoom();
    const smoothedZoom = currentZoom + (targetZoom - currentZoom) * ZOOM_SMOOTHING;
    const nextZoom = Number(smoothedZoom.toFixed(3));

    if (Math.abs(nextZoom - currentZoom) < ZOOM_CHANGE_EPSILON) {
      claimPinchEvent(event);
      return;
    }

    const nextScale = Number((options.getFitScale() * nextZoom).toFixed(3));
    const scaleRatio = nextScale / currentGesture.startScale;

    options.setZoom(nextZoom);

    cancelAnimationFrame(scrollFrame);
    scrollFrame = requestAnimationFrame(() => {
      options.viewport.scrollLeft =
        (currentGesture.startScrollLeft + currentGesture.centerX) * scaleRatio -
        currentGesture.centerX;
      options.viewport.scrollTop =
        (currentGesture.startScrollTop + currentGesture.centerY) * scaleRatio -
        currentGesture.centerY;
    });

    claimPinchEvent(event);
  };

  const endPinch = (event: TouchEvent) => {
    if (event.touches.length >= 2) return;
    gesture = null;
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
    cancelAnimationFrame(scrollFrame);
    cleanups.forEach((cleanup) => cleanup());
  };
}
