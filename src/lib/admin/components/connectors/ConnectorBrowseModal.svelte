<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0

Browse connectors (ENGG-511). The catalog picker, mirroring the AI Engines
"Browse Providers" dialog (.bp-modal): the published connector catalog grouped
by category, searchable, with a "+" to connect each one. This is the ONLY place
the full catalog is shown (from the MCP Servers page).
-->
<script lang="ts">
  import Modal from '$lib/admin/components/Modal.svelte';
  import ConnectorCard from '$lib/admin/components/connectors/ConnectorCard.svelte';
  import { toast } from '$lib/components/Toaster.svelte';
  import { _ } from 'svelte-i18n';
  import {
    type ConnectorCatalogEntry,
    type ConnectorCategory,
  } from '$lib/api/admin/connectors.js';

  interface Props {
    isOpen: boolean;
    /** The whole catalog — discovery shows volume (connected ones get a green light). */
    entries: ConnectorCatalogEntry[];
    categories: ConnectorCategory[];
    /** Keys the user has already connected (shown with a green light, no Connect). */
    connectedKeys?: Set<string>;
    /** Keys an admin has added; the rest show Add instead of Connect. */
    addedKeys?: Set<string>;
    connectingKey?: string | null;
    addingKey?: string | null;
    onConnect: (key: string) => void | Promise<void>;
    onAdd?: (key: string) => void | Promise<void>;
    onOpen?: (key: string) => void;
    /** "Add your own server" in the footer section. */
    onAddServer?: () => void;
  }
  let {
    isOpen = $bindable(),
    entries,
    categories,
    connectedKeys = new Set(),
    addedKeys,
    connectingKey = null,
    addingKey = null,
    onConnect,
    onAdd,
    onOpen,
    onAddServer,
  }: Props = $props();

  const PREVIEW = 6;

  let query = $state('');
  let category = $state('all');
  let expanded = $state<Record<string, boolean>>({});

  const labelOf = $derived.by(() => {
    const m = new Map<string, string>();
    for (const c of categories) m.set(c.id, c.label);
    return m;
  });
  /** Translated label for known category ids; the catalog's own label otherwise. */
  function categoryLabel(id: string): string {
    const key = `admin.connectors.categories.${id}`;
    const translated = $_(key);
    return translated !== key ? translated : (labelOf.get(id) ?? id);
  }

  function matches(c: ConnectorCatalogEntry, q: string): boolean {
    if (!q) return true;
    const n = q.toLowerCase();
    return (
      c.display_name.toLowerCase().includes(n) ||
      c.job.toLowerCase().includes(n) ||
      c.description.toLowerCase().includes(n) ||
      c.keywords.some((k) => k.toLowerCase().includes(n))
    );
  }

  const byKey = $derived(new Map(entries.map((c) => [c.key, c])));

  function membersOf(c: ConnectorCatalogEntry): ConnectorCatalogEntry[] {
    return (c.members ?? []).map((key) => byKey.get(key)).filter((m): m is ConnectorCatalogEntry => !!m);
  }

  /** A suite matches when it, or any app it combines, matches the search and category. */
  const filtered = $derived.by(() => {
    const q = query.trim();
    return entries.filter((c) =>
      [c, ...membersOf(c)].some((e) => matches(e, q) && (category === 'all' || e.category === category)),
    );
  });

  /** Suites (one sign-in for several apps of one provider) are shown first. */
  const suites = $derived(filtered.filter((c) => c.members?.length));

  /** Category tabs, in catalog order (connectors.html `.cat-row`: always all of them). */
  const tabs = $derived(categories.map((c) => c.id));

  /** Matching entries grouped by category, in catalog order. */
  const groups = $derived.by(() => {
    const buckets = new Map<string, ConnectorCatalogEntry[]>();
    for (const c of filtered.filter((entry) => !entry.members?.length)) {
      const arr = buckets.get(c.category) ?? [];
      arr.push(c);
      buckets.set(c.category, arr);
    }
    return categories
      .map((c) => c.id)
      .filter((id) => buckets.has(id))
      .map((id) => ({ key: id, entries: buckets.get(id) as ConnectorCatalogEntry[] }));
  });

  function toggle(key: string) {
    expanded = { ...expanded, [key]: !expanded[key] };
  }
</script>

<Modal
  bind:isOpen
  variant="ai-browse"
  title={$_("admin.connectors.browse")}
  subtitle={$_("admin.connectors.count", { values: { count: entries.length } })}
  onclose={() => (isOpen = false)}
