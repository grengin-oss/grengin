import {
  listConversations,
  type ChatConversationList,
  type ChatSemanticResult,
} from '$lib/api/chatApi';

export interface SidebarChat {
  id: string;
  title: string;
  archived: boolean;
  createdAt: string;
  lastMessageAt: string | null;
  totalTokens: number;
  semanticResult: ChatSemanticResult | null;
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
  normalChats: SidebarChat[];
  normalTotal: number | null;
  signal: AbortSignal;
  untitledTitle: string;
}

type ChatConversation = ChatConversationList['conversations'][number] & {
  last_message_at?: string | null;
  search_match?: ChatSemanticResult | null;
  total_tokens?: number;
};

const MAX_SEMANTIC_DISTANCE = 0.65;
const MIN_SEARCH_RESULTS = 5;
const TITLE_FALLBACK_LIMIT = 100;
const GENERIC_TITLE_TOKENS = new Set('app application design homepage page site ui web webpage website'.split(' '));

export function getSemanticScore(result: ChatSemanticResult | null | undefined): number | null {
  if (!result || typeof result.distance !== 'number') return null;
  return Math.max(0, Math.min(100, Math.round((1 - result.distance) * 100)));
}

export async function loadSidebarChats({
  query,
  offset,
  limit,
  normalChats,
  normalTotal,
  signal,
  untitledTitle,
}: LoadSidebarChatsOptions): Promise<LoadedSidebarChats> {
  if (!query) {
    const response = await listConversations({ offset, limit, semantic: false, signal });
    const chats = response.conversations.map((chat) => mapChat(chat as ChatConversation, untitledTitle));
    return {
      chats,
      total: response.total,
      hasMore: offset + chats.length < response.total,
    };
  }

  const [semanticResponse, titleResponse] = await Promise.all([
    listConversations({ offset: 0, limit, search: query, semantic: true, signal }),
    listConversations({ offset: 0, limit, search: query, semantic: false, signal }),
  ]);
  const semanticResults = semanticResponse.semantic_results ?? {};
  const semanticChats = semanticResponse.conversations
    .map((chat) => mapChat(chat as ChatConversation, untitledTitle, semanticResults))
    .filter((chat) => chat.semanticResult)
    .sort(compareSemanticChats);
  const titleChats = titleResponse.conversations.map((chat) => mapChat(chat as ChatConversation, untitledTitle));
  let titlePool = normalChats;
  let fallbackChats = mergeChats(titleChats, findTitleMatches(normalChats, query));
  let chats = mergeChats(semanticChats, fallbackChats);

  if (chats.length < MIN_SEARCH_RESULTS && normalChats.length < (normalTotal ?? Number.POSITIVE_INFINITY)) {
    const response = await listConversations({ offset: 0, limit: TITLE_FALLBACK_LIMIT, semantic: false, signal });
    titlePool = response.conversations.map((chat) => mapChat(chat as ChatConversation, untitledTitle));
    fallbackChats = mergeChats(fallbackChats, findTitleMatches(titlePool, query));
    chats = mergeChats(semanticChats, fallbackChats);
  }

  const visibleChats = fillSearchResults(chats, titlePool);
  return { chats: visibleChats, total: visibleChats.length, hasMore: false };
}

function mapChat(
  chat: ChatConversation,
  untitledTitle: string,
  semanticResults?: Record<string, ChatSemanticResult>,
): SidebarChat {
  return {
    id: chat.id,
    title: chat.title || untitledTitle,
    archived: chat.archived,
    createdAt: chat.created_at,
    lastMessageAt: chat.last_message_at ?? null,
    totalTokens: chat.total_tokens ?? 0,
    semanticResult: semanticResults
      ? normalizeSemanticResult(chat.search_match ?? semanticResults[chat.id])
      : null,
  };
}

function normalizeSemanticResult(result: ChatSemanticResult | null | undefined): ChatSemanticResult | null {
  if (!result || !Number.isFinite(result.distance) || result.distance > MAX_SEMANTIC_DISTANCE) {
    return null;
  }

  const snippet = result.snippet ?? result.matched_text ?? '';
  return {
    message_id: String(result.message_id ?? ''),
    snippet,
    matched_text: snippet,
    distance: result.distance,
  };
}

function compareSemanticChats(a: SidebarChat, b: SidebarChat): number {
  const aRank = a.semanticResult?.distance ?? Number.POSITIVE_INFINITY;
  const bRank = b.semanticResult?.distance ?? Number.POSITIVE_INFINITY;
  return aRank === bRank ? compareRecentChats(a, b) : aRank - bRank;
}

function compareRecentChats(a: SidebarChat, b: SidebarChat): number {
  return chatTime(b) - chatTime(a);
}

function mergeChats(...lists: SidebarChat[][]): SidebarChat[] {
  const seen = new Set<string>();
  return lists.flatMap((list) =>
    list.filter((chat) => {
      if (seen.has(chat.id)) return false;
      seen.add(chat.id);
      return true;
    }),
  );
}

function findTitleMatches(chats: SidebarChat[], query: string): SidebarChat[] {
  return chats
    .map((chat) => ({ chat: { ...chat, semanticResult: null }, score: titleMatchScore(chat.title, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || compareRecentChats(a.chat, b.chat))
    .map(({ chat }) => chat);
}

function fillSearchResults(results: SidebarChat[], recentChats: SidebarChat[]): SidebarChat[] {
  const targetCount = Math.max(results.length, MIN_SEARCH_RESULTS);
  return mergeChats(results, [...recentChats].sort(compareRecentChats)).slice(0, targetCount);
}

function titleMatchScore(title: string, query: string): number {
  const titleKey = titleSearchKey(title);
  const queryKey = titleSearchKey(query);
  if (!titleKey || !queryKey) return 0;

  const compactTitle = titleKey.replace(/\s/g, '');
  const compactQuery = queryKey.replace(/\s/g, '');
  if (titleKey.includes(queryKey) || compactTitle.includes(compactQuery)) return 100;

  const tokens = queryKey
    .split(' ')
    .filter((token) => token.length >= 3 && !GENERIC_TITLE_TOKENS.has(token));
  if (!tokens.length) return 0;

  const matchedTokens = tokens.filter((token) => titleKey.includes(token) || compactTitle.includes(token));
  if (matchedTokens.length === tokens.length) return 90;
  if (tokens.length === 1) return matchedTokens.length ? 80 : 0;
  if (matchedTokens.some((token) => token.length >= 7) && matchedTokens.length >= Math.ceil(tokens.length / 2)) {
    return 70 + matchedTokens.length;
  }
  return 0;
}

function chatTime(chat: SidebarChat): number {
  return toTime(chat.lastMessageAt ?? chat.createdAt);
}

function toTime(value: string | null): number {
  const time = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(time) ? time : 0;
}

function titleSearchKey(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}
