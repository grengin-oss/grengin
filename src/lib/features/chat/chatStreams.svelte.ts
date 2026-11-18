// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Per-conversation streaming state (ENGG-530).
 *
 * The chat UI shows one conversation at a time, but a reply can keep streaming
 * after the user opens another chat or starts a new one. Keeping the streaming
 * state (loading flag, the live assistant bubble, errors, the Stop controller
 * and the auto-reconnect bookkeeping) on the component made all of it global:
 * one reply disabled every composer, painted into whatever chat was on screen,
 * retried the wrong message and hid the Stop button of the other chat.
 *
 * This module holds that state keyed by conversation, so several chats can
 * stream at once and each reply only ever touches its own chat. `Chat.svelte`
 * reads the entry for the conversation currently on screen and leaves the
 * others running in the background.
 */
import type { ApiError } from '../../api/client';
import type { ChatMessage as ChatMessageType } from '../../types/chat';
import { SvelteMap } from 'svelte/reactivity';

/**
 * One in-flight (or just-finished) assistant turn, bound to the conversation it
 * belongs to. A brand-new chat has no conversation id yet, so the entry is first
 * keyed by a temporary draft key and learns its `conversationId` from the
 * `conversation` SSE event.
 */
export class ChatGeneration {
  /** Stable registry key: the conversation id, or a `draft:*` key for a new chat. */
  readonly key: string;
  /** The server conversation id once known (null until the `conversation` event). */
  conversationId = $state<string | null>(null);
  /** Aborts the fetch locally; prefer a server cancel once `messageId` is set. */
  readonly controller: AbortController;
  /** The assistant message id the server cancels by — known from `message_start`. */
  messageId = $state<string | null>(null);
  stopRequested = $state(false);
  isStopping = $state(false);
  abortTimer?: ReturnType<typeof setTimeout>;

  /** This chat's composer stays disabled only while its own turn is streaming. */
  isLoading = $state(true);
  isTyping = $state(false);
  autoReconnecting = $state(false);
  /** A failure that belongs to THIS chat (shown only when this chat is on screen). */
  error = $state<ApiError | null>(null);

  /** The optimistic user bubble for a brand-new turn (overlaid until persisted). */
  userMessage = $state<ChatMessageType | null>(null);
  /** The live assistant bubble, overlaid onto this chat's transcript while it streams. */
  streamingMessage = $state<ChatMessageType | null>(null);
  /** Whether the assistant bubble should be shown yet (hidden until first content). */
  visible = $state(false);

  /** Set when the turn dropped mid-stream (a transport interruption we auto-retry). */
  turnInterrupted = false;
  /** Auto-reconnect budget already spent on this turn. */
  retryCount = 0;
  /** Re-run this exact turn against its own conversation (used by auto-reconnect). */
  rerun?: () => void;

  constructor(key: string, conversationId: string | null) {
    this.key = key;
    this.conversationId = conversationId;
    this.controller = new AbortController();
  }
}

/** Every live/just-finished generation, keyed by {@link ChatGeneration.key}. */
export const chatGenerations = new SvelteMap<string, ChatGeneration>();

/** A fresh, unique key for a brand-new chat that has no conversation id yet. */
export function makeDraftKey(): string {
  return `draft:${crypto.randomUUID()}`;
}

export function createGeneration(
  key: string,
  conversationId: string | null,
): ChatGeneration {
  const generation = new ChatGeneration(key, conversationId);
  chatGenerations.set(key, generation);
  return generation;
}

export function removeGeneration(generation: ChatGeneration): void {
  if (chatGenerations.get(generation.key) === generation) {
    chatGenerations.delete(generation.key);
  }
}

/**
 * The generation to show for the conversation on screen: the live turn whose
 * `conversationId` matches an open chat, or — for a brand-new chat with no id
 * yet — the turn under the current draft key. Returns undefined when the chat on
 * screen has nothing streaming.
 */
export function findGeneration(
  conversationId: string | null,
  draftKey: string | null,
): ChatGeneration | undefined {
  if (conversationId) {
    for (const generation of chatGenerations.values()) {
      if (generation.conversationId === conversationId) return generation;
    }
    return undefined;
  }
  if (draftKey) return chatGenerations.get(draftKey);
  return undefined;
}
