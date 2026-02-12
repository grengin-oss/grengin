export interface ToolCall {
    tool_name: string;
    tool_id: string;
    kind: string;
}

export interface ToolResult {
    tool_name: string;
    tool_id: string;
    kind: string;
    web_search?: WebSearch;
}

export interface MergedToolResult {
    tool_name: string;
    kind: string;
    web_search?: WebSearch;
    status: 'completed' | 'running';
}

export interface WebSearch {
    queries?: string[];
    query: string;
    results: WebSearchResult[];
}

export interface WebSearchResult {
    title: string;
    url: string;
}
