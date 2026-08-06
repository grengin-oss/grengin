// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

export {
  getNotificationsState,
  refreshUnreadCount,
  fetchNotificationFeed,
  markNotificationReadLocal,
  dismissStreamToast,
  startNotificationsStream,
  stopNotificationsStream,
} from './notificationsState.svelte.js';
export type { NotificationItem } from './notificationsState.svelte.js';
