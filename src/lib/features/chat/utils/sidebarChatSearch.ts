// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import {
  listConversations,
  type ChatConversation,
  type ChatSearchMode,
} from '$lib/api/chatApi';

export interface SidebarChat {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  lastMessageAt: string | null;
  totalTokens: number;
  searchMode: ChatSearchMode | null;
  searchScore: number | null;
  searchSnippet: string | null;
}

export interface LoadedSidebarChats {
  chats: SidebarChat[];
  hasMore: boolean;
  total: number | null;
}

interface LoadSidebarChatsOptions {
  query: string;
  offset: number;
  limit: number;
  signal: AbortSignal;
  untitledTitle: string;
}

export function getSearchScore(chat: SidebarChat): number | null {
  if (chat.searchMode !== 'semantic' || chat.searchScore === null) return null;
  return Math.max(0, Math.min(100, Math.round(chat.searchScore * 100)));
}

export async function loadSidebarChats({
  query,
  offset,
  limit,
  signal,
  untitledTitle,
}: LoadSidebarChatsOptions): Promise<LoadedSidebarChats> {
  if (!query) {
    const response = await listConversations({ offset, limit, signal });
    const chats = response.conversations.map((chat) => mapChat(chat, untitledTitle));
    return {
      chats,
      total: response.total,
      hasMore: offset + chats.length < response.total,
    };
  }

  const response = await listConversations({ offset: 0, limit, search: query, signal });
  const chats = response.conversations.map((chat) => mapChat(chat, untitledTitle));
  return { chats, total: response.total, hasMore: false };
}

function mapChat(chat: ChatConversation, untitledTitle: string): SidebarChat {
  const searchMode = normalizeSearchMode(chat.search_mode);
  const searchScore =
    typeof chat.search_score === 'number' && Number.isFinite(chat.search_score)
      ? chat.search_score
      : null;

  return {
    id: chat.id,
    title: chat.title || untitledTitle,
    archived: chat.archived,
    createdAt: chat.created_at,
    lastMessageAt: chat.last_message_at ?? null,
    totalTokens: chat.total_tokens ?? 0,
    searchMode,
    searchScore,
    searchSnippet: chat.search_snippet || null,
  };
}

function normalizeSearchMode(mode: ChatSearchMode | null | undefined): ChatSearchMode | null {
  if (mode === 'lexical' || mode === 'semantic') return mode;
  return null;
}
