export interface ToolCall {
    tool_name: string;
    tool_id: string;
    kind: string;
    status?: 'pending' | 'running' | 'completed' | 'error';
    web_search?: WebSearchPayload | null;
}

export interface WebSearchPayload {
    query: string;
    queries: string[];
    results: WebSearchResult[];
}

export interface WebSearchResult {
    title: string;
    url: string;
}

export interface ToolCallStore {
    activeToolCalls: Map<string, ToolCall>;
    completedToolCalls: ToolCall[];
}