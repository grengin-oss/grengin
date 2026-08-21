// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Context the top bar renders but cannot derive from the route alone.
 *
 * Pages that already hold the data publish it here rather than have TopBar
 * refetch it: the chat page owns the conversation title and the facts behind
 * the status badge, and detail pages own the name of the entity they show,
 * which becomes the last breadcrumb.
 */

export interface ChatTopBarContext {
  /** Conversation title, or null for a chat that has no title yet. */
  title: string | null;
  /**
   * Whether the conversation's model resolved in the org's permitted model
   * list. null while the list is still loading, so the badge can stay hidden
   * instead of claiming something it does not know yet.
   */
  approvedModel: boolean | null;
  /** Visibility inherited from the project the chat belongs to. */
  visibility: 'team' | 'private' | null;
}

const EMPTY_CHAT: ChatTopBarContext = {
  title: null,
  approvedModel: null,
  visibility: null,
};

export const topBarState = $state<{
  chat: ChatTopBarContext;
  /** Name of the entity a detail page is showing, used as the last crumb. */
  crumbLeaf: string | null;
}>({
  chat: { ...EMPTY_CHAT },
  crumbLeaf: null,
});

export function setChatTopBar(patch: Partial<ChatTopBarContext>): void {
  Object.assign(topBarState.chat, patch);
}

export function clearChatTopBar(): void {
  Object.assign(topBarState.chat, EMPTY_CHAT);
}

/** Detail pages call this with their entity name, and null on teardown. */
export function setCrumbLeaf(label: string | null): void {
  topBarState.crumbLeaf = label;
}
