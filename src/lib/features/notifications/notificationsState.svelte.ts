import {
  listNotifications,
  consumeNotificationsStream,
  type NotificationItem,
} from '../../api/notificationsApi.js';

export type { NotificationItem };

interface NotificationsUiState {
  unreadCount: number;
  preview: NotificationItem[];
  previewLoading: boolean;
  streamToast: NotificationItem | null;
}

let state = $state<NotificationsUiState>({
  unreadCount: 0,
  preview: [],
  previewLoading: false,
  streamToast: null,
});

let streamAbort: AbortController | null = null;

function isUnread(n: NotificationItem): boolean {
  return n.read_at == null || n.read_at === '';
}

export function getNotificationsState(): NotificationsUiState {
  return state;
}

export async function refreshUnreadCount(): Promise<void> {
  try {
    const { total } = await listNotifications({ limit: 1, offset: 0, unread_only: true });
    state.unreadCount = total;
  } catch {
    // keep previous count on failure
  }
}

/** Loads unread total + first 5 notifications without toggling previewLoading (sidebar popover opens instantly). */
export async function fetchNotificationFeed(): Promise<void> {
  try {
    const [unreadRes, previewRes] = await Promise.all([
      listNotifications({ limit: 1, offset: 0, unread_only: true }),
      listNotifications({ limit: 5, offset: 0 }),
    ]);
    state.unreadCount = unreadRes.total;
    state.preview = previewRes.notifications;
  } catch {
    // keep previous state on failure
  }
}

export async function refreshPreview(): Promise<void> {
  state.previewLoading = true;
  try {
    const { notifications } = await listNotifications({ limit: 5, offset: 0, unread_only: false });
    state.preview = notifications;
  } finally {
    state.previewLoading = false;
  }
}

export function markNotificationReadLocal(notificationId: string): void {
  state.preview = state.preview.map((item) =>
    item.id === notificationId && isUnread(item)
      ? { ...item, read_at: new Date().toISOString() }
      : item
  );
  state.unreadCount = Math.max(0, state.unreadCount - 1);
}

function upsertPreview(n: NotificationItem): void {
  const without = state.preview.filter((x) => x.id !== n.id);
  state.preview = [n, ...without].slice(0, 5);
}

export function handleStreamNotification(n: NotificationItem): void {
  const alreadyHad = state.preview.some((x) => x.id === n.id);
  upsertPreview(n);
  if (isUnread(n) && !alreadyHad) {
    state.unreadCount += 1;
  }
  state.streamToast = n;
}

export function dismissStreamToast(): void {
  state.streamToast = null;
}

export function startNotificationsStream(): void {
  if (streamAbort) return;

  const ac = new AbortController();
  streamAbort = ac;

  void consumeNotificationsStream({
    signal: ac.signal,
    onNotification: handleStreamNotification,
    onError: () => {
      // optional: could schedule reconnect; keep silent for now
    },
  }).finally(() => {
    if (streamAbort === ac) {
      streamAbort = null;
    }
  });
}

export function stopNotificationsStream(): void {
  streamAbort?.abort();
  streamAbort = null;
}
