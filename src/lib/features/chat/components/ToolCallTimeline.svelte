<script lang="ts">
  import type { ToolCall, ToolResult, ToolResultContent } from '../../../types/toolCall';
  import { _ } from 'svelte-i18n';
  import { copyToClipboard } from '../../../utils/markdown';
  import { renderMarkdown } from '../../../utils/markdown';

  interface Props {
    toolCalls: ToolCall[];
    toolResults: ToolResult[];
  }

  let { toolCalls, toolResults }: Props = $props();

  // Map tool results by tool_id for quick lookup
  const resultMap = $derived(
    new Map(toolResults.map(tr => [tr.tool_id, tr]))
  );

  // Filter to only MCP tool calls (non-web-search) and deduplicate by tool_id
  const mcpToolCalls = $derived(
    [...new Map(
      toolCalls.filter(tc => tc.kind !== 'web_search').map(tc => [tc.tool_id, tc])
    ).values()]
  );

  // Track expanded state per tool_id
  let expandedIds = $state<Set<string>>(new Set());

  // Track raw JSON view toggle per tool_id
  let rawJsonIds = $state<Set<string>>(new Set());

  // Track collapsed nested sections
  let collapsedNested = $state<Set<string>>(new Set());

  function toggleExpanded(toolId: string) {
    const next = new Set(expandedIds);
    if (next.has(toolId)) {
      next.delete(toolId);
    } else {
      next.add(toolId);
    }
    expandedIds = next;
  }

  function toggleRawJson(toolId: string) {
    const next = new Set(rawJsonIds);
    if (next.has(toolId)) {
      next.delete(toolId);
    } else {
      next.add(toolId);
    }
    rawJsonIds = next;
  }

  function toggleNested(key: string) {
    const next = new Set(collapsedNested);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    collapsedNested = next;
  }

  function handleKeyDown(e: KeyboardEvent, toolId: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      toggleExpanded(toolId);
    }
  }

  // Extract a human-readable tool name from the full MCP tool name
  function formatToolName(name: string): string {
    // Pattern: mcp__{server_id}__{tool_name} → tool_name
    const parts = name.split('__');
    if (parts.length >= 3) {
      return parts.slice(2).join('__').replace(/_/g, ' ');
    }
    return name.replace(/_/g, ' ');
  }

  // Extract server name from full tool name
  function formatServerName(name: string): string {
    const parts = name.split('__');
    if (parts.length >= 3) {
      // Truncate server ID to first 8 chars for readability
      const serverId = parts[1];
      return serverId.length > 12 ? serverId.slice(0, 12) + '...' : serverId;
    }
    return '';
  }

  // ─── Smart Type Detection ────────────────────────────────────────

  type ValueType = 'url' | 'email' | 'date' | 'boolean' | 'number' | 'null' | 'array' | 'object' | 'string';

  function detectValueType(value: any): ValueType {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'boolean') return 'boolean';
    if (typeof value === 'number') return 'number';
    if (Array.isArray(value)) return 'array';
    if (typeof value === 'object') return 'object';
    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value.trim())) return 'url';
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())) return 'email';
      if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2})?/.test(value.trim())) {
        const d = new Date(value);
        if (!isNaN(d.getTime())) return 'date';
      }
    }
    return 'string';
  }

  // Try to parse text content as JSON (any valid JSON)
  type ParsedJson =
    | { type: 'array-objects'; data: any[] }
    | { type: 'array-primitives'; data: any[] }
    | { type: 'object'; data: Record<string, any> }
    | null;

  function tryParseJson(text: string): ParsedJson {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) {
        return { type: 'array-objects', data: parsed };
      }
      if (Array.isArray(parsed)) {
        return { type: 'array-primitives', data: parsed };
      }
      if (typeof parsed === 'object' && parsed !== null) {
        return { type: 'object', data: parsed };
      }
    } catch {
      // Not JSON
    }
    return null;
  }

  // Get column headers from a JSON array of objects — union of all keys
  function getTableHeaders(data: any[]): string[] {
    if (!data.length) return [];
    const keys = new Set<string>();
    for (const row of data) {
      for (const key of Object.keys(row)) {
        keys.add(key);
      }
    }
    return [...keys];
  }

  // ─── Formatting Helpers ──────────────────────────────────────────

  function formatValue(value: any): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return formatNumber(value);
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  function formatNumber(n: number): string {
    if (Number.isInteger(n) && Math.abs(n) >= 1000) {
      return n.toLocaleString();
    }
    if (!Number.isInteger(n)) {
      return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
    }
    return String(n);
  }

  function formatDate(value: string): string {
    try {
      const d = new Date(value);
      const now = new Date();
      const diffMs = now.getTime() - d.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      const dateStr = d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const timeStr = d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

      let relative = '';
      if (diffDays === 0) relative = 'today';
      else if (diffDays === 1) relative = 'yesterday';
      else if (diffDays > 1 && diffDays < 30) relative = `${diffDays}d ago`;

      return relative ? `${dateStr}, ${timeStr} (${relative})` : `${dateStr}, ${timeStr}`;
    } catch {
      return value;
    }
  }

  // Format a key label (snake_case / camelCase → Title Case)
  function formatKeyLabel(key: string): string {
    return key
      .replace(/([a-z])([A-Z])/g, '$1 $2')  // camelCase
      .replace(/[_-]/g, ' ')                 // snake_case / kebab-case
      .replace(/\b\w/g, c => c.toUpperCase()); // Capitalize
  }

  function formatDuration(ms?: number): string {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  // Truncate URL for display
  function truncateUrl(url: string, maxLen = 60): string {
    if (url.length <= maxLen) return url;
    try {
      const u = new URL(url);
      const path = u.pathname.length > 30 ? u.pathname.slice(0, 27) + '...' : u.pathname;
      return u.host + path;
    } catch {
      return url.slice(0, maxLen) + '...';
    }
  }

  // Count the flattened fields in an object
  function countFields(obj: Record<string, any>): number {
    return Object.keys(obj).length;
  }

  // Check if text looks like it has markdown formatting
  function hasMarkdown(text: string): boolean {
    return /(\*\*|__|##|```|- |\d+\. |\[.*\]\(.*\))/.test(text);
  }

  // ─── Clipboard ───────────────────────────────────────────────────

  let copyStates = $state<Map<string, boolean>>(new Map());

  async function handleCopy(toolId: string, text: string) {
    const success = await copyToClipboard(text);
    if (success) {
      copyStates = new Map(copyStates).set(toolId, true);
      setTimeout(() => {
        copyStates = new Map(copyStates).set(toolId, false);
      }, 2000);
    }
  }
</script>

{#if mcpToolCalls.length > 0}
  <div class="tool-timeline" role="list" aria-label={$_('chat.toolExecution.timeline')}>
    {#each mcpToolCalls as toolCall (toolCall.tool_id)}
      {@const result = resultMap.get(toolCall.tool_id)}
      {@const isExpanded = expandedIds.has(toolCall.tool_id)}
      {@const showRaw = rawJsonIds.has(toolCall.tool_id)}
      {@const status = result ? (result.status === 'error' || result.output?.isError ? 'error' : 'completed') : (toolCall.status || 'pending')}
      {@const hasResult = !!result}

      <div
        class="tool-call-item"
        class:tool-call-item--pending={status === 'pending'}
        class:tool-call-item--running={status === 'running'}
        class:tool-call-item--completed={status === 'completed'}
        class:tool-call-item--error={status === 'error'}
        role="listitem"
      >
        <!-- Header / Toggle -->
        <button
          class="tool-call-header"
          class:clickable={hasResult}
          onclick={() => hasResult && toggleExpanded(toolCall.tool_id)}
          onkeydown={(e) => handleKeyDown(e, toolCall.tool_id)}
          disabled={!hasResult}
          aria-expanded={isExpanded}
          aria-label={formatToolName(toolCall.tool_name)}
        >
          <!-- Status indicator -->
          <div class="status-indicator">
            {#if status === 'completed'}
              <svg class="status-icon status-icon--success" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <circle cx="12" cy="12" r="10" fill="var(--brand-green)" stroke="var(--brand-green)"></circle>
                <polyline points="8 12 11 15 16 9" stroke="white"></polyline>
              </svg>
            {:else if status === 'error'}
              <svg class="status-icon status-icon--error" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" fill="var(--brand-red)" stroke="var(--brand-red)"></circle>
                <line x1="15" y1="9" x2="9" y2="15" stroke="white" stroke-width="2"></line>
                <line x1="9" y1="9" x2="15" y2="15" stroke="white" stroke-width="2"></line>
              </svg>
            {:else}
              <div class="spinner-small"></div>
            {/if}
          </div>

          <!-- Tool info -->
          <div class="tool-info">
            <span class="tool-name">{formatToolName(toolCall.tool_name)}</span>
            {#if formatServerName(toolCall.tool_name)}
              <span class="tool-server">{formatServerName(toolCall.tool_name)}</span>
            {/if}
          </div>

          <!-- Duration badge -->
          {#if result?.duration_ms}
            <span class="duration-badge">{formatDuration(result.duration_ms)}</span>
          {/if}

          <!-- Chevron (only when has result) -->
          {#if hasResult}
            <svg
              class="chevron"
              class:rotated={isExpanded}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="6,9 12,15 18,9"></polyline>
            </svg>
          {/if}
        </button>

        <!-- Streaming input preview (while pending/running) -->
        {#if (status === 'pending' || status === 'running') && toolCall.input_text}
          <div class="tool-input-preview">
            <code class="input-text">{toolCall.input_text}</code>
          </div>
        {/if}

        <!-- Expanded result content -->
        {#if isExpanded && result}
          <div class="tool-result-content">

            <!-- Toolbar row: Raw JSON toggle + Copy -->
            <div class="result-toolbar">
              <button
                class="toolbar-btn"
                class:toolbar-btn--active={showRaw}
                onclick={() => toggleRawJson(toolCall.tool_id)}
                title="Toggle raw JSON view"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="16 18 22 12 16 6"></polyline>
                  <polyline points="8 6 2 12 8 18"></polyline>
                </svg>
                <span>{showRaw ? 'Formatted' : 'Raw'}</span>
              </button>

              <button
                class="toolbar-btn"
                onclick={() => handleCopy(toolCall.tool_id + '_all', JSON.stringify({ input: toolCall.input?.value, output: result.output }, null, 2))}
                title={$_('chat.message.copy')}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  {#if copyStates.get(toolCall.tool_id + '_all')}
                    <polyline points="20,6 9,17 4,12"></polyline>
                  {:else}
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                  {/if}
                </svg>
                <span>{copyStates.get(toolCall.tool_id + '_all') ? $_('chat.message.copied') : $_('chat.message.copy')}</span>
              </button>
            </div>

            {#if showRaw}
              <!-- ────── RAW JSON VIEW ────── -->
              {#if toolCall.input?.value}
                <div class="result-section">
                  <div class="section-label">{$_('chat.toolExecution.input')}</div>
                  <div class="code-block-wrapper">
                    <pre class="result-code"><code>{JSON.stringify(toolCall.input.value, null, 2)}</code></pre>
                  </div>
                </div>
              {/if}
              {#if result.output?.content}
                <div class="result-section">
                  <div class="section-label">{$_('chat.toolExecution.output')}</div>
                  {#each result.output.content as content}
                    {#if content.type === 'text' && content.text}
                      <div class="code-block-wrapper">
                        <pre class="result-code"><code>{content.text}</code></pre>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}

            {:else}
              <!-- ────── FORMATTED VIEW ────── -->

              <!-- Input parameters: compact inline tags -->
              {#if toolCall.input?.value && Object.keys(toolCall.input.value).length > 0}
                <div class="result-section">
                  <div class="section-label">{$_('chat.toolExecution.input')}</div>
                  <div class="input-tags">
                    {#each Object.entries(toolCall.input.value) as [key, val]}
                      {@const vtype = detectValueType(val)}
                      <div class="input-tag" title={`${key}: ${formatValue(val)}`}>
                        <span class="input-tag__key">{formatKeyLabel(key)}</span>
                        <span class="input-tag__value" class:input-tag__value--url={vtype === 'url'}>
                          {#if vtype === 'url'}
                            {truncateUrl(String(val))}
                          {:else if vtype === 'boolean'}
                            {val ? '✓' : '✗'}
                          {:else if vtype === 'object' || vtype === 'array'}
                            {Array.isArray(val) ? `[${val.length}]` : `{${countFields(val as Record<string, any>)}`}
                          {:else}
                            {formatValue(val)}
                          {/if}
                        </span>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              <!-- Output content -->
              {#if result.output?.content}
                <div class="result-section">
                  <div class="section-label">{$_('chat.toolExecution.output')}</div>
                  {#each result.output.content as content, contentIdx}
                    {#if content.type === 'text' && content.text}
                      {@const parsed = tryParseJson(content.text)}

                      {#if parsed?.type === 'array-objects'}
                        <!-- ═══ TABLE: array of objects ═══ -->
                        <div class="result-table-wrapper">
                          <table class="result-table">
                            <thead>
                              <tr>
                                <th class="row-num-header">#</th>
                                {#each getTableHeaders(parsed.data) as header}
                                  <th>{formatKeyLabel(header)}</th>
                                {/each}
                              </tr>
                            </thead>
                            <tbody>
                              {#each parsed.data as row, rowIdx}
                                <tr>
                                  <td class="row-num">{rowIdx + 1}</td>
                                  {#each getTableHeaders(parsed.data) as header}
                                    {@const cellType = detectValueType(row[header])}
                                    <td title={formatValue(row[header])} class:td--number={cellType === 'number'}>
                                      {#if cellType === 'url'}
                                        <a href={String(row[header])} target="_blank" rel="noopener noreferrer" class="cell-link">
                                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                          {truncateUrl(String(row[header]), 40)}
                                        </a>
                                      {:else if cellType === 'email'}
                                        <a href={`mailto:${row[header]}`} class="cell-link">{row[header]}</a>
                                      {:else if cellType === 'boolean'}
                                        <span class="badge" class:badge--true={row[header]} class:badge--false={!row[header]}>{row[header] ? 'Yes' : 'No'}</span>
                                      {:else if cellType === 'null'}
                                        <span class="null-value">—</span>
                                      {:else if cellType === 'date'}
                                        <span class="date-value" title={String(row[header])}>{formatDate(String(row[header]))}</span>
                                      {:else if cellType === 'object' || cellType === 'array'}
                                        <code class="inline-json">{JSON.stringify(row[header])}</code>
                                      {:else}
                                        {formatValue(row[header])}
                                      {/if}
                                    </td>
                                  {/each}
                                </tr>
                              {/each}
                            </tbody>
                          </table>
                        </div>
                        <div class="table-footer">
                          <span class="row-count">{parsed.data.length} {parsed.data.length === 1 ? $_('chat.toolExecution.row') : $_('chat.toolExecution.rows')}</span>
                        </div>

                      {:else if parsed?.type === 'object'}
                        <!-- ═══ KEY-VALUE CARD: single object ═══ -->
                        <div class="kv-card">
                          {#each Object.entries(parsed.data) as [key, val]}
                            {@const vtype = detectValueType(val)}
                            {@const nestedKey = `${toolCall.tool_id}_${contentIdx}_${key}`}
                            {@const isCollapsed = collapsedNested.has(nestedKey)}

                            <div class="kv-row">
                              <span class="kv-key">
                                <span class="kv-type-dot kv-type-dot--{vtype}"></span>
                                {formatKeyLabel(key)}
                              </span>
                              <span class="kv-value">
                                {#if vtype === 'url'}
                                  <a href={String(val)} target="_blank" rel="noopener noreferrer" class="cell-link">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
                                    {truncateUrl(String(val))}
                                  </a>
                                {:else if vtype === 'email'}
                                  <a href={`mailto:${val}`} class="cell-link">{val}</a>
                                {:else if vtype === 'boolean'}
                                  <span class="badge" class:badge--true={val} class:badge--false={!val}>{val ? 'Yes' : 'No'}</span>
                                {:else if vtype === 'null'}
                                  <span class="null-value">—</span>
                                {:else if vtype === 'date'}
                                  <span class="date-value">{formatDate(String(val))}</span>
                                {:else if vtype === 'number'}
                                  <span class="number-value">{formatNumber(val as number)}</span>
                                {:else if vtype === 'array' && Array.isArray(val)}
                                  {#if val.length === 0}
                                    <span class="null-value">Empty list</span>
                                  {:else if val.length > 0 && typeof val[0] === 'object' && val[0] !== null}
                                    <!-- Nested table (collapsible) -->
                                    <button class="nested-toggle" onclick={() => toggleNested(nestedKey)}>
                                      <svg class="nested-chevron" class:rotated={!isCollapsed} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6,9 12,15 18,9"></polyline></svg>
                                      {val.length} {val.length === 1 ? 'item' : 'items'}
                                    </button>
                                    {#if !isCollapsed}
                                      <div class="kv-nested-table">
                                        <table class="result-table result-table--nested">
                                          <thead>
                                            <tr>
                                              {#each getTableHeaders(val) as h}
                                                <th>{formatKeyLabel(h)}</th>
                                              {/each}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {#each val as nestedRow}
                                              <tr>
                                                {#each getTableHeaders(val) as h}
                                                  <td>{formatValue(nestedRow[h])}</td>
                                                {/each}
                                              </tr>
                                            {/each}
                                          </tbody>
                                        </table>
                                      </div>
                                    {/if}
                                  {:else}
                                    <!-- Primitive array as chips -->
                                    <div class="chip-list">
                                      {#each val as item}
                                        <span class="chip">{formatValue(item)}</span>
                                      {/each}
                                    </div>
                                  {/if}
                                {:else if vtype === 'object'}
                                  <!-- Nested object (collapsible) -->
                                  <button class="nested-toggle" onclick={() => toggleNested(nestedKey)}>
                                    <svg class="nested-chevron" class:rotated={!isCollapsed} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6,9 12,15 18,9"></polyline></svg>
                                    {countFields(val as Record<string, any>)} fields
                                  </button>
                                  {#if !isCollapsed}
                                    <div class="nested-kv">
                                      {#each Object.entries(val as Record<string, any>) as [nk, nv]}
                                        <div class="nested-kv-row">
                                          <span class="nested-kv-key">{formatKeyLabel(nk)}</span>
                                          <span class="nested-kv-val">
                                            {#if detectValueType(nv) === 'url'}
                                              <a href={String(nv)} target="_blank" rel="noopener noreferrer" class="cell-link">{truncateUrl(String(nv))}</a>
                                            {:else if detectValueType(nv) === 'boolean'}
                                              <span class="badge" class:badge--true={nv} class:badge--false={!nv}>{nv ? 'Yes' : 'No'}</span>
                                            {:else}
                                              {formatValue(nv)}
                                            {/if}
                                          </span>
                                        </div>
                                      {/each}
                                    </div>
                                  {/if}
                                {:else}
                                  {formatValue(val)}
                                {/if}
                              </span>
                            </div>
                          {/each}
                        </div>
                        <div class="table-footer">
                          <span class="row-count">{countFields(parsed.data)} {countFields(parsed.data) === 1 ? 'field' : 'fields'}</span>
                        </div>

                      {:else if parsed?.type === 'array-primitives'}
                        <!-- ═══ CHIPS: array of primitives ═══ -->
                        <div class="chip-list">
                          {#each parsed.data as item}
                            <span class="chip">{formatValue(item)}</span>
                          {/each}
                        </div>
                        <div class="table-footer">
                          <span class="row-count">{parsed.data.length} {parsed.data.length === 1 ? 'item' : 'items'}</span>
                        </div>

                      {:else}
                        <!-- ═══ PLAIN TEXT (with markdown support) ═══ -->
                        {#if hasMarkdown(content.text)}
                          <div class="markdown-block">
                            {@html renderMarkdown(content.text)}
                          </div>
                        {:else}
                          <div class="plain-text-block">
                            <p class="plain-text">{content.text}</p>
                          </div>
                        {/if}
                      {/if}

                    {:else if content.type === 'image' && content.data}
                      <div class="result-image-wrapper">
                        <img
                          src={`data:${content.mimeType || 'image/png'};base64,${content.data}`}
                          alt={content.name || $_('chat.toolExecution.imageResult')}
                          class="result-image"
                        />
                      </div>
                    {:else if content.type === 'resource'}
                      <div class="result-resource">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                          <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                        <span>{content.name || content.uri || $_('chat.toolExecution.resource')}</span>
                      </div>
                    {/if}
                  {/each}
                </div>
              {/if}
            {/if}

            <!-- Error output -->
            {#if result.output?.isError}
              <div class="result-error">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>
                  {result.output.content?.[0]?.text || $_('chat.toolExecution.unknownError')}
                </span>
              </div>
            {/if}
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .tool-timeline {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .tool-call-item {
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.75rem;
    background: var(--surface-elevated);
    overflow: hidden;
    animation: fadeInUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tool-call-item--error {
    border-color: color-mix(in oklab, var(--brand-red) 25%, var(--glass-stroke-light));
  }

  .tool-call-header {
    display: flex;
    align-items: center;
    gap: 0.625rem;
    width: 100%;
    padding: 0.625rem 0.875rem;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: default;
    transition: all 0.2s ease;
    text-align: left;
  }

  .tool-call-header.clickable {
    cursor: pointer;
  }

  .tool-call-header.clickable:hover {
    background: var(--surface-subtle);
  }

  .tool-call-item--completed .tool-call-header {
    color: var(--text-primary);
  }

  .status-indicator {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
  }

  .status-icon {
    flex-shrink: 0;
  }

  .spinner-small {
    width: 16px;
    height: 16px;
    border: 2px solid var(--glass-stroke-light);
    border-top-color: var(--brand);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    flex-shrink: 0;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .tool-info {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .tool-name {
    font-weight: 600;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-transform: capitalize;
  }

  .tool-server {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    background: rgba(var(--glass-tint), 0.06);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .duration-badge {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
    font-variant-numeric: tabular-nums;
    flex-shrink: 0;
  }

  .chevron {
    flex-shrink: 0;
    transition: transform 0.2s ease;
    color: var(--text-tertiary);
  }

  .chevron.rotated {
    transform: rotate(180deg);
  }

  /* Streaming input preview */
  .tool-input-preview {
    padding: 0 0.875rem 0.5rem;
    overflow: hidden;
  }

  .input-text {
    display: block;
    font-family: 'SF Mono', Monaco, Menlo, 'Ubuntu Mono', monospace;
    font-size: 0.75rem;
    color: var(--text-tertiary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
    opacity: 0.7;
  }

  /* ─── Result Content ─── */

  .tool-result-content {
    padding: 0 0.875rem 0.875rem;
    border-top: 1px solid var(--glass-stroke-light);
    animation: slideDown 0.2s ease;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  @keyframes slideDown {
    from { opacity: 0; max-height: 0; }
    to { opacity: 1; max-height: 2000px; }
  }

  /* ─── Toolbar ─── */

  .result-toolbar {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 0.375rem;
    padding-top: 0.5rem;
  }

  .toolbar-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.375rem;
    color: var(--text-tertiary);
    font-size: 0.6875rem;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .toolbar-btn:hover {
    background: var(--surface-subtle);
    color: var(--text-primary);
  }

  .toolbar-btn--active {
    background: rgba(var(--glass-tint), 0.1);
    color: var(--brand);
    border-color: var(--brand);
  }

  /* ─── Sections ─── */

  .result-section {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    margin-top: 0.25rem;
  }

  .section-label {
    font-size: 0.6875rem;
    font-weight: 600;
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* ─── Input Tags ─── */

  .input-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
  }

  .input-tag {
    display: inline-flex;
    align-items: center;
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.375rem;
    overflow: hidden;
    font-size: 0.75rem;
    line-height: 1;
    max-width: 100%;
  }

  .input-tag__key {
    padding: 0.3rem 0.5rem;
    background: rgba(var(--glass-tint), 0.06);
    color: var(--text-tertiary);
    font-weight: 600;
    font-size: 0.6875rem;
    white-space: nowrap;
    border-right: 1px solid var(--glass-stroke-light);
  }

  .input-tag__value {
    padding: 0.3rem 0.5rem;
    color: var(--text-primary);
    max-width: 300px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .input-tag__value--url {
    color: var(--brand);
  }

  /* ─── Code Block (Raw JSON) ─── */

  .code-block-wrapper {
    position: relative;
  }

  .result-code {
    margin: 0;
    padding: 0.625rem 0.75rem;
    background: color-mix(in oklab, var(--glass-bg-dark) 30%, var(--btn-tertiary));
    border-radius: 0.5rem;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
  }

  @media (prefers-color-scheme: light) {
    .result-code {
      background: #f1f5f9;
    }
  }

  .result-code code {
    font-family: 'SF Mono', Monaco, Menlo, 'Ubuntu Mono', monospace;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  /* ─── Key-Value Card ─── */

  .kv-card {
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.5rem;
    overflow: hidden;
  }

  .kv-row {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid color-mix(in oklab, var(--glass-stroke-light) 50%, transparent);
    font-size: 0.8125rem;
    line-height: 1.5;
    transition: background 0.1s ease;
  }

  .kv-row:last-child {
    border-bottom: none;
  }

  .kv-row:nth-child(even) {
    background: rgba(var(--glass-tint), 0.02);
  }

  .kv-row:hover {
    background: var(--surface-subtle);
  }

  .kv-key {
    flex-shrink: 0;
    min-width: 90px;
    max-width: 160px;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-weight: 600;
    color: var(--text-tertiary);
    font-size: 0.75rem;
    padding-top: 1px;
  }

  /* Type indicator dot */
  .kv-type-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .kv-type-dot--string { background: #8b8bf5; }
  .kv-type-dot--number { background: #f59e0b; }
  .kv-type-dot--boolean { background: #10b981; }
  .kv-type-dot--url { background: #3b82f6; }
  .kv-type-dot--email { background: #6366f1; }
  .kv-type-dot--date { background: #ec4899; }
  .kv-type-dot--null { background: #6b7280; }
  .kv-type-dot--array { background: #f97316; }
  .kv-type-dot--object { background: #14b8a6; }

  .kv-value {
    flex: 1;
    min-width: 0;
    color: var(--text-primary);
    word-break: break-word;
  }

  /* ─── Smart Value Renderers ─── */

  .cell-link {
    color: var(--brand);
    text-decoration: none;
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    word-break: break-all;
  }

  .cell-link:hover {
    text-decoration: underline;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    padding: 0.125rem 0.5rem;
    border-radius: 1rem;
    font-size: 0.6875rem;
    font-weight: 600;
    letter-spacing: 0.3px;
  }

  .badge--true {
    background: color-mix(in oklab, var(--brand-green) 15%, transparent);
    color: var(--brand-green);
  }

  .badge--false {
    background: rgba(var(--glass-tint), 0.08);
    color: var(--text-tertiary);
  }

  .null-value {
    color: var(--text-tertiary);
    font-style: italic;
  }

  .date-value {
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
    white-space: nowrap;
  }

  .number-value {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  .inline-json {
    font-family: 'SF Mono', Monaco, Menlo, 'Ubuntu Mono', monospace;
    font-size: 0.6875rem;
    background: rgba(var(--glass-tint), 0.06);
    padding: 0.125rem 0.3rem;
    border-radius: 0.25rem;
    color: var(--text-secondary);
    max-width: 200px;
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: middle;
  }

  /* ─── Nested Collapsible ─── */

  .nested-toggle {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.125rem 0.375rem;
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.25rem;
    color: var(--text-secondary);
    font-size: 0.6875rem;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-bottom: 0.25rem;
  }

  .nested-toggle:hover {
    background: rgba(var(--glass-tint), 0.12);
    color: var(--text-primary);
  }

  .nested-chevron {
    transition: transform 0.2s ease;
  }

  .nested-chevron.rotated {
    transform: rotate(180deg);
  }

  .kv-nested-table {
    margin-top: 0.25rem;
    border-radius: 0.375rem;
    overflow: auto;
    border: 1px solid var(--glass-stroke-light);
  }

  .nested-kv {
    margin-top: 0.25rem;
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.375rem;
    overflow: hidden;
  }

  .nested-kv-row {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.3rem 0.5rem;
    border-bottom: 1px solid color-mix(in oklab, var(--glass-stroke-light) 50%, transparent);
    font-size: 0.75rem;
  }

  .nested-kv-row:last-child {
    border-bottom: none;
  }

  .nested-kv-key {
    flex-shrink: 0;
    min-width: 70px;
    max-width: 120px;
    font-weight: 600;
    color: var(--text-tertiary);
    font-size: 0.6875rem;
  }

  .nested-kv-val {
    flex: 1;
    min-width: 0;
    color: var(--text-secondary);
    word-break: break-word;
  }

  /* ─── Chip List ─── */

  .chip-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.25rem 0;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.25rem 0.625rem;
    background: rgba(var(--glass-tint), 0.06);
    border: 1px solid var(--glass-stroke-light);
    border-radius: 1rem;
    font-size: 0.75rem;
    color: var(--text-secondary);
    transition: background 0.15s ease;
  }

  .chip:hover {
    background: rgba(var(--glass-tint), 0.12);
  }

  /* ─── Plain Text / Markdown Block ─── */

  .plain-text-block {
    position: relative;
    padding: 0.625rem 0.75rem;
    background: color-mix(in oklab, var(--glass-bg-dark) 30%, var(--btn-tertiary));
    border-radius: 0.5rem;
    max-height: 300px;
    overflow-y: auto;
  }

  @media (prefers-color-scheme: light) {
    .plain-text-block {
      background: #f1f5f9;
    }
  }

  .plain-text {
    margin: 0;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-primary);
    white-space: pre-wrap;
    word-wrap: break-word;
  }

  .markdown-block {
    padding: 0.5rem 0.75rem;
    font-size: 0.8125rem;
    line-height: 1.6;
    color: var(--text-primary);
    max-height: 400px;
    overflow-y: auto;
    border: 1px solid var(--glass-stroke-light);
    border-radius: 0.5rem;
  }

  .markdown-block :global(h1),
  .markdown-block :global(h2),
  .markdown-block :global(h3) {
    margin: 0.5em 0 0.25em;
    font-size: 1em;
    font-weight: 700;
    color: var(--text-primary);
  }

  .markdown-block :global(p) {
    margin: 0.375em 0;
  }

  .markdown-block :global(ul),
  .markdown-block :global(ol) {
    padding-left: 1.25rem;
    margin: 0.375em 0;
  }

  .markdown-block :global(code) {
    font-family: 'SF Mono', Monaco, Menlo, 'Ubuntu Mono', monospace;
    font-size: 0.7rem;
    background: rgba(var(--glass-tint), 0.08);
    padding: 0.125rem 0.3rem;
    border-radius: 0.25rem;
  }

  .markdown-block :global(pre) {
    background: color-mix(in oklab, var(--glass-bg-dark) 30%, var(--btn-tertiary));
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    overflow-x: auto;
    margin: 0.5em 0;
  }

  .markdown-block :global(pre code) {
    background: none;
    padding: 0;
  }

  .markdown-block :global(a) {
    color: var(--brand);
  }

  .markdown-block :global(table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.75rem;
    margin: 0.5em 0;
  }

  .markdown-block :global(th),
  .markdown-block :global(td) {
    padding: 0.25rem 0.5rem;
    border: 1px solid var(--glass-stroke-light);
    text-align: left;
  }

  .markdown-block :global(th) {
    font-weight: 600;
    background: rgba(var(--glass-tint), 0.04);
  }

  /* ─── Table Rendering ─── */

  .result-table-wrapper {
    overflow-x: auto;
    border-radius: 0.5rem;
    border: 1px solid var(--glass-stroke-light);
  }

  .result-table {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.75rem;
  }

  .result-table th,
  .result-table td {
    padding: 0.375rem 0.625rem;
    border: 1px solid color-mix(in oklab, var(--glass-stroke-light) 60%, transparent);
    text-align: left;
    white-space: nowrap;
    max-width: 280px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .result-table th {
    background: color-mix(in oklab, var(--glass-bg-dark) 40%, var(--btn-secondary));
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.6875rem;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    position: sticky;
    top: 0;
  }

  .result-table td {
    color: var(--text-secondary);
  }

  .td--number {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .result-table tbody tr:nth-child(even) {
    background: rgba(var(--glass-tint), 0.02);
  }

  .result-table tbody tr:hover {
    background: var(--surface-subtle);
  }

  .result-table--nested {
    font-size: 0.6875rem;
  }

  .result-table--nested th,
  .result-table--nested td {
    padding: 0.25rem 0.5rem;
  }

  .row-num-header,
  .row-num {
    text-align: center;
    color: var(--text-tertiary);
    font-size: 0.625rem;
    width: 2rem;
    padding: 0.375rem 0.25rem;
  }

  .table-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-top: 0.375rem;
  }

  .row-count {
    font-size: 0.6875rem;
    color: var(--text-tertiary);
  }

  /* ─── Image result ─── */

  .result-image-wrapper {
    border-radius: 0.5rem;
    overflow: hidden;
    border: 1px solid var(--glass-stroke-light);
  }

  .result-image {
    max-width: 100%;
    max-height: 400px;
    display: block;
    object-fit: contain;
  }

  /* ─── Resource result ─── */

  .result-resource {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--surface-subtle);
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  /* ─── Error display ─── */

  .result-error {
    display: flex;
    align-items: flex-start;
    gap: 0.5rem;
    padding: 0.625rem 0.75rem;
    background: color-mix(in oklab, var(--brand-red) 5%, var(--surface-elevated));
    border: 1px solid color-mix(in oklab, var(--brand-red) 20%, transparent);
    border-radius: 0.5rem;
    color: var(--brand-red);
    font-size: 0.8125rem;
    line-height: 1.5;
    margin-top: 0.5rem;
  }

  .result-error svg {
    flex-shrink: 0;
    margin-top: 0.125rem;
  }

  /* ─── Responsive ─── */

  @media (max-width: 768px) {
    .tool-call-header {
      padding: 0.5rem 0.75rem;
      font-size: 0.75rem;
    }

    .tool-result-content {
      padding: 0 0.75rem 0.75rem;
    }

    .tool-server {
      display: none;
    }

    .result-table th,
    .result-table td {
      padding: 0.25rem 0.5rem;
      font-size: 0.6875rem;
    }

    .kv-row {
      flex-direction: column;
      gap: 0.125rem;
    }

    .kv-key {
      max-width: 100%;
    }

    .input-tag {
      max-width: 100%;
    }

    .input-tag__value {
      max-width: 180px;
    }
  }
</style>
