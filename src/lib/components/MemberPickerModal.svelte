<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  Shared "Add Members" people picker (organization.html .am-modal): a
  searchable, infinitely-scrolling list of users with multi-select. The caller
  owns what "add" means through `onsubmit`; this component only collects the
  selection. Used by department member management and project members.
-->
<script lang="ts">
  import type { Snippet } from "svelte";
  import { tick, untrack } from "svelte";
  import { _ } from "svelte-i18n";
  import Modal from "$lib/admin/components/Modal.svelte";
  import { getUsers } from "../api/admin/users";
  import type { User } from "../admin/types";
  import { ApiError } from "../api/client";
  import { getLocalizedError } from "../utils/errorLocalization";
  import { toast } from "./Toaster.svelte";

  interface Props {
    isOpen: boolean;
    title: string;
    subtitle?: string;
    onclose: () => void;
    /** Receives the selected users; the caller decides whether to close. */
    onsubmit: (users: User[]) => Promise<void>;
    /** Users already in the target — shown, but not selectable. */
    existingIds?: ReadonlySet<string>;
    /** Extra field above the search bar (e.g. the project role picker). */
    beforeSearch?: Snippet;
  }

  let {
    isOpen,
    title,
    subtitle,
    onclose,
    onsubmit,
    existingIds,
    beforeSearch,
  }: Props = $props();

  const PAGE_SIZE = 25;
  const AVATAR_COLORS = [
    "#C96A4E",
    "#5B7FC4",
    "#8A5FB0",
    "#4A9C86",
    "#C9657F",
    "#C9A24E",
  ];

  let query = $state("");
  let users = $state<User[]>([]);
  let total = $state(0);
  let loading = $state(false);
  let submitting = $state(false);
  let selected = $state<Map<string, User>>(new Map());
  let searchInput = $state<HTMLInputElement | null>(null);
  let sentinel = $state<HTMLDivElement | null>(null);

  /** Bumped on every fresh search so stale responses are dropped. */
  let requestSeq = 0;
  let searchTimeout: ReturnType<typeof setTimeout> | undefined;

  let hasMore = $derived(users.length < total);
  let count = $derived(selected.size);

  async function load(reset: boolean) {
    const seq = reset ? ++requestSeq : requestSeq;
    loading = true;
    try {
      const response = await getUsers({
        limit: PAGE_SIZE,
        offset: reset ? 0 : users.length,
        search: query.trim() || undefined,
      });
      if (seq !== requestSeq) return;
      users = reset ? response.users : [...users, ...response.users];
      total = response.total;
    } catch (error) {
      if (seq !== requestSeq) return;
      toast.error(
        error instanceof ApiError
          ? getLocalizedError(error, "description", $_)
          : $_("common.addMembers.loadError"),
      );
    } finally {
      if (seq === requestSeq) loading = false;
    }
  }

  // Fresh state every time the dialog opens.
  $effect(() => {
    if (!isOpen) return;
    untrack(() => {
      query = "";
      users = [];
      total = 0;
      selected = new Map();
      load(true);
    });
    // Modal focuses its backdrop after a tick; take focus after that.
    tick().then(() => setTimeout(() => searchInput?.focus(), 0));
    return () => {
      requestSeq++;
      if (searchTimeout) clearTimeout(searchTimeout);
    };
  });

  function handleSearchInput() {
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => load(true), 300);
  }

  // Infinite scroll: fetch the next page when the end of the list shows.
  // Re-armed after each page so a still-visible sentinel fetches again.
  $effect(() => {
    users.length;
    if (!sentinel) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries[0]?.isIntersecting && hasMore && !loading) load(false);
    });
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  function isExisting(user: User) {
    return existingIds?.has(user.id) ?? false;
  }

  function toggle(user: User) {
    if (isExisting(user) || submitting) return;
    const next = new Map(selected);
    if (next.has(user.id)) next.delete(user.id);
    else next.set(user.id, user);
    selected = next;
  }

  function handleRowKeydown(event: KeyboardEvent, user: User) {
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      toggle(user);
    }
  }

  function initials(user: User): string {
    const source = user.name?.trim() || user.email;
    if (!source) return "?";
    const parts = source.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return source.substring(0, 2).toUpperCase();
  }

  function avatarColor(id: string): string {
    let hash = 0;
    for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  }

  async function handleSubmit() {
    if (!count || submitting) return;
    submitting = true;
    try {
      await onsubmit(Array.from(selected.values()));
    } finally {
      submitting = false;
    }
  }
