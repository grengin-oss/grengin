use tauri_plugin_sql::{Migration, MigrationKind};

pub const CHAT_DB_URL: &str = "sqlite:grengin-chat.db";

pub fn migrations() -> Vec<Migration> {
    vec![
        Migration {
            version: 1,
            description: "create_offline_chat_cache",
            sql: r#"
CREATE TABLE IF NOT EXISTS cached_conversations (
  user_scope TEXT NOT NULL,
  id TEXT NOT NULL,
  title TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  archived_at TEXT,
  model TEXT,
  total_tokens INTEGER,
  total_cost REAL,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  web_search_enabled INTEGER NOT NULL DEFAULT 0,
  last_message_at TEXT,
  search_text TEXT NOT NULL DEFAULT '',
  raw_json TEXT NOT NULL,
  detail_json TEXT,
  messages_synced INTEGER NOT NULL DEFAULT 0,
  synced_at INTEGER NOT NULL,
  PRIMARY KEY (user_scope, id)
);
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 2,
            description: "index_offline_chat_cache_sort",
            sql: r#"
CREATE INDEX IF NOT EXISTS idx_cached_conversations_scope_sort
  ON cached_conversations (
    user_scope,
    archived,
    last_message_at DESC,
    updated_at DESC,
    created_at DESC
  );
"#,
            kind: MigrationKind::Up,
        },
        Migration {
            version: 3,
            description: "index_offline_chat_cache_sync_state",
            sql: r#"
CREATE INDEX IF NOT EXISTS idx_cached_conversations_scope_synced
  ON cached_conversations (user_scope, messages_synced, synced_at);
"#,
            kind: MigrationKind::Up,
        },
    ]
}
