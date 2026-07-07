export type ToolCallStatus = 'pending' | 'running' | 'completed' | 'error';

export interface ToolCall {
    tool_name: string;
    tool_id: string;
    kind: string;
    input_text?: string;
    input?: { type: string; value: Record<string, unknown> };
    status?: ToolCallStatus;
}

export interface ToolResultContent {
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
    uri?: string;
    name?: string;
}

export interface ToolResultOutput {
    content: ToolResultContent[];
    isError: boolean;
}

export interface ToolResult {
    tool_name: string;
    tool_id: string;
    kind: string;
    status?: 'success' | 'error';
    output?: ToolResultOutput;
    duration_ms?: number;
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

export interface Artifact {
    id: string;
    title: string;
    content: string;
    content_type: 'text/html' | 'text/markdown';
    isStreaming?: boolean;
}
