// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Per-conversation composer drafts.
 *
 * An unsent message is kept in localStorage keyed by conversation id, so it
 * survives a reload or a switch to another conversation and back. A brand-new
 * conversation (no id yet) uses the `new` bucket. All access is wrapped in
 * try/catch — localStorage can throw in private mode or when storage is full,
 * and a lost draft must never break the composer.
 */

const PREFIX = 'grengin_draft:';

function keyFor(conversationId: string | null | undefined): string {
  return PREFIX + (conversationId ?? 'new');
}

export function loadDraft(conversationId: string | null | undefined): string {
  try {
    return localStorage.getItem(keyFor(conversationId)) ?? '';
  } catch {
    return '';
  }
}

export function saveDraft(conversationId: string | null | undefined, text: string): void {
  try {
    const key = keyFor(conversationId);
    if (text) localStorage.setItem(key, text);
    else localStorage.removeItem(key);
  } catch {
    // Ignore — a persisted draft is a convenience, never required.
  }
}

export function clearDraft(conversationId: string | null | undefined): void {
  saveDraft(conversationId, '');
}
