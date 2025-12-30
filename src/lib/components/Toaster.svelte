<script lang="ts" module>
  // Types
  export type ToastType = 'success' | 'error' | 'loading' | 'blank';
  export type ToastPosition = 'top-left' | 'top-center' | 'top-right' | 'bottom-left' | 'bottom-center' | 'bottom-right';

  export interface Toast {
    id: string;
    type: ToastType;
    message: string;
    icon?: string;
    duration: number;
    position: ToastPosition;
    visible: boolean;
    createdAt: number;
  }

  export interface ToastOptions {
    id?: string;
    icon?: string;
    duration?: number;
    position?: ToastPosition;
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

  // Core functions
  function create(message: string, type: ToastType, opts: ToastOptions = {}): string {
    const id = opts.id || `t-${++counter}`;
    const duration = opts.duration ?? DURATIONS[type];
    const existing = toasts.find((t) => t.id === id);

    const newToast: Toast = {
      id,
      type,
      message,
      icon: opts.icon,
      duration,
      position: opts.position ?? 'top-center',
      visible: true,
      createdAt: Date.now(),
    };

    if (existing) {
      toasts = toasts.map((t) => (t.id === id ? newToast : t));
    } else {
      toasts = [newToast, ...toasts].slice(0, 20);
    }

    if (duration !== Infinity) {
      const prev = timeouts.get(id);
      if (prev) clearTimeout(prev);
      timeouts.set(id, setTimeout(() => {
        dismiss(id);
        timeouts.delete(id);
      }, duration));
    }

    return id;
  }

  function dismiss(id?: string): void {
    toasts = toasts.map((t) => (id === undefined || t.id === id ? { ...t, visible: false } : t));
    setTimeout(() => {
      toasts = id ? toasts.filter((t) => t.id !== id) : [];
    }, 300);
  }

  function remove(id?: string): void {
    if (id) {
      const t = timeouts.get(id);
      if (t) clearTimeout(t);
      timeouts.delete(id);
    } else {
      timeouts.forEach(clearTimeout);
      timeouts.clear();
    }
    toasts = id ? toasts.filter((t) => t.id !== id) : [];
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
      create(typeof msgs.success === 'function' ? msgs.success(result) : msgs.success, 'success', { icon: '\u2713', ...opts, id });
      return result;
    } catch (e) {
      create(typeof msgs.error === 'function' ? msgs.error(e) : msgs.error, 'error', { icon: '\u2715', ...opts, id });
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
</script>

<div class="toaster" role="region" aria-label={$_('app.notifications')}>
  {#each toasts as t (t.id)}
    {@const pos = t.position ?? position}
    {@const pillVariant = t.type === 'success' ? 'pill--success' : t.type === 'error' ? 'pill--danger' : t.type === 'loading' ? 'pill--primary' : ''}
    <div
      class="pill pill--lg toast {pillVariant}"
      class:toast--visible={t.visible}
      class:toast--hidden={!t.visible}
      style={getPositionStyle(pos)}
      role={t.type === 'error' ? 'alert' : 'status'}
      aria-live={t.type === 'error' ? 'assertive' : 'polite'}
    >
      {#if t.icon}
        <span class="toast__icon" class:toast__icon--spin={t.type === 'loading'}>{t.icon}</span>
      {/if}
      <span class="toast__message">{t.message}</span>
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
  }

  .toast--visible {
    animation: toast-in 0.3s cubic-bezier(0.21, 1.02, 0.73, 1) forwards;
  }

  .toast--hidden {
    animation: toast-out 0.25s cubic-bezier(0.06, 0.71, 0.55, 1) forwards;
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
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .toast--visible,
    .toast--hidden,
    .toast__icon--spin {
      animation: none;
    }
  }
</style>