>
  {#snippet headerIcon()}
    <span class="bp-icon">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 15l6-6M10.5 6.5l1.2-1.2a3.6 3.6 0 0 1 5.1 5.1l-1.2 1.2M13.5 17.5l-1.2 1.2a3.6 3.6 0 0 1-5.1-5.1l1.2-1.2"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </svg>
    </span>
  {/snippet}

  {#snippet headerExtra()}
    <div class="bp-search">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7" cy="7" r="4.5" stroke="currentColor" stroke-width="1.3" />
        <path d="m13 13-2.5-2.5" stroke="currentColor" stroke-width="1.3" />
      </svg>
      <input
        type="text"
        bind:value={query}
        placeholder={$_("admin.connectors.searchPlaceholder")}
        aria-label={$_("admin.connectors.searchLabel")}
      />
    </div>
  {/snippet}

  {#snippet children()}
    {#if entries.length === 0}
      <p class="bp-empty">{$_("admin.connectors.allConnected")}</p>
    {:else}
      <div class="bp-tabs" role="group" aria-label={$_("admin.connectors.categoryLabel")}>
        <button
          class="bp-tab"
          type="button"
          aria-pressed={category === 'all'}
          onclick={() => (category = 'all')}
        >
          {$_("admin.connectors.allTools")}
        </button>
        {#each tabs as key (key)}
          <button
            class="bp-tab"
            type="button"
            aria-pressed={category === key}
            onclick={() => (category = key)}
          >
            {categoryLabel(key)}
          </button>
        {/each}
      </div>

      <span class="bp-results-count">
        {$_("admin.connectors.showing", { values: { shown: filtered.length, total: entries.length } })}
      </span>

      {#if filtered.length === 0}
        <p class="bp-empty">{$_("admin.connectors.noMatch", { values: { query: query.trim() } })}</p>
      {:else}
        <div class="bp-groups">
          {#if suites.length}
            <div class="bp-group">
              <div class="bp-group-heading">
                <span class="bp-category">{$_("admin.connectors.suites")}</span>
                <span class="bp-count">{suites.length}</span>
              </div>
              <p class="bp-suites-sub">{$_("admin.connectors.suitesSub")}</p>
              <div class="bp-cards">
                {#each suites as c (c.key)}
                  <ConnectorCard
                    entry={c}
                    connected={connectedKeys.has(c.key)}
                    connecting={connectingKey === c.key}
                    added={addedKeys ? addedKeys.has(c.key) : true}
                    adding={addingKey === c.key}
                    categoryLabel={categoryLabel(c.category)}
                    members={membersOf(c).map((m) => ({ key: m.key, name: m.display_name, icon: m.icon }))}
                    onOpen={() => onOpen?.(c.key)}
                    onConnect={() => onConnect(c.key)}
                    onAdd={() => onAdd?.(c.key)}
                  />
                {/each}
              </div>
            </div>
          {/if}
          {#each groups as group (group.key)}
            {@const isOpen2 = !!expanded[group.key]}
            {@const shown = isOpen2 ? group.entries : group.entries.slice(0, PREVIEW)}
            {@const hidden = group.entries.length - shown.length}
            <div class="bp-group">
              <div class="bp-group-heading">
                <span class="bp-category">{categoryLabel(group.key)}</span>
                <span class="bp-count">{group.entries.length}</span>
              </div>
              <div class="bp-cards">
                {#each shown as c (c.key)}
                  <ConnectorCard
                    entry={c}
                    connected={connectedKeys.has(c.key)}
                    connecting={connectingKey === c.key}
                    added={addedKeys ? addedKeys.has(c.key) : true}
                    adding={addingKey === c.key}
                    categoryLabel={categoryLabel(c.category)}
                    onOpen={() => onOpen?.(c.key)}
                    onConnect={() => onConnect(c.key)}
                    onAdd={() => onAdd?.(c.key)}
                  />
                {/each}
              </div>
              {#if hidden > 0 || isOpen2}
                <button class="bp-show-more" type="button" onclick={() => toggle(group.key)}>
                  {isOpen2
                    ? $_("admin.connectors.showLess")
                    : $_("admin.connectors.showMore", { values: { count: hidden } })}
                </button>
              {/if}
            </div>
          {/each}
        </div>
      {/if}
    {/if}

    <section class="bp-else">
      <div>
        <div class="bp-else-title">{$_("admin.connectors.elseTitle")}</div>
        <div class="bp-else-sub">{$_("admin.connectors.elseSub")}</div>
      </div>
      <div class="bp-else-actions">
        <button
          class="bp-link"
          type="button"
          onclick={() => toast.success($_("admin.connectors.requestThanks"))}
        >
          {$_("admin.connectors.requestTool")}
        </button>
        <button class="bp-add-own" type="button" onclick={() => onAddServer?.()}>
          {$_("admin.connectors.addOwnServer")}
        </button>
      </div>
    </section>
  {/snippet}
</Modal>

<style>
  .bp-suites-sub {
    margin: -4px 0 12px;
    font-size: 13px;
    color: var(--gx-muted);
  }
  .bp-icon {
    width: 40px;
    height: 40px;
    border-radius: 10px;
    background: var(--gx-org-primary-500);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #fff;
    flex-shrink: 0;
  }
  .bp-icon svg { display: block; }

  .bp-search {
    height: 42px;
    border-radius: 8px;
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    gap: 10px;
    padding: 0 14px;
    align-items: center;
    color: var(--gx-an-sub);
    box-sizing: border-box;
  }
  .bp-search:focus-within { box-shadow: inset 0 0 0 1px var(--gx-org-primary-500); }
  .bp-search svg { display: block; flex-shrink: 0; }
  .bp-search input {
    flex-grow: 1;
    min-width: 0;
    border: 0;
    outline: 0;
    padding: 0;
    border-radius: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    background: transparent;
    font-size: 14px;
    color: var(--gx-slate-900);
  }
  .bp-search input:focus {
    box-shadow: none;
    background: transparent;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .bp-search input::placeholder { color: var(--gx-an-sub); opacity: 1; }

  /* Category tabs — connectors.html `.cat-row` / `.chip`. Explicit box values
     override app.css's global <button> pill styles. */
  .bp-tabs { display: flex; gap: 8px; flex-wrap: wrap; }
  .bp-tab {
    height: 32px;
    border-radius: 20px;
    padding: 7px 14px;
    box-sizing: border-box;
    display: inline-flex;
    align-items: center;
    background: #fff;
    border: 1px solid rgb(222, 225, 230);
    box-shadow: none;
    font-family: var(--gx-font);
    font-weight: 500;
    font-size: 13px;
    line-height: 100%;
    color: rgb(27, 30, 36);
    white-space: nowrap;
    cursor: pointer;
    transition: background-color 120ms ease;
  }
  .bp-tab:hover { background: rgb(247, 248, 250); }
  .bp-tab[aria-pressed='true'] {
    background: rgb(27, 30, 36);
    border-color: rgb(27, 30, 36);
    color: #fff;
    font-weight: 600;
  }
  .bp-tab:focus-visible { outline: 2px solid rgb(66, 122, 198); outline-offset: 2px; }

  .bp-results-count { font-weight: 400; font-size: 12px; line-height: 100%; color: var(--gx-an-sub); }
  .bp-empty { margin: 0; font-size: 13px; line-height: 1.5; color: var(--gx-an-sub); }

  .bp-groups { display: flex; flex-direction: column; gap: 22px; }
  .bp-group-heading { display: flex; gap: 7px; align-items: center; }
  .bp-category {
    font-weight: 700;
    font-size: 12px;
    line-height: 100%;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--gx-an-sub);
  }
  .bp-count { font-weight: 400; font-size: 12px; line-height: 100%; color: var(--gx-an-sub); }

  .bp-cards {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 14px;
    margin-top: 10px;
  }
  .bp-show-more {
    display: block;
    margin-top: 10px;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    color: var(--gx-org-primary-500);
    background: none;
    border: 0;
    cursor: pointer;
  }
  .bp-show-more:hover { text-decoration: underline; }
  .bp-show-more:focus-visible { outline: 2px solid var(--gx-org-primary-500); outline-offset: 2px; }

  .bp-else {
    border-radius: 14px;
    background: var(--gx-card);
    border: 1px dashed var(--gx-hair);
    display: flex;
    padding: 20px 24px;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
  }
  .bp-else-title {
    font-weight: 700;
    font-size: 14.5px;
    line-height: 21px;
    color: var(--gx-slate-900);
  }
  .bp-else-sub {
    font-weight: 400;
    font-size: 13px;
    line-height: 18.85px;
    color: var(--gx-an-sub);
    max-width: 620px;
    margin-top: 2px;
  }
  .bp-else-actions { display: flex; gap: 14px; align-items: center; flex-shrink: 0; }
  .bp-link {
    font-weight: 600;
    font-size: 14px;
    line-height: 20px;
    color: var(--gx-org-primary-500);
    background: none;
    border: 0;
    padding: 0;
    cursor: pointer;
  }
  .bp-link:hover { text-decoration: underline; }
  .bp-add-own {
    height: 38px;
    border-radius: 10px;
    padding: 0 16px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 13px;
    line-height: 100%;
    white-space: nowrap;
    cursor: pointer;
    flex-shrink: 0;
    background: color-mix(in oklch, var(--gx-org-primary-500) 8%, var(--gx-card));
    border: 1px solid color-mix(in oklch, var(--gx-org-primary-500) 40%, var(--gx-card));
    color: var(--gx-org-primary-500);
    transition: background-color 120ms ease;
  }
  .bp-add-own:hover { background: color-mix(in oklch, var(--gx-org-primary-500) 14%, var(--gx-card)); }
  .bp-link:focus-visible,
  .bp-add-own:focus-visible { outline: 2px solid var(--gx-org-primary-500); outline-offset: 2px; }

  @media (max-width: 1000px) {
    .bp-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  }
  @media (max-width: 768px) {
    .bp-cards { grid-template-columns: minmax(0, 1fr); }
    .bp-else { flex-direction: column; align-items: flex-start; }
  }
</style>
