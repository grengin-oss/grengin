import { isTauriRuntime } from '../../../platform/tauri';
import type {
  ChatMessage,
  Conversation,
  ConversationDetail,
  ConversationList,
  Message,
} from '../../../types/chat';
import { getCacheUserScope } from '../../../utils/cache';

const CHAT_DB_URL = 'sqlite:grengin-chat.db';

type SqlDatabase = import('@tauri-apps/plugin-sql').default;

interface CachedConversationRow {
  id: string;
  raw_json: string;
  detail_json: string | null;
  messages_synced: number;
  synced_at: number;
}

interface CachedCountRow {
  total: number;
}

export interface CachedConversationDetail {
  conversation: ConversationDetail;
  syncedAt: number;
}

export interface ConversationHydrationState {
  messagesSynced: boolean;
  syncedAt: number;
}

export interface ConversationSnapshotInput {
  conversationId: string;
  messages: ChatMessage[];
  model?: string | null;
  webSearchEnabled?: boolean;
  title?: string;
}

let dbPromise: Promise<SqlDatabase | null> | null = null;
let writeQueue: Promise<void> = Promise.resolve();

export function isOfflineChatStoreEnabled(): boolean {
  return isTauriRuntime();
}

async function getDb(): Promise<SqlDatabase | null> {
  if (!isOfflineChatStoreEnabled()) {
    return null;
  }

  if (!dbPromise) {
    dbPromise = import('@tauri-apps/plugin-sql')
      .then(({ default: Database }) => Database.load(CHAT_DB_URL))
      .catch((err) => {
        console.warn('Offline chat SQLite store is unavailable:', err);
        dbPromise = null;
        return null;
      });
  }

  return dbPromise;
}

function enqueueWrite<T>(work: () => Promise<T>): Promise<T> {
  const next = writeQueue.then(work, work);
  writeQueue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}

async function withTransaction<T>(work: (db: SqlDatabase) => Promise<T>): Promise<T | null> {
  return enqueueWrite(async () => {
    const db = await getDb();
    if (!db) return null;

    await db.execute('BEGIN IMMEDIATE');
    try {
      const result = await work(db);
      await db.execute('COMMIT');
      return result;
    } catch (err) {
      await db.execute('ROLLBACK').catch(() => undefined);
      throw err;
    }
  });
}

