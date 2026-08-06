<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts" module>
  // Types
  export type ToastType = 'success' | 'error' | 'loading' | 'blank';
  export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

  export const NOTIFICATIONS_STREAM_TOAST_ID = 'notifications-stream';

  export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    icon?: string;
    duration: number;
    position: ToastPosition;
    visible: boolean;
    createdAt: number;
    description?: string;
    onClick?: () => void;
    onDismiss?: () => void;
    streamAlert?: boolean;
  }

  export interface ToastOptions {
    id?: string;
    icon?: string;
    duration?: number;
    position?: ToastPosition;
    description?: string;
    onClick?: () => void;
    onDismiss?: () => void;
    streamAlert?: boolean;
  }

  // Constants
  const DURATIONS: Record<ToastType, number> = {
    success: 2000,
    error: 4000,
    loading: Infinity,
    blank: 4000,
  };

  // State
  let toasts = $state<Toast[]>([]);
  let counter = 0;
  const timeouts = new Map<string, ReturnType<typeof setTimeout>>();
  /** Completion timers after `dismiss()` sets `visible: false` (must be cancelled by `remove()` and superseded dismiss). */
  const dismissCompleteTimers = new Map<string, ReturnType<typeof setTimeout>>();
  const DISMISS_ALL_KEY = '__all__';

  function isStreamToastId(id: string): boolean {
    return id === NOTIFICATIONS_STREAM_TOAST_ID;
  }

  function clearToastTimeout(id: string): void {
    const prev = timeouts.get(id);
    if (prev) clearTimeout(prev);
    timeouts.delete(id);
  }

  function clearDismissCompleteTimer(key: string): void {
    const h = dismissCompleteTimers.get(key);
    if (h) clearTimeout(h);
    dismissCompleteTimers.delete(key);
  }

  function clearAllDismissCompleteTimers(): void {
    dismissCompleteTimers.forEach((h) => clearTimeout(h));
    dismissCompleteTimers.clear();
  }

  // Core functions
  function create(message: string, type: ToastType, opts: ToastOptions = {}): string {
    const id = opts.id || `t-${++counter}`;
    const duration = opts.duration ?? DURATIONS[type];
    const existing = toasts.find((t) => t.id === id);
    const streamAlert = opts.streamAlert ?? isStreamToastId(id);

    const newToast: Toast = {
      id,
      type,
      message,
      icon: opts.icon,
      duration,
      position: opts.position ?? 'top-center',
      visible: true,
      createdAt: Date.now(),
      description: opts.description,
      onClick: opts.onClick,
      onDismiss: opts.onDismiss,
      streamAlert,
    };

    if (existing) {
      clearToastTimeout(id);
      toasts = toasts.map((t) => (t.id === id ? newToast : t));
    } else {
      toasts = [newToast, ...toasts].slice(0, 20);
    }

    if (duration !== Infinity) {
      timeouts.set(
        id,
        setTimeout(() => {
          dismiss(id);
          timeouts.delete(id);
        }, duration)
      );
    }

    return id;
  }

  function dismiss(id?: string): void {
    const ids =
      id === undefined ? toasts.map((t) => t.id) : toasts.filter((t) => t.id === id).map((t) => t.id);
    const callbacks = ids.map((tid) => toasts.find((t) => t.id === tid)?.onDismiss);

    for (const tid of ids) {
      clearToastTimeout(tid);
    }

    if (id === undefined) {
      clearAllDismissCompleteTimers();
    } else {
      for (const tid of ids) {
        clearDismissCompleteTimer(tid);
      }
    }

    toasts = toasts.map((t) => (id === undefined || t.id === id ? { ...t, visible: false } : t));

    const timerKey = id === undefined ? DISMISS_ALL_KEY : id;
    const handle = window.setTimeout(() => {
      dismissCompleteTimers.delete(timerKey);
      for (let i = 0; i < ids.length; i++) {
        // Skip if `remove()` already dropped the toast (e.g. `__all__` timer after partial `remove(id)`).
        if (toasts.some((t) => t.id === ids[i])) {
          callbacks[i]?.();
        }
      }
      toasts = id ? toasts.filter((t) => t.id !== id) : [];
    }, 300);
    dismissCompleteTimers.set(timerKey, handle);
  }

  /** Immediate removal from the stack. Does not call `onDismiss` — use `dismiss()` for lifecycle + animation. */
  function remove(id?: string): void {
    if (id) {
      clearToastTimeout(id);
      clearDismissCompleteTimer(id);
      toasts = toasts.filter((x) => x.id !== id);
    } else {
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      clearAllDismissCompleteTimers();
      toasts = [];
    }
  }

  // Promise helper
  async function toastPromise(
    p: Promise<unknown>,
    msgs: { loading: string; success: string | ((d: unknown) => string); error: string | ((e: unknown) => string) },
    opts?: ToastOptions
  ): Promise<unknown> {
    const id = create(msgs.loading, 'loading', { icon: '\u25CC', ...opts });
    try {
      const result = await p;
      create(typeof msgs.success === 'function' ? msgs.success(result) : msgs.success, 'success', {
        icon: '\u2713',
        ...opts,
        id,
      });
      return result;
    } catch (e) {
      create(typeof msgs.error === 'function' ? msgs.error(e) : msgs.error, 'error', {
        icon: '\u2715',
        ...opts,
        id,
      });
      throw e;
    }
  }

  // Exported toast API
  export const toast = Object.assign(
    (msg: string, opts?: ToastOptions) => create(msg, 'blank', opts),
    {
      success: (msg: string, opts?: ToastOptions) => create(msg, 'success', { icon: '\u2713', ...opts }),
      error: (msg: string, opts?: ToastOptions) => create(msg, 'error', { icon: '\u2715', ...opts }),
      loading: (msg: string, opts?: ToastOptions) => create(msg, 'loading', { icon: '\u25CC', ...opts }),
      custom: (msg: string, type: ToastType, opts?: ToastOptions) => create(msg, type, opts),
      dismiss,
      remove,
      promise: toastPromise,
    }
  );