</script>

<Modal {isOpen} {title} {subtitle} {onclose} variant="add-members">
  {#snippet headerExtra()}
    {#if beforeSearch}
      <div class="am-before-search">{@render beforeSearch()}</div>
    {/if}
    <label class="am-search">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="7.3" cy="7.3" r="4.8" stroke="currentColor" stroke-width="1.5" />
        <path d="M10.8 10.8L14 14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
      </svg>
      <input
        type="text"
        bind:this={searchInput}
        bind:value={query}
        oninput={handleSearchInput}
        placeholder={$_("common.addMembers.searchPlaceholder")}
        aria-label={$_("common.addMembers.searchPlaceholder")}
        autocomplete="off"
      />
    </label>
  {/snippet}

  {#snippet children()}
    <div class="am-cols" aria-hidden="true">
      <span class="am-col-sel"></span>
      <span class="am-col-name">{$_("common.addMembers.columnName")}</span>
      <span class="am-col-email">{$_("common.addMembers.columnEmail")}</span>
    </div>

    {#each users as user (user.id)}
      {@const existing = isExisting(user)}
      {@const isSel = selected.has(user.id)}
      <div
        class="am-row"
        class:is-sel={isSel}
        class:is-existing={existing}
        role="checkbox"
        aria-label={user.name ? `${user.name} (${user.email})` : user.email}
        aria-checked={existing || isSel}
        aria-disabled={existing}
        tabindex={existing ? -1 : 0}
        onclick={() => toggle(user)}
        onkeydown={(e) => handleRowKeydown(e, user)}
      >
        <div class="am-selcol">
          <div class="am-cb">
            <svg width="11" height="11" viewBox="0 0 11 11" fill="none" aria-hidden="true">
              <path d="M2 5.7l2.3 2.3L9 3" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </div>
        </div>
        <div class="am-person">
          <div class="am-av" style:background={avatarColor(user.id)} aria-hidden="true">
            {initials(user)}
          </div>
          <span class="am-name">{user.name || user.email}</span>
          {#if existing}
            <span class="am-tag">{$_("common.addMembers.alreadyMember")}</span>
          {/if}
        </div>
        <span class="am-email" title={user.email}>{user.email}</span>
      </div>
    {/each}

    {#if loading}
      <div class="am-empty">{$_("common.addMembers.loading")}</div>
    {:else if users.length === 0}
      <div class="am-empty">
        {query.trim()
          ? $_("common.addMembers.noMatch", { values: { query: query.trim() } })
          : $_("common.addMembers.empty")}
      </div>
    {/if}
    <div bind:this={sentinel} class="am-sentinel" aria-hidden="true"></div>
  {/snippet}

  {#snippet footer()}
    <span class="am-count" aria-live="polite">
      {$_("common.addMembers.selected", { values: { count } })}
    </span>
    <div class="am-actions">
      <button class="am-btn am-btn--ghost" type="button" onclick={onclose} disabled={submitting}>
        {$_("common.cancel")}
      </button>
      <button
        class="am-btn am-btn--primary"
        type="button"
        onclick={handleSubmit}
        disabled={!count || submitting}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
          <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
        {#if submitting}
          {$_("common.addMembers.adding")}
        {:else if count}
          {$_("common.addMembers.submit", { values: { count } })}
        {:else}
          {$_("common.addMembers.submitNone")}
        {/if}
      </button>
    </div>
  {/snippet}
</Modal>

<style>
  .am-before-search {
    margin-bottom: 14px;
  }

  .am-search {
    height: 42px;
    box-sizing: border-box;
    border-radius: 12px;
    box-shadow: inset 0 0 0 1.5px var(--gx-hair);
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 0 14px;
    color: var(--gx-slate-400);
    background: var(--gx-card);
  }

  .am-search:focus-within {
    box-shadow: inset 0 0 0 1.5px var(--gx-org-brand);
  }

  .am-search svg {
    flex-shrink: 0;
  }

  /* Doubled class: app.css styles bare text inputs (height, padding, radius,
     shadow) and would otherwise box the field inside the search pill. */
  .am-search.am-search input {
    flex: 1;
    min-width: 0;
    height: auto;
    padding: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
    outline: 0;
    background: transparent;
    font: 400 14px/20px var(--gx-font);
    color: var(--gx-org-ink);
  }

  .am-search input::placeholder {
    color: var(--gx-slate-400);
  }

  .am-cols {
    display: flex;
    padding: 0 0 10px;
    border-bottom: 1px solid var(--gx-hair);
    position: sticky;
    top: 0;
    background: var(--gx-card);
    z-index: 1;
  }

  .am-cols span {
    font-weight: 700;
    font-size: 11px;
    line-height: 16px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--gx-slate-400);
  }

  .am-col-sel,
  .am-selcol {
    width: 40px;
    flex-shrink: 0;
  }

  .am-col-name,
  .am-person {
    flex: 0 1 292px;
    min-width: 0;
  }

  .am-col-email {
    flex: 1;
  }

  .am-row {
    display: flex;
    align-items: center;
    height: 58px;
    padding: 12px 0;
    box-sizing: border-box;
    border-bottom: 1px solid var(--gx-hair);
    background: var(--gx-card);
    cursor: pointer;
    outline: none;
  }

  .am-row:hover {
    background: var(--gx-org-row-hover);
  }

  .am-row.is-sel {
    background: var(--gx-org-sel);
  }

  .am-row:focus-visible {
    box-shadow: inset 0 0 0 2px var(--gx-org-brand);
  }

  .am-row.is-existing {
    cursor: default;
    background: var(--gx-card);
  }

  .am-row.is-existing .am-person,
  .am-row.is-existing .am-email {
    opacity: 0.6;
  }

  .am-selcol {
    display: flex;
    align-items: center;
  }

  .am-cb {
    width: 19px;
    height: 19px;
    border-radius: 6px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-hair-strong);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .am-row.is-sel .am-cb,
  .am-row.is-existing .am-cb {
    background: var(--gx-org-brand);
    box-shadow: inset 0 0 0 1.5px var(--gx-org-brand);
  }

  .am-row.is-existing .am-cb {
    opacity: 0.45;
  }

  .am-cb svg {
    display: none;
  }

  .am-row.is-sel .am-cb svg,
  .am-row.is-existing .am-cb svg {
    display: block;
  }

  .am-person {
    display: flex;
    align-items: center;
    gap: 11px;
    padding-inline-end: 12px;
  }

  .am-av {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    font-size: 12.5px;
    color: #fff;
    flex-shrink: 0;
  }

  .am-name {
    font-weight: 600;
    font-size: 14px;
    color: var(--gx-org-ink);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .am-tag {
    flex-shrink: 0;
    border-radius: 999px;
    background: var(--gx-hover-soft);
    padding: 2px 8px;
    font-weight: 700;
    font-size: 10.5px;
    line-height: 14px;
    letter-spacing: 0.03em;
    text-transform: uppercase;
    color: var(--gx-slate-500);
  }

  .am-email {
    flex: 1;
    min-width: 0;
    font-size: 13px;
    color: var(--gx-slate-500);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .am-empty {
    padding: 28px 0;
    text-align: center;
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  .am-sentinel {
    height: 1px;
  }

  .am-count {
    font-size: 13px;
    color: var(--gx-slate-500);
  }

  .am-actions {
    display: flex;
    justify-content: flex-end;
    gap: 14px;
  }

  .am-btn {
    height: 40px;
    box-sizing: border-box;
    border-radius: 10px;
    padding: 10px 18px;
    display: flex;
    align-items: center;
    gap: 7px;
    font: 700 14px/20px var(--gx-font);
    border: 0;
    cursor: pointer;
    transition: background-color 120ms ease;
  }

  .am-btn--ghost {
    background: var(--gx-card);
    color: var(--gx-org-ink);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
  }

  .am-btn--ghost:hover:not(:disabled) {
    background: var(--gx-hover-soft);
  }

  .am-btn--primary {
    background: var(--gx-org-brand);
    color: #fff;
    box-shadow: inset 0 0 0 1px var(--gx-org-brand);
  }

  .am-btn--primary:hover:not(:disabled) {
    background: var(--gx-org-brand-hover);
  }

  .am-btn:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .am-btn:focus-visible {
    outline: 2px solid var(--gx-org-brand);
    outline-offset: 2px;
  }

  @media (max-width: 520px) {
    .am-col-email,
    .am-email {
      display: none;
    }

    .am-col-name,
    .am-person {
      flex: 1;
    }
  }
</style>