function parseJson<T>(value: string | null | undefined): T | null {
  if (!value) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function toBooleanInt(value: unknown): number {
  return value ? 1 : 0;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function toNullableNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getConversationMessages(conversation: ConversationDetail | (Conversation & Record<string, unknown>)): Message[] {
  const maybeMessages = (conversation as ConversationDetail).messages;
  return Array.isArray(maybeMessages) ? maybeMessages : [];
}

function getLastMessageAt(conversation: ConversationDetail | (Conversation & Record<string, unknown>)): string | null {
  const explicitLastMessageAt = toNullableString((conversation as Record<string, unknown>).last_message_at);
  if (explicitLastMessageAt) return explicitLastMessageAt;

  const messages = getConversationMessages(conversation);
  const lastMessage = messages[messages.length - 1];
  return toNullableString(lastMessage?.created_at) || toNullableString(conversation.updated_at);
}

function getConversationSummary(conversation: ConversationDetail | (Conversation & Record<string, unknown>)): Conversation & Record<string, unknown> {
  const { messages: _messages, ...summary } = conversation as ConversationDetail & Record<string, unknown>;
  return summary as Conversation & Record<string, unknown>;
}

function buildSearchText(conversation: ConversationDetail | (Conversation & Record<string, unknown>)): string {
  const parts = [conversation.title || ''];
  for (const message of getConversationMessages(conversation)) {
    parts.push(message.parts?.text || '');
    for (const file of message.parts?.files || []) {
      parts.push(file.name || '');
    }
  }
  return parts.join(' ').toLowerCase();
}

async function upsertConversation(
  db: SqlDatabase,
  conversation: ConversationDetail | (Conversation & Record<string, unknown>),
  options: { includeDetail: boolean },
): Promise<void> {
  const now = Date.now();
  const summary = getConversationSummary(conversation);
  const rawJson = JSON.stringify(summary);
  const detailJson = options.includeDetail ? JSON.stringify(conversation) : null;
  const createdAt = toNullableString(conversation.created_at) || new Date(now).toISOString();
  const searchText = buildSearchText(conversation);

  await db.execute(
    `
      INSERT INTO cached_conversations (
        user_scope,
        id,
        title,
        archived,
        archived_at,
        model,
        total_tokens,
        total_cost,
        created_at,
        updated_at,
        web_search_enabled,
        last_message_at,
        search_text,
        raw_json,
        detail_json,
        messages_synced,
        synced_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT(user_scope, id) DO UPDATE SET
        title = excluded.title,
        archived = excluded.archived,
        archived_at = excluded.archived_at,
        model = excluded.model,
        total_tokens = excluded.total_tokens,
        total_cost = excluded.total_cost,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        web_search_enabled = excluded.web_search_enabled,
        last_message_at = COALESCE(excluded.last_message_at, cached_conversations.last_message_at),
        search_text = CASE
          WHEN excluded.messages_synced = 1 THEN excluded.search_text
          ELSE TRIM(excluded.search_text || ' ' || COALESCE(cached_conversations.search_text, ''))
        END,
        raw_json = excluded.raw_json,
        detail_json = COALESCE(excluded.detail_json, cached_conversations.detail_json),
        messages_synced = CASE
          WHEN excluded.messages_synced = 1 THEN 1
          ELSE cached_conversations.messages_synced
        END,
        synced_at = excluded.synced_at
    `,
    [
      getCacheUserScope(),
      conversation.id,
      conversation.title || 'Untitled chat',
      toBooleanInt(conversation.archived),
      toNullableString(conversation.archived_at),
      toNullableString(conversation.model),
      toNullableNumber(conversation.total_tokens),
      toNullableNumber(conversation.total_cost),
      createdAt,
      toNullableString(conversation.updated_at),
      toBooleanInt(conversation.web_search_enabled),
      getLastMessageAt(conversation),
      searchText,
      rawJson,
      detailJson,
      options.includeDetail ? 1 : 0,
      now,
    ],
  );
}

export async function cacheConversationList(response: ConversationList): Promise<void> {
  if (!isOfflineChatStoreEnabled() || !Array.isArray(response.conversations)) {
    return;
  }

  await withTransaction(async (db) => {
    for (const conversation of response.conversations) {
      await upsertConversation(db, conversation as Conversation & Record<string, unknown>, {
        includeDetail: false,
      });
    }
  }).catch((err) => {
    console.warn('Failed to cache conversation list in SQLite:', err);
  });
}

export async function cacheConversationDetail(conversation: ConversationDetail): Promise<void> {
  if (!isOfflineChatStoreEnabled()) {
    return;
  }

  await withTransaction(async (db) => {
    await upsertConversation(db, conversation, {
      includeDetail: Object.prototype.hasOwnProperty.call(conversation, 'messages'),
    });
  }).catch((err) => {
    console.warn('Failed to cache conversation detail in SQLite:', err);
  });
}

export async function removeCachedConversation(conversationId: string): Promise<void> {
  if (!isOfflineChatStoreEnabled()) {
    return;
  }

  await withTransaction(async (db) => {
    await db.execute('DELETE FROM cached_conversations WHERE user_scope = $1 AND id = $2', [
      getCacheUserScope(),
      conversationId,
    ]);
  }).catch((err) => {
    console.warn('Failed to delete cached conversation from SQLite:', err);
  });
}

export async function getCachedConversationList(params?: {
  offset?: number;
  limit?: number;
  search?: string;
}): Promise<ConversationList | null> {
  const db = await getDb();
  if (!db) return null;

  const offset = Math.max(0, params?.offset ?? 0);
  const limit = Math.max(1, params?.limit ?? 20);
  const search = params?.search?.trim().toLowerCase() || '';
  const scope = getCacheUserScope();

  const searchClause = search ? 'AND search_text LIKE $4' : '';
  const selectParams = search ? [scope, limit, offset, `%${search}%`] : [scope, limit, offset];
  const countParams = search ? [scope, `%${search}%`] : [scope];

  try {
    const rows = await db.select<CachedConversationRow[]>(
      `
        SELECT id, raw_json, detail_json, messages_synced, synced_at
        FROM cached_conversations
        WHERE user_scope = $1
          AND archived = 0
          ${searchClause}
        ORDER BY
          COALESCE(last_message_at, updated_at, created_at) DESC,
          synced_at DESC
        LIMIT $2 OFFSET $3
      `,
      selectParams,
    );

    const countRows = await db.select<CachedCountRow[]>(
      `
        SELECT COUNT(*) AS total
        FROM cached_conversations
        WHERE user_scope = $1
          AND archived = 0
          ${search ? 'AND search_text LIKE $2' : ''}
      `,
      countParams,
    );

    const conversations = rows
      .map((row) => parseJson<Conversation>(row.raw_json))
      .filter((conversation): conversation is Conversation => conversation !== null);

    return {
      conversations,
      total: Number(countRows[0]?.total ?? conversations.length),
    };
  } catch (err) {
    console.warn('Failed to read cached conversation list from SQLite:', err);
    return null;
  }
}

export async function getCachedConversationDetail(conversationId: string): Promise<CachedConversationDetail | null> {
  const db = await getDb();
  if (!db) return null;

  try {
    const rows = await db.select<CachedConversationRow[]>(
      `
        SELECT id, raw_json, detail_json, messages_synced, synced_at
        FROM cached_conversations
        WHERE user_scope = $1 AND id = $2
        LIMIT 1
      `,
      [getCacheUserScope(), conversationId],
    );
    const row = rows[0];
    if (!row) return null;

    const parsed = parseJson<ConversationDetail>(row.detail_json || row.raw_json);
    if (!parsed) return null;

    return {
      conversation: {
        ...parsed,
        messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      },
      syncedAt: Number(row.synced_at || 0),
    };
  } catch (err) {
    console.warn('Failed to read cached conversation detail from SQLite:', err);
    return null;
  }
}

export async function getConversationHydrationStates(
  conversationIds: string[],
): Promise<Map<string, ConversationHydrationState>> {
  const db = await getDb();
  const uniqueIds = Array.from(new Set(conversationIds.filter(Boolean)));
  if (!db || uniqueIds.length === 0) {
    return new Map();
  }

  const placeholders = uniqueIds.map((_, index) => `$${index + 2}`).join(', ');

  try {
    const rows = await db.select<Array<{ id: string; messages_synced: number; synced_at: number }>>(
      `
        SELECT id, messages_synced, synced_at
        FROM cached_conversations
        WHERE user_scope = $1 AND id IN (${placeholders})
      `,
      [getCacheUserScope(), ...uniqueIds],
    );

    return new Map(
      rows.map((row) => [
        row.id,
        {
          messagesSynced: row.messages_synced === 1,
          syncedAt: Number(row.synced_at || 0),
        },
      ]),
    );
  } catch (err) {
    console.warn('Failed to read cached conversation hydration states from SQLite:', err);
    return new Map();
  }
}

function inferConversationTitle(messages: ChatMessage[], explicitTitle?: string): string {
  const trimmedTitle = explicitTitle?.trim();
  if (trimmedTitle) return trimmedTitle;

  const firstUserMessage = messages.find((message) => message.role === 'user' && message.content.trim());
  const content = firstUserMessage?.content.trim();
  if (!content) return 'Untitled chat';

  return content.length > 80 ? `${content.slice(0, 77).trimEnd()}...` : content;
}

function chatMessageToApiMessage(message: ChatMessage, conversationId: string): Message & Record<string, unknown> {
  return {
    id: message.id,
    conversation_id: conversationId,
    role: message.role,
    parts: {
      text: message.content,
      files: message.files || [],
    },
    model: message.model ?? null,
    usage: (message as ChatMessage & { usage?: unknown }).usage as Message['usage'],
    created_at: message.timestamp || new Date().toISOString(),
    updated_at: message.timestamp || undefined,
    tool_calls: message.toolCalls || [],
    tool_results: message.toolsResults || [],
    tools_results: message.toolsResults || [],
    mcp_auth_requests: message.mcpAuthRequests || [],
  };
}

export async function cacheConversationSnapshot(input: ConversationSnapshotInput): Promise<void> {
  if (!isOfflineChatStoreEnabled() || input.messages.length === 0) {
    return;
  }

  const now = new Date().toISOString();
  const apiMessages = input.messages.map((message) =>
    chatMessageToApiMessage(message, input.conversationId),
  );
  const firstMessageAt = apiMessages[0]?.created_at || now;
  const lastMessageAt = apiMessages[apiMessages.length - 1]?.created_at || now;
  const lastModel = [...apiMessages].reverse().find((message) => message.model)?.model;

  const conversation: ConversationDetail & Record<string, unknown> = {
    id: input.conversationId,
    title: inferConversationTitle(input.messages, input.title),
    archived: false,
    model: input.model || lastModel || null,
    created_at: firstMessageAt,
    updated_at: lastMessageAt,
    web_search_enabled: input.webSearchEnabled || false,
    last_message_at: lastMessageAt,
    messages: apiMessages,
  };

  await cacheConversationDetail(conversation);
}
