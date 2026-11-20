<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

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

  const resultMap = $derived(
    new Map(toolResults.map(tr => [tr.tool_id, tr]))
  );

  const mcpToolCalls = $derived(
    [...new Map(
      toolCalls.filter(tc => tc.kind !== 'web_search').map(tc => [tc.tool_id, tc])
    ).values()]
  );

  let rawJsonIds = $state<Set<string>>(new Set());
  let collapsedNested = $state<Set<string>>(new Set());
  let expandedBlocks = $state<Set<string>>(new Set());
  let expandedGroups = $state<Set<string>>(new Set());
  let tableSearchQueries = $state<Record<string, string>>({});

  function toggleRawJson(toolId: string) {
    const next = new Set(rawJsonIds);
    if (next.has(toolId)) next.delete(toolId); else next.add(toolId);
    rawJsonIds = next;
  }

  function toggleNested(key: string) {
    const next = new Set(collapsedNested);
    if (next.has(key)) next.delete(key); else next.add(key);
    collapsedNested = next;
  }

  function toggleBlock(toolId: string) {
    const next = new Set(expandedBlocks);
    if (next.has(toolId)) next.delete(toolId); else next.add(toolId);
    expandedBlocks = next;
  }

  function toggleGroup(groupKey: string) {
    const next = new Set(expandedGroups);
    if (next.has(groupKey)) next.delete(groupKey); else next.add(groupKey);
    expandedGroups = next;
  }

  // ─── ID & Name Cleaners ───
  function isIdToken(token: string): boolean {
    return (
      /^[0-9a-f]{6,}(-[0-9a-f]{4}){0,3}(-[0-9a-f]{12})?$/i.test(token) ||
      /^[0-9a-f]{8,}$/i.test(token)
    );
  }

  function cleanToolName(name: string): string {
    const parts = name.split('__');
    const nonIdParts = parts.filter(p => p !== 'mcp' && !isIdToken(p));
    if (nonIdParts.length === 0) return name;
    const tool = nonIdParts[nonIdParts.length - 1];
    return tool.replace(/^[_\s]+|[_\s]+$/g, '');
  }

  function formatToolName(name: string): string {
    const cleaned = cleanToolName(name);
    return cleaned
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/_/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  type ToolCategory = 'search' | 'file' | 'database' | 'message' | 'edit' | 'web' | 'code' | 'tool';

  function toolCategory(name: string): ToolCategory {
    const n = (cleanToolName(name) + ' ' + formatToolName(name)).toLowerCase();
    if (/\b(search|find|query|lookup|list|browse|get[_\s-]?issue|jql)\b/.test(n)) return 'search';
    if (/\b(sql|database|db|table|record|rows?|dataset|bigquery|postgres)\b/.test(n)) return 'database';
    if (/\b(file|read|page|doc|document|content|confluence|fetch)\b/.test(n)) return 'file';
    if (/\b(mail|email|message|send|slack|comment|notify|post|thread)\b/.test(n)) return 'message';
    if (/\b(create|add|new|update|edit|delete|remove|set|transition|assign)\b/.test(n)) return 'edit';
    if (/\b(http|url|web|request|api|navigate)\b/.test(n)) return 'web';
    if (/\b(code|git|pr|commit|repo|branch|diff|patch)\b/.test(n)) return 'code';
    return 'tool';
  }

  const SERVICE_NAMES: Record<string, string> = {
    jira: 'Jira', confluence: 'Confluence', slack: 'Slack', github: 'GitHub',
    gitlab: 'GitLab', notion: 'Notion', linear: 'Linear', figma: 'Figma',
    salesforce: 'Salesforce', hubspot: 'HubSpot', zendesk: 'Zendesk',
    gmail: 'Gmail', google: 'Google', drive: 'Drive', calendar: 'Calendar',
    bigquery: 'BigQuery', snowflake: 'Snowflake', postgres: 'Postgres',
    stripe: 'Stripe', asana: 'Asana', trello: 'Trello', outlook: 'Outlook',
  };

  function serviceLabel(name: string): string {
    const parts = name.split('__');
    for (const p of parts) {
      if (isIdToken(p) || p === 'mcp') continue;
      const key = p.toLowerCase();
      if (SERVICE_NAMES[key]) return SERVICE_NAMES[key];
    }
    const tool = cleanToolName(name).toLowerCase();
    if (/\b(slack|channel|user)\b/.test(tool)) return 'Slack';
    if (/\b(thread|message|mail|inbox|gmail|draft|label)\b/.test(tool)) return 'Gmail';
    if (/\b(jira|jql|issue|sprint|epic)\b/.test(tool)) return 'Jira';
    if (/\b(confluence|page|space|wiki)\b/.test(tool)) return 'Confluence';
    if (/\b(git|github|pr|pull_request|repo|commit)\b/.test(tool)) return 'GitHub';
    if (/\b(notion|block)\b/.test(tool)) return 'Notion';
    if (/\b(linear|ticket)\b/.test(tool)) return 'Linear';
    if (/\b(calendar|event)\b/.test(tool)) return 'Calendar';
    if (/\b(drive|file|folder)\b/.test(tool)) return 'Drive';
    return '';
  }

  const VERBS: { re: RegExp; past: string; ing: string }[] = [
    { re: /^(search|find|query|jql|lookup)$/, past: 'Searched', ing: 'Searching' },
    { re: /^list$/, past: 'Listed', ing: 'Listing' },
    { re: /^(get|read|fetch|view|retrieve|show|describe)$/, past: 'Read', ing: 'Reading' },
    { re: /^(create|add|new|insert)$/, past: 'Created', ing: 'Creating' },
    { re: /^(update|edit|set|modify|transition|assign|move|rename)$/, past: 'Updated', ing: 'Updating' },
    { re: /^(delete|remove|archive)$/, past: 'Deleted', ing: 'Deleting' },
    { re: /^(post|send|comment|notify|message|share|reply|email)$/, past: 'Sent', ing: 'Sending' },
    { re: /^upload$/, past: 'Uploaded', ing: 'Uploading' },
    { re: /^(run|execute|exec|call)$/, past: 'Ran', ing: 'Running' },
  ];

  const FILLER = new Set([
    'using', 'the', 'a', 'an', 'by', 'via', 'with', 'and', 'or', 'of', 'to',
    'in', 'for', 'on', 'from', 'my', 'your', 'this', 'that', 'id', 'ids', 'all',
  ]);

  function describeStep(name: string, tense: 'past' | 'present'): string {
    const service = serviceLabel(name);
    const words = formatToolName(name).toLowerCase().split(' ').filter(Boolean);
    let verb = tense === 'past' ? 'Used' : 'Running';
    let verbWord = '';
    for (const v of VERBS) {
      const w = words.find((x) => v.re.test(x));
      if (w) { verb = tense === 'past' ? v.past : v.ing; verbWord = w; break; }
    }
    const objWords: string[] = [];
    for (const w of words) {
      if (w === verbWord) continue;
      if (w === 'using') break;
      if (FILLER.has(w)) continue;
      objWords.push(w);
    }
    const obj = objWords.join(' ').trim();
    if (service) {
      if (verb === 'Searched' || verb === 'Searching') return obj ? `${verb} ${service} for ${obj}` : `${verb} ${service}`;
      return obj ? `${verb} ${service} ${obj}` : `${verb} ${service}`;
    }
    if (obj) return `${verb} ${obj}`;
    return formatToolName(name);
  }

  function humanJoin(items: string[]): string {
    const u = [...new Set(items)].filter(Boolean);
    if (u.length === 0) return '';
    if (u.length === 1) return u[0];
    if (u.length === 2) return `${u[0]} & ${u[1]}`;
    return `${u.slice(0, -1).join(', ')} & ${u[u.length - 1]}`;
  }

  // ─── Type Detection ───
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

  type ParsedJson =
    | { type: 'array-objects'; data: any[] }
    | { type: 'array-primitives'; data: any[] }
    | { type: 'object'; data: Record<string, any> }
    | null;

  function tryParseJson(text: string): ParsedJson {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed) && parsed.length > 0 && typeof parsed[0] === 'object' && parsed[0] !== null) return { type: 'array-objects', data: parsed };
      if (Array.isArray(parsed)) return { type: 'array-primitives', data: parsed };
      if (typeof parsed === 'object' && parsed !== null) return { type: 'object', data: parsed };
    } catch { /* Not JSON */ }
    return null;
  }

  function getTableHeaders(data: any[]): string[] {
    if (!data.length) return [];
    const keys = new Set<string>();
    for (const row of data) { if (row && typeof row === 'object') for (const key of Object.keys(row)) keys.add(key); }
    return [...keys];
  }

  function filterTableRows(data: any[], query?: string): any[] {
    if (!query || !query.trim()) return data;
    const q = query.toLowerCase().trim();
    return data.filter((row) => Object.values(row).some((val) => String(val).toLowerCase().includes(q)));
  }

  // ─── Formatters ───
  function formatValue(value: any): string {
    if (value === null || value === undefined) return '—';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return formatNumber(value);
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    return String(value);
  }

  function formatNumber(n: number): string {
    if (Number.isInteger(n) && Math.abs(n) >= 1000) return n.toLocaleString();
    if (!Number.isInteger(n)) return n.toLocaleString(undefined, { maximumFractionDigits: 4 });
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
    } catch { return value; }
  }

  function formatKeyLabel(key: string): string {
    return key.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function formatDuration(ms?: number): string {
    if (!ms) return '';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  }

  function truncateUrl(url: string, maxLen = 42): string {
    if (url.length <= maxLen) return url;
    try {
      const u = new URL(url);
      const path = u.pathname.length > 20 ? u.pathname.slice(0, 18) + '…' : u.pathname;
      return u.host + path;
    } catch { return url.slice(0, maxLen) + '…'; }
  }

  function formatArgValue(val: any): string {
    if (typeof val === 'string') {
      if (isIdToken(val) && val.length > 12) {
        return `"${val.slice(0, 8)}…"`;
      }
      return val.length > 20 ? `"${val.slice(0, 18)}…"` : `"${val}"`;
    }
    if (typeof val === 'object' && val !== null) {
      return Array.isArray(val) ? `[${val.length}]` : '{…}';
    }
    return String(val);
  }

  function countFields(obj: Record<string, any>): number { return Object.keys(obj).length; }
  function hasMarkdown(text: string): boolean { return /(\*\*|__|##|```|- |\d+\. |\[.*\]\(.*\))/.test(text); }

  // ─── Clipboard ───
  let copyStates = $state<Map<string, boolean>>(new Map());

  async function handleCopy(key: string, text: string) {
    const success = await copyToClipboard(text);
    if (success) {
      copyStates = new Map(copyStates).set(key, true);
      setTimeout(() => { copyStates = new Map(copyStates).set(key, false); }, 2000);
    }
  }

  // ─── Step Derivations ───
  type StepStatus = 'pending' | 'running' | 'completed' | 'error';

  interface StepItem {
    toolCall: ToolCall;
    result: ToolResult | undefined;
    status: StepStatus;
    index: number;
    cleanName: string;
    service: string;
  }

  const steps = $derived(
    mcpToolCalls.map((tc, index): StepItem => {
      const result = resultMap.get(tc.tool_id);
      const status: StepStatus = result
        ? result.status === 'error' || result.output?.isError ? 'error' : 'completed'
        : ((tc.status as StepStatus) || 'pending');
      return {
        toolCall: tc,
        result,
        status,
        index,
        cleanName: cleanToolName(tc.tool_name),
        service: serviceLabel(tc.tool_name),
      };
    }),
  );

  // Group consecutive identical tool calls
  interface StepGroup {
    key: string;
    cleanName: string;
    service: string;
    category: ToolCategory;
    items: StepItem[];
    hasError: boolean;
    isActive: boolean;
    totalDuration: number;
  }

  const stepGroups = $derived.by((): StepGroup[] => {
    const groups: StepGroup[] = [];
    for (const step of steps) {
      const lastGroup = groups[groups.length - 1];
      if (lastGroup && lastGroup.cleanName === step.cleanName && lastGroup.service === step.service) {
        lastGroup.items.push(step);
        if (step.status === 'error') lastGroup.hasError = true;
        if (step.status === 'pending' || step.status === 'running') lastGroup.isActive = true;
        lastGroup.totalDuration += step.result?.duration_ms || 0;
      } else {
        groups.push({
          key: `${step.cleanName}_${step.index}`,
          cleanName: step.cleanName,
          service: step.service,
          category: toolCategory(step.toolCall.tool_name),
          items: [step],
          hasError: step.status === 'error',
          isActive: step.status === 'pending' || step.status === 'running',
          totalDuration: step.result?.duration_ms || 0,
        });
      }
    }
    return groups;
  });

  const anyActive = $derived(steps.some((s) => s.status === 'pending' || s.status === 'running'));
  const errorCount = $derived(steps.filter((s) => s.status === 'error').length);
  const totalDurationMs = $derived(steps.reduce((sum, s) => sum + (s.result?.duration_ms || 0), 0));

  const currentStep = $derived(
    anyActive
      ? [...steps].reverse().find((s) => s.status === 'pending' || s.status === 'running')
      : steps[steps.length - 1],
  );

  const summaryLabel = $derived.by(() => {
    if (steps.length === 0) return '';
    if (anyActive) return currentStep ? `${describeStep(currentStep.toolCall.tool_name, 'present')}…` : 'Executing tools…';
    const n = steps.length;
    const services = steps.map((s) => s.service).filter(Boolean);
    const joinedServices = humanJoin(services);
    let base: string;
    if (n === 1) {
      base = describeStep(steps[0].toolCall.tool_name, 'past');
    } else if (joinedServices) {
      base = `Used ${joinedServices} · ${n} ${n === 1 ? 'action' : 'actions'}`;
    } else {
      base = `Completed ${n} ${n === 1 ? 'action' : 'actions'}`;
    }
    return errorCount > 0 ? `${base} · ${errorCount} failed` : base;
  });

  let deckOpen = $state(false);
  let userManuallyToggled = false;

  $effect(() => { if (userManuallyToggled) return; deckOpen = anyActive; });

  function toggleDeck() { userManuallyToggled = true; deckOpen = !deckOpen; }

  let groupStartMs = 0;
  let groupElapsedMs = $state(0);

  $effect(() => {
    if (!anyActive) return;
    if (!groupStartMs) groupStartMs = Date.now();
    const id = setInterval(() => { groupElapsedMs = Date.now() - groupStartMs; }, 150);
    return () => clearInterval(id);
  });

  const durationDisplay = $derived.by(() => {
    if (anyActive) return groupElapsedMs > 0 ? formatDuration(groupElapsedMs) : '';
    return totalDurationMs > 0 ? formatDuration(totalDurationMs) : '';
  });
</script>

{#snippet serviceGlyph(service: string)}
  {#if service === 'Slack'}
    <svg class="service-ico" viewBox="0 0 24 24" fill="none">
      <path d="M6 15a2 2 0 1 1-2-2h2v2zm1 0a2 2 0 1 1 4 0v5a2 2 0 1 1-4 0v-5zm2-8a2 2 0 1 1 2 2H9V7zm0 1a2 2 0 1 1 0 4H4a2 2 0 1 1 0-4h5zm8 2a2 2 0 1 1 2 2h-2v-2zm-1 0a2 2 0 1 1-4 0V5a2 2 0 1 1 4 0v5zm-2 8a2 2 0 1 1-2-2h2v2zm0-1a2 2 0 1 1 0-4h5a2 2 0 1 1 0 4h-5z" fill="#4A154B"/>
    </svg>
  {:else if service === 'Gmail'}
    <svg class="service-ico" viewBox="0 0 24 24" fill="none">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" fill="#ea4335" opacity="0.15"/>
      <path d="M22 6l-10 7L2 6" stroke="#ea4335" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
      <rect x="2" y="4" width="20" height="16" rx="2" stroke="#ea4335" stroke-width="2"/>
    </svg>
  {:else if service === 'GitHub'}
    <svg class="service-ico" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
    </svg>
  {:else if service === 'Jira'}
    <svg class="service-ico" viewBox="0 0 24 24" fill="#0052cc">
      <path d="M11.53 2c0 2.4 1.97 4.35 4.39 4.35h1.78v1.74c0 2.4 1.97 4.35 4.39 4.35V2h-10.56zm-4.4 4.4c0 2.4 1.97 4.35 4.39 4.35h1.78v1.74c0 2.4 1.97 4.35 4.39 4.35V6.4H7.13zm-4.4 4.4c0 2.4 1.97 4.35 4.39 4.35h1.78v1.74c0 2.4 1.97 4.35 4.39 4.35V10.8H2.73z"/>
    </svg>
  {:else}
    <svg class="service-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
      <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polyline>
    </svg>
  {/if}
{/snippet}

{#if mcpToolCalls.length > 0}
  <div class="action-pill-wrapper">
    <!-- ═══ COMPACT ACTION PILL (Auto-width, sits naturally in message flow) ═══ -->
    <button
      type="button"
      class="action-pill"
      class:action-pill--active={anyActive}
      class:action-pill--open={deckOpen}
      onclick={toggleDeck}
      aria-expanded={deckOpen}
      aria-label={summaryLabel}
    >
      <!-- Status Icon -->
      <span class="pill-beacon">
        {#if anyActive}
          <span class="pulse-beacon"></span>
        {:else if errorCount > 0}
          <span class="dot-beacon dot-beacon--err">✕</span>
        {:else}
          <span class="dot-beacon dot-beacon--ok">✓</span>
        {/if}
      </span>

      <!-- Narrative Text -->
      <span class="pill-text">{summaryLabel}</span>

      <!-- Telemetry and Disclosure -->
      {#if durationDisplay}
        <span class="pill-time">{durationDisplay}</span>
      {/if}

      <svg class="pill-chevron" class:pill-chevron--open={deckOpen} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <polyline points="6 9 12 15 18 9"></polyline>
      </svg>
    </button>

    <!-- ═══ EXPANDED ACTION DRAWER (Tucked underneath with indentation) ═══ -->
    {#if deckOpen}
      <div class="action-drawer">
        <div class="drawer-rail">
          {#each stepGroups as group (group.key)}
            {@const isBatch = group.items.length > 1}
            {@const isGroupExpanded = expandedGroups.has(group.key)}

            {#if isBatch}
              <!-- Batch Group -->
              <div class="stepper-node">
                <button
                  type="button"
                  class="node-header"
                  onclick={() => toggleGroup(group.key)}
                  aria-expanded={isGroupExpanded}
                >
                  <span class="node-bullet"></span>

                  {#if group.service}
                    <span class="svc-tag">
                      {@render serviceGlyph(group.service)}
                      <span>{group.service}</span>
                    </span>
                  {/if}

                  <span class="node-title">{group.cleanName}</span>
                  <span class="count-tag">{group.items.length} calls</span>

                  <div class="node-end">
                    {#if group.totalDuration > 0}
                      <span class="node-time">{formatDuration(group.totalDuration)}</span>
                    {/if}
                    <svg class="node-chevron" class:node-chevron--open={isGroupExpanded} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </button>

                {#if isGroupExpanded}
                  <div class="sub-stepper">
                    {#each group.items as item, itemIdx (item.toolCall.tool_id)}
                      {@const isItemExpanded = expandedBlocks.has(item.toolCall.tool_id)}
                      {@const showRaw = rawJsonIds.has(item.toolCall.tool_id)}

                      <div class="sub-node">
                        <button
                          type="button"
                          class="sub-node-row"
                          onclick={() => toggleBlock(item.toolCall.tool_id)}
                          aria-expanded={isItemExpanded}
                        >
                          <span class="sub-branch">↳</span>
                          <span class="sub-idx">#{itemIdx + 1}</span>

                          {#if item.toolCall.input?.value}
                            {@const entries = Object.entries(item.toolCall.input.value)}
                            <div class="arg-row">
                              {#each entries.slice(0, 2) as [k, v]}
                                <span class="arg-pill">
                                  <span class="arg-pill__k">{k}:</span>
                                  <span class="arg-pill__v">{formatArgValue(v)}</span>
                                </span>
                              {/each}
                              {#if entries.length > 2}
                                <span class="arg-more">+{entries.length - 2}</span>
                              {/if}
                            </div>
                          {/if}

                          {#if item.result?.duration_ms}
                            <span class="node-time node-time--sub">{formatDuration(item.result.duration_ms)}</span>
                          {/if}
                        </button>

                        <!-- Sub-item Output Drawer -->
                        {#if isItemExpanded && item.result}
                          <div class="inspector-tray">
                            <div class="tray-toolbar">
                              <span class="tray-title">{item.cleanName}</span>
                              <div class="tray-actions">
                                <button type="button" class="mini-btn" class:mini-btn--on={showRaw} onclick={() => toggleRawJson(item.toolCall.tool_id)}>
                                  JSON
                                </button>
                                <button type="button" class="mini-btn" onclick={() => handleCopy(item.toolCall.tool_id, JSON.stringify({ input: item.toolCall.input?.value, output: item.result?.output }, null, 2))}>
                                  {#if copyStates.get(item.toolCall.tool_id)}✓ Copied{:else}Copy{/if}
                                </button>
                              </div>
                            </div>

                            {#if showRaw}
                              <pre class="code-box"><code>{JSON.stringify({ input: item.toolCall.input?.value, output: item.result.output }, null, 2)}</code></pre>
                            {:else if item.result.output?.content}
                              {#each item.result.output.content as content}
                                {#if content.type === 'text' && content.text}
                                  {@const parsed = tryParseJson(content.text)}
                                  {#if parsed?.type === 'object'}
                                    <div class="sheet">
                                      {#each Object.entries(parsed.data) as [k, val]}
                                        <div class="sheet-row">
                                          <span class="sheet-k">{k}</span>
                                          <span class="sheet-v">{formatValue(val)}</span>
                                        </div>
                                      {/each}
                                    </div>
                                  {:else}
                                    <pre class="code-box">{content.text}</pre>
                                  {/if}
                                {/if}
                              {/each}
                            {/if}
                          </div>
                        {/if}
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>

            {:else}
              <!-- Single Item -->
              {@const step = group.items[0]}
              {@const isExpanded = expandedBlocks.has(step.toolCall.tool_id)}
              {@const showRaw = rawJsonIds.has(step.toolCall.tool_id)}
              {@const searchQuery = tableSearchQueries[step.toolCall.tool_id] || ''}

              <div class="stepper-node">
                <button
                  type="button"
                  class="node-header"
                  onclick={() => toggleBlock(step.toolCall.tool_id)}
                  aria-expanded={isExpanded}
                >
                  <span class="node-bullet" class:node-bullet--run={step.status === 'pending' || step.status === 'running'} class:node-bullet--err={step.status === 'error'}></span>

                  {#if step.service}
                    <span class="svc-tag">
                      {@render serviceGlyph(step.service)}
                      <span>{step.service}</span>
                    </span>
                  {/if}

                  <span class="node-title">{step.cleanName}</span>

                  {#if step.toolCall.input?.value}
                    {@const entries = Object.entries(step.toolCall.input.value)}
                    <div class="arg-row">
                      {#each entries.slice(0, 3) as [k, v]}
                        <span class="arg-pill">
                          <span class="arg-pill__k">{k}:</span>
                          <span class="arg-pill__v">{formatArgValue(v)}</span>
                        </span>
                      {/each}
                      {#if entries.length > 3}
                        <span class="arg-more">+{entries.length - 3}</span>
                      {/if}
                    </div>
                  {/if}

                  <div class="node-end">
                    {#if step.result?.duration_ms}
                      <span class="node-time">{formatDuration(step.result.duration_ms)}</span>
                    {/if}
                    <svg class="node-chevron" class:node-chevron--open={isExpanded} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="6 9 12 15 18 9"></polyline>
                    </svg>
                  </div>
                </button>

                <!-- Streaming text -->
                {#if (step.status === 'pending' || step.status === 'running') && step.toolCall.input_text}
                  <div class="streaming-row">
                    <span class="streaming-dot"></span>
                    <code>{step.toolCall.input_text}</code>
                  </div>
                {/if}

                <!-- Output Inspector Drawer -->
                {#if isExpanded && step.result}
                  <div class="inspector-tray">
                    <div class="tray-toolbar">
                      <span class="tray-title">{step.cleanName}</span>
                      <div class="tray-actions">
                        <button type="button" class="mini-btn" class:mini-btn--on={showRaw} onclick={() => toggleRawJson(step.toolCall.tool_id)}>
                          JSON
                        </button>
                        <button type="button" class="mini-btn" onclick={() => handleCopy(step.toolCall.tool_id, JSON.stringify({ input: step.toolCall.input?.value, output: step.result?.output }, null, 2))}>
                          {#if copyStates.get(step.toolCall.tool_id)}✓ Copied{:else}Copy{/if}
                        </button>
                      </div>
                    </div>

                    {#if showRaw}
                      <pre class="code-box"><code>{JSON.stringify({ input: step.toolCall.input?.value, output: step.result.output }, null, 2)}</code></pre>
                    {:else}
                      <!-- Parameters -->
                      {#if step.toolCall.input?.value && Object.keys(step.toolCall.input.value).length > 0}
                        <div class="sheet">
                          <div class="sheet-title">PARAMETERS</div>
                          {#each Object.entries(step.toolCall.input.value) as [k, val]}
                            <div class="sheet-row">
                              <span class="sheet-k">{k}</span>
                              <span class="sheet-v">{formatValue(val)}</span>
                            </div>
                          {/each}
                        </div>
                      {/if}

                      <!-- Output Results -->
                      {#if step.result.output?.content}
                        {#each step.result.output.content as content}
                          {#if content.type === 'text' && content.text}
                            {@const parsed = tryParseJson(content.text)}

                            {#if parsed?.type === 'array-objects'}
                              {@const filteredData = filterTableRows(parsed.data, searchQuery)}
                              {@const headers = getTableHeaders(parsed.data)}

                              <div class="table-container">
                                <div class="table-head-bar">
                                  <span class="table-count">{filteredData.length} records</span>
                                  {#if parsed.data.length > 2}
                                    <input
                                      type="text"
                                      placeholder="Filter records…"
                                      value={searchQuery}
                                      oninput={(e) => { tableSearchQueries = { ...tableSearchQueries, [step.toolCall.tool_id]: (e.target as HTMLInputElement).value }; }}
                                      class="filter-inp"
                                    />
                                  {/if}
                                </div>
                                <div class="table-scroll">
                                  <table class="data-tbl">
                                    <thead>
                                      <tr>
                                        <th class="tbl-idx">#</th>
                                        {#each headers as h}<th>{formatKeyLabel(h)}</th>{/each}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {#each filteredData as row, rIdx}
                                        <tr>
                                          <td class="tbl-idx">{rIdx + 1}</td>
                                          {#each headers as h}
                                            {@const cellType = detectValueType(row[h])}
                                            <td title={formatValue(row[h])} class:num-cell={cellType === 'number'}>
                                              {#if cellType === 'url'}
                                                <a href={String(row[h])} target="_blank" rel="noopener noreferrer" class="tbl-link">
                                                  {truncateUrl(String(row[h]), 32)} ↗
                                                </a>
                                              {:else if cellType === 'email'}
                                                <a href={`mailto:${row[h]}`} class="tbl-link">{row[h]}</a>
                                              {:else if cellType === 'boolean'}
                                                <span class="tbl-tag" class:tbl-tag--yes={row[h]}>{row[h] ? 'Yes' : 'No'}</span>
                                              {:else if cellType === 'null'}
                                                <span class="tbl-null">—</span>
                                              {:else if cellType === 'date'}
                                                <span class="tbl-date">{formatDate(String(row[h]))}</span>
                                              {:else}
                                                {formatValue(row[h])}
                                              {/if}
                                            </td>
                                          {/each}
                                        </tr>
                                      {/each}
                                    </tbody>
                                  </table>
                                </div>
                              </div>

                            {:else if parsed?.type === 'object'}
                              <div class="sheet">
                                <div class="sheet-title">RESULT</div>
                                {#each Object.entries(parsed.data) as [k, val]}
                                  {@const vtype = detectValueType(val)}
                                  <div class="sheet-row">
                                    <span class="sheet-k">{k}</span>
                                    <span class="sheet-v">
                                      {#if vtype === 'url'}
                                        <a href={String(val)} target="_blank" rel="noopener noreferrer" class="tbl-link">{truncateUrl(String(val))} ↗</a>
                                      {:else if vtype === 'email'}
                                        <a href={`mailto:${val}`} class="tbl-link">{val}</a>
                                      {:else if vtype === 'boolean'}
                                        <span class="tbl-tag" class:tbl-tag--yes={val}>{val ? 'true' : 'false'}</span>
                                      {:else if vtype === 'null'}
                                        <span class="tbl-null">null</span>
                                      {:else}
                                        {formatValue(val)}
                                      {/if}
                                    </span>
                                  </div>
                                {/each}
                              </div>

                            {:else}
                              {#if hasMarkdown(content.text)}
                                <div class="prose-wrap">{@html renderMarkdown(content.text)}</div>
                              {:else}
                                <pre class="code-box">{content.text}</pre>
                              {/if}
                            {/if}

                          {:else if content.type === 'image' && content.data}
                            <div class="img-wrap">
                              <img src={`data:${content.mimeType || 'image/png'};base64,${content.data}`} alt="Result" />
                            </div>
                          {/if}
                        {/each}
                      {/if}

                      <!-- Error -->
                      {#if step.result.output?.isError}
                        <div class="error-strip">
                          <span class="error-strip__badge">FAILED</span>
                          <span class="error-strip__msg">{step.result.output.content?.[0]?.text || 'Execution error'}</span>
                        </div>
                      {/if}
                    {/if}
                  </div>
                {/if}
              </div>
            {/if}
          {/each}
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* ══════════════════════════════════════════════════════
     INNOVATIVE ACTION PILL (NO FULL-WIDTH ROW, NO AWKWARD BOX CARDS)
     Hugs content neatly like a floating badge.
     Seamlessly integrated into chat flow.
     ══════════════════════════════════════════════════════ */

  .action-pill-wrapper {
    display: inline-flex;
    flex-direction: column;
    align-items: flex-start;
    max-width: 100%;
    margin: 0.125rem 0 0.5rem;
  }

  /* ─── The Pill (Auto-width, sits like a chic badge) ─── */
  .action-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.4375rem;
    width: fit-content;
    max-width: 100%;
    padding: 0.3125rem 0.6875rem;
    border-radius: 9999px;
    border: none;
    background: rgba(0, 0, 0, 0.04);
    color: #334155;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.2;
    cursor: pointer;
    user-select: none;
    transition: all 0.15s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .action-pill:hover {
    background: rgba(0, 0, 0, 0.07);
    color: #0f172a;
    transform: translateY(-0.5px);
  }

  .action-pill--active {
    background: rgba(37, 99, 235, 0.08);
    color: #1d4ed8;
  }

  .action-pill--open {
    background: rgba(0, 0, 0, 0.08);
    color: #0f172a;
  }

  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .action-pill {
      background: rgba(255, 255, 255, 0.06);
      color: #94a3b8;
    }
    .action-pill:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f8fafc;
    }
    .action-pill--active {
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
    }
    .action-pill--open {
      background: rgba(255, 255, 255, 0.12);
      color: #f8fafc;
    }
  }

  :root[data-theme='dark'] .action-pill {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
  }
  :root[data-theme='dark'] .action-pill:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #f8fafc;
  }

  /* Beacon icon */
  .pill-beacon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .dot-beacon {
    font-size: 0.6875rem;
    font-weight: 700;
    line-height: 1;
  }
  .dot-beacon--ok { color: #10b981; }
  .dot-beacon--err { color: #ef4444; }

  .pulse-beacon {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #3b82f6;
    animation: beaconPulse 1.4s ease-in-out infinite;
  }

  @keyframes beaconPulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.4; transform: scale(0.85); }
  }

  .pill-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    letter-spacing: -0.01em;
  }

  .pill-time {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 0.6875rem;
    opacity: 0.6;
    font-variant-numeric: tabular-nums;
  }

  .pill-chevron {
    flex-shrink: 0;
    opacity: 0.5;
    transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  .pill-chevron--open {
    transform: rotate(180deg);
  }

  /* ═══ EXPANDED ACTION DRAWER ═══ */
  .action-drawer {
    display: flex;
    flex-direction: column;
    width: 100%;
    max-width: 620px;
    margin-top: 0.375rem;
    animation: expandFade 0.2s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes expandFade {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .drawer-rail {
    display: flex;
    flex-direction: column;
    padding-left: 0.75rem;
    margin-left: 0.5rem;
    border-left: 1.5px solid rgba(0, 0, 0, 0.08);
    gap: 0.25rem;
  }

  @media (prefers-color-scheme: dark) {
    .drawer-rail {
      border-left-color: rgba(255, 255, 255, 0.08);
    }
  }

  /* ─── Stepper Nodes ─── */
  .stepper-node {
    display: flex;
    flex-direction: column;
  }

  .node-header {
    display: flex;
    align-items: center;
    gap: 0.4375rem;
    width: 100%;
    padding: 0.3125rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: background 0.12s ease;
  }

  .node-header:hover {
    background: rgba(0, 0, 0, 0.035);
  }

  @media (prefers-color-scheme: dark) {
    .node-header:hover {
      background: rgba(255, 255, 255, 0.05);
    }
  }

  .node-bullet {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #10b981;
    flex-shrink: 0;
  }

  .node-bullet--run { background: #3b82f6; }
  .node-bullet--err { background: #ef4444; }

  /* Service Glyph */
  .svc-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.0625rem 0.3125rem;
    border-radius: 4px;
    background: rgba(0, 0, 0, 0.05);
    font-size: 0.625rem;
    font-weight: 600;
    letter-spacing: 0.02em;
    text-transform: uppercase;
    color: #475569;
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    .svc-tag {
      background: rgba(255, 255, 255, 0.08);
      color: #94a3b8;
    }
  }

  .service-ico {
    width: 10px;
    height: 10px;
    flex-shrink: 0;
  }

  .node-title {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 0.75rem;
    font-weight: 600;
    color: #0f172a;
    white-space: nowrap;
    flex-shrink: 0;
  }

  @media (prefers-color-scheme: dark) {
    .node-title {
      color: #f8fafc;
    }
  }

  .count-tag {
    font-size: 0.625rem;
    font-weight: 500;
    color: #64748b;
    background: rgba(0, 0, 0, 0.04);
    padding: 0.0625rem 0.25rem;
    border-radius: 3px;
  }

  .arg-row {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    overflow: hidden;
  }

  .arg-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 0.6875rem;
    background: rgba(0, 0, 0, 0.035);
    padding: 0.0625rem 0.25rem;
    border-radius: 3px;
    white-space: nowrap;
  }

  @media (prefers-color-scheme: dark) {
    .arg-pill {
      background: rgba(255, 255, 255, 0.05);
    }
  }

  .arg-pill__k { color: #0284c7; }
  .arg-pill__v { color: #b45309; max-width: 140px; overflow: hidden; text-overflow: ellipsis; }

  @media (prefers-color-scheme: dark) {
    .arg-pill__k { color: #38bdf8; }
    .arg-pill__v { color: #fbbf24; }
  }

  .arg-more {
    font-size: 0.625rem;
    color: #94a3b8;
  }

  .node-end {
    display: flex;
    align-items: center;
    gap: 0.3125rem;
    margin-left: auto;
    flex-shrink: 0;
  }

  .node-time {
    font-family: 'JetBrains Mono', 'SF Mono', monospace;
    font-size: 0.6875rem;
    color: #94a3b8;
    font-variant-numeric: tabular-nums;
  }

  .node-time--sub {
    margin-left: auto;
  }

  .node-chevron {
    color: #94a3b8;
    transition: transform 0.15s ease;
  }

  .node-chevron--open {
    transform: rotate(180deg);
  }

  /* Sub Stepper (for grouped batch calls) */
  .sub-stepper {
    display: flex;
    flex-direction: column;
    margin-left: 0.75rem;
    gap: 1px;
  }

  .sub-node-row {
    display: flex;
    align-items: center;
    gap: 0.3125rem;
    width: 100%;
    padding: 0.1875rem 0.375rem;
    background: transparent;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    text-align: left;
    transition: background 0.1s ease;
  }

  .sub-node-row:hover {
    background: rgba(0, 0, 0, 0.03);
  }

  .sub-branch {
    color: #94a3b8;
    font-size: 0.75rem;
    flex-shrink: 0;
  }

  .sub-idx {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.625rem;
    color: #94a3b8;
    flex-shrink: 0;
  }

  /* ─── Inspector Tray ─── */
  .inspector-tray {
    display: flex;
    flex-direction: column;
    margin: 0.25rem 0 0.375rem 1rem;
    padding: 0.4375rem 0.5rem;
    background: rgba(0, 0, 0, 0.025);
    border-radius: 6px;
    gap: 0.3125rem;
    animation: expandFade 0.15s ease;
  }

  @media (prefers-color-scheme: dark) {
    .inspector-tray {
      background: rgba(255, 255, 255, 0.035);
    }
  }

  .tray-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding-bottom: 0.1875rem;
  }

  .tray-title {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6875rem;
    font-weight: 600;
    color: #64748b;
  }

  .tray-actions {
    display: flex;
    gap: 0.25rem;
  }

  .mini-btn {
    padding: 0.0625rem 0.375rem;
    border-radius: 3px;
    border: none;
    background: rgba(0, 0, 0, 0.05);
    font-size: 0.625rem;
    font-weight: 500;
    color: #64748b;
    cursor: pointer;
    transition: all 0.1s ease;
  }

  .mini-btn:hover {
    color: #0f172a;
    background: rgba(0, 0, 0, 0.08);
  }

  .mini-btn--on {
    color: #2563eb;
    background: rgba(37, 99, 235, 0.12);
  }

  /* Property Sheet */
  .sheet {
    display: flex;
    flex-direction: column;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 4px;
    padding: 0.25rem 0.375rem;
    gap: 1px;
  }

  .sheet-title {
    font-size: 0.5625rem;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #94a3b8;
    margin-bottom: 0.125rem;
  }

  .sheet-row {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    font-size: 0.75rem;
    padding: 0.0625rem 0;
  }

  .sheet-k {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6875rem;
    color: #0284c7;
    min-width: 70px;
    flex-shrink: 0;
  }

  .sheet-v {
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.75rem;
    color: #0f172a;
    word-break: break-word;
    flex: 1;
    min-width: 0;
  }

  @media (prefers-color-scheme: dark) {
    .sheet-k { color: #38bdf8; }
    .sheet-v { color: #f8fafc; }
  }

  /* Data Table */
  .table-container {
    border-radius: 4px;
    overflow: hidden;
  }

  .table-head-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.1875rem 0.25rem;
  }

  .table-count {
    font-size: 0.625rem;
    color: #94a3b8;
  }

  .filter-inp {
    border: none;
    background: rgba(0, 0, 0, 0.05);
    font-size: 0.625rem;
    padding: 0.0625rem 0.3125rem;
    border-radius: 3px;
    outline: none;
    width: 90px;
    color: inherit;
  }

  .table-scroll {
    overflow-x: auto;
    max-height: 240px;
  }

  .data-tbl {
    border-collapse: collapse;
    width: 100%;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6875rem;
    text-align: left;
  }

  .data-tbl th, .data-tbl td {
    padding: 0.25rem 0.375rem;
    white-space: nowrap;
    max-width: 200px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .data-tbl th {
    position: sticky;
    top: 0;
    background: rgba(0, 0, 0, 0.04);
    font-size: 0.5625rem;
    font-weight: 700;
    text-transform: uppercase;
    color: #64748b;
  }

  .data-tbl td { color: #0f172a; }
  .data-tbl tbody tr:hover { background: rgba(0, 0, 0, 0.03); }

  @media (prefers-color-scheme: dark) {
    .data-tbl th { background: rgba(255, 255, 255, 0.06); color: #94a3b8; }
    .data-tbl td { color: #f8fafc; }
    .data-tbl tbody tr:hover { background: rgba(255, 255, 255, 0.04); }
  }

  .tbl-idx { width: 1.5rem; text-align: center; color: #94a3b8; }
  .num-cell { text-align: right; font-variant-numeric: tabular-nums; }
  .tbl-link { color: #2563eb; text-decoration: none; }
  .tbl-link:hover { text-decoration: underline; }
  .tbl-tag { font-size: 0.5625rem; padding: 0 0.1875rem; border-radius: 2px; background: rgba(0,0,0,0.05); }
  .tbl-tag--yes { color: #059669; }
  .tbl-null { color: #94a3b8; font-style: italic; }
  .tbl-date { color: #64748b; }

  /* Code box */
  .code-box {
    margin: 0;
    padding: 0.375rem;
    background: rgba(0, 0, 0, 0.03);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6875rem;
    line-height: 1.45;
    color: inherit;
    max-height: 220px;
    overflow: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  @media (prefers-color-scheme: dark) {
    .code-box { background: rgba(255, 255, 255, 0.04); }
  }

  .prose-wrap {
    padding: 0.375rem;
    font-size: 0.75rem;
    line-height: 1.5;
  }

  .img-wrap img {
    max-width: 100%;
    max-height: 280px;
    border-radius: 4px;
  }

  .streaming-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.1875rem 0.5rem 0.1875rem 1.25rem;
    font-family: 'JetBrains Mono', monospace;
    font-size: 0.6875rem;
    color: #64748b;
  }

  .streaming-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: #3b82f6;
    animation: beaconPulse 0.9s infinite;
  }

  .error-strip {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.375rem;
    border-radius: 4px;
    background: rgba(239, 68, 68, 0.08);
    font-size: 0.6875rem;
  }

  .error-strip__badge { font-weight: 700; color: #ef4444; }
  .error-strip__msg { color: #64748b; }
</style>