</script>

<script lang="ts">
  import { _ } from 'svelte-i18n';

  interface Props {
    position?: ToastPosition;
  }

  let { position = 'top-center' }: Props = $props();

  function getPositionStyle(pos: ToastPosition): string {
    const isTop = pos.startsWith('top');
    const isLeft = pos.endsWith('left');
    const isRight = pos.endsWith('right');
    const isCenter = pos.endsWith('center');

    let style = `position: fixed; z-index: 9999; ${isTop ? 'top: 1rem;' : 'bottom: 1rem;'}`;
    if (isLeft) style += 'left: 1rem;';
    else if (isRight) style += 'right: 1rem;';
    else if (isCenter) style += 'left: 50%;';
    return style;
  }

  function pillVariantClass(t: Toast): string {
    if (t.type === 'success') return 'pill--success';
    if (t.type === 'error') return 'pill--danger';
    if (t.type === 'loading') return 'pill--primary';
    return '';
  }

  function isRich(t: Toast): boolean {
    return Boolean(t.description);
  }
</script>

<div class="toaster" role="region" aria-label={$_('app.notifications')}>
  {#each toasts as t (t.id)}
    {@const pos = t.position ?? position}
    {@const rich = isRich(t)}
    {@const pv = pillVariantClass(t)}
    <div
      class="pill pill--lg toast {pv}"
      class:toast--stream={t.streamAlert}
      class:toast--rich={rich}
      class:toast--visible={t.visible}
      class:toast--hidden={!t.visible}
      style={getPositionStyle(pos)}
      role={t.type === 'error' ? 'alert' : 'status'}
      aria-live={t.type === 'error' ? 'assertive' : 'polite'}
    >
      {#if t.onClick}
        <button
          type="button"
          class="toast__body toast__body--clickable"
          onclick={() => t.onClick?.()}
        >
          {#if t.icon}
            <span class="toast__icon" class:toast__icon--spin={t.type === 'loading'}>{t.icon}</span>
          {/if}
          <span class="toast__message">{t.message}</span>
          {#if t.description}
            <p class="toast__description">{t.description}</p>
          {/if}
        </button>
      {:else}
        <div class="toast__body">
          {#if t.icon}
            <span class="toast__icon" class:toast__icon--spin={t.type === 'loading'}>{t.icon}</span>
          {/if}
          <span class="toast__message">{t.message}</span>
          {#if t.description}
            <p class="toast__description">{t.description}</p>
          {/if}
        </div>
      {/if}
    </div>
  {/each}
</div>

<style>
  .toaster {
    pointer-events: none;
  }

  .toast {
    pointer-events: auto;
    max-width: 420px;
    margin-bottom: 0.5rem;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
  }

  /* Stream alerts: wider cap + shrink-to-fit; message/description ellipsis if still too long. */
  .toast.toast--stream {
    width: min(max-content, 32rem, calc(100vw - 2rem));
    max-width: min(32rem, calc(100vw - 2rem));
  }

  .toast--stream.toast--rich {
    padding: calc(var(--space-md) + var(--space-xs)) calc(var(--space-lg) + var(--space-sm))
      calc(var(--space-md) + var(--space-xs)) calc(var(--space-lg) + var(--space-xs));
    padding-right: calc(var(--space-lg) + var(--space-md) + var(--space-sm));
    border-radius: var(--radius-xl);
  }

  .toast--stream .toast__body--clickable {
    gap: var(--space-xs);
  }

  .toast--stream .toast__message {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.15;
    min-width: 0;
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    overflow: hidden;
  }

  .toast--stream .toast__description {
    font-size: 0.9rem;
    line-height: 1.35;
    min-width: 0;
    overflow-wrap: break-word;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    overflow: hidden;
  }

  .toast--rich {
    flex-direction: column;
    align-items: stretch;
    justify-content: flex-start;
    align-content: flex-start;
    white-space: normal;
    max-width: min(22rem, calc(100vw - 2rem));
    border-radius: var(--radius-xl);
    padding-right: calc(var(--space-md) + 2rem);
    text-align: left;
  }

  .toast--visible {
    animation: toast-in 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
  }

  .toast--hidden {
    animation: toast-out 0.25s cubic-bezier(0.06, 0.71, 0.55, 1) forwards;
  }

  .toast__body {
    display: flex;
    flex-direction: inherit;
    align-items: inherit;
    gap: inherit;
    flex: 1;
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    font: inherit;
    text-align: inherit;
    color: inherit;
    cursor: default;
    appearance: none;
    -webkit-appearance: none;
    box-shadow: none;
    border-radius: 0;
  }

  .toast--rich .toast__body {
    flex-direction: column;
    align-items: stretch;
    gap: var(--space-sm);
  }

  .toast__body--clickable {
    cursor: pointer;
    text-align: left;
    width: 100%;
  }

  .toast__icon {
    flex-shrink: 0;
    font-size: 1rem;
    line-height: 1;
  }

  .toast__icon--spin {
    animation: spin 1s linear infinite;
  }

  .toast__message {
    flex: 1;
    font-size: 0.9375rem;
    font-weight: 600;
    line-height: 1.35;
    color: var(--text-primary);
  }

  .toast--rich .toast__message {
    flex: none;
  }

  .toast__description {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    line-height: 1.45;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translateX(-50%) translateY(-0.5rem) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
  }

  @keyframes toast-out {
    from {
      opacity: 1;
      transform: translateX(-50%) translateY(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateX(-50%) translateY(-0.5rem) scale(0.96);
    }
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast--visible,
    .toast--hidden,
    .toast__icon--spin {
      animation: none;
    }
  }
</style>
