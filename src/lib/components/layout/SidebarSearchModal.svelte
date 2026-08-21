<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { navigate } from "svelte-routing";
  import { _ } from "svelte-i18n";
  import { tick } from "svelte";
  import { listConversations } from "../../api/chatApi.js";
  import { listProjects } from "../../api/projectsApi";

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  type SearchResult = {
    id: string;
    type: "chat" | "project";
    title: string;
    group: string;
  };

  let query = $state("");
  let inputEl = $state<HTMLInputElement | null>(null);
  let listEl = $state<HTMLElement | null>(null);
  let items = $state<SearchResult[]>([]);
  let loading = $state(false);
  let activeIndex = $state(0);
  let projectsCache: any[] = [];

  function relativeLabel(ts?: string): string {
    if (!ts) return $_("sidebar.older");
    const t = new Date(ts).getTime();
    if (Number.isNaN(t)) return $_("sidebar.older");
    const diff = Date.now() - t;
    const day = 86_400_000;
    if (diff < day) return $_("sidebar.today");
    if (diff < 2 * day) return $_("sidebar.yesterday");
    if (diff < 7 * day) return $_("sidebar.pastWeek");
    if (diff < 30 * day) return $_("sidebar.pastMonth");
    if (diff < 365 * day) return $_("sidebar.pastYear");
    return $_("sidebar.older");
  }

  async function runSearch() {
    loading = true;
    try {
      const q = query.trim();
      const [convRes, projRes] = await Promise.all([
        listConversations({ offset: 0, limit: 25, search: q }),
        projectsCache.length
          ? Promise.resolve({ projects: projectsCache })
          : listProjects(),
      ]);

      projectsCache = (projRes as any)?.projects ?? [];

      const rawChats = Array.isArray(convRes)
        ? convRes
        : ((convRes as any)?.conversations ?? []);
      const chats: SearchResult[] = rawChats.map((c: any) => ({
        id: c.id,
        type: "chat",
        title: c.title || $_("sidebar.untitledChat"),
        group: relativeLabel(c.last_message_at || c.created_at),
      }));

      const ql = q.toLowerCase();
      const projects: SearchResult[] = projectsCache
        .filter((p: any) => !ql || (p.name || "").toLowerCase().includes(ql))
        .map((p: any) => ({
          id: p.id,
          type: "project",
          title: p.name,
          group: relativeLabel(p.updated_at || p.created_at),
        }));

      const merged = [...chats, ...projects];

      // With a query, order by where the match occurs (earliest match first).
      // The server search also matches on message bodies, so a title with no
      // literal hit must sort last rather than first (indexOf returns -1).
      const matchAt = (title: string) => {
        const i = title.toLowerCase().indexOf(ql);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      };
      items = ql
        ? merged.sort((a, b) => matchAt(a.title) - matchAt(b.title))
        : merged;

      activeIndex = 0;
    } catch {
      items = [];
    } finally {
      loading = false;
    }
  }

  // Debounced search whenever the query changes while the modal is open.
  $effect(() => {
    if (!open) return;
    query;
    const id = setTimeout(runSearch, 180);
    return () => clearTimeout(id);
  });

  // Reset + focus on open, and lock background scroll while the dialog is up.
  $effect(() => {
    if (!open) return;
    query = "";
    items = [];
    activeIndex = 0;
    tick().then(() => inputEl?.focus());

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  });

  // Split a title into plain/highlighted segments so the match can be bolded
  // without injecting raw HTML.
  function highlightParts(title: string, q: string) {
    if (!q) return [{ text: title, mark: false }];
    const i = title.toLowerCase().indexOf(q.toLowerCase());
    if (i === -1) return [{ text: title, mark: false }];
    return [
      { text: title.slice(0, i), mark: false },
      { text: title.slice(i, i + q.length), mark: true },
      { text: title.slice(i + q.length), mark: false },
    ].filter((part) => part.text);
  }

  // The design draws its own 4px scrollbar instead of the native one, so the
  // thumb geometry is mirrored from the results element on every scroll.
  let thumbHeight = $state(0);
  let thumbTop = $state(0);
  let thumbVisible = $state(false);

  function syncThumb() {
    const el = listEl;
    if (!el) return;
    const track = el.clientHeight - 16;
    const maxScroll = el.scrollHeight - el.clientHeight;
    thumbVisible = maxScroll > 1 && track > 0;
    if (!thumbVisible) return;
    const ratio = el.clientHeight / el.scrollHeight;
    const h = Math.max(40, Math.round(track * Math.min(ratio, 1)));
    thumbHeight = h;
    thumbTop = Math.round((el.scrollTop / maxScroll) * (track - h));
  }

  // Re-measure whenever the rendered list changes.
  $effect(() => {
    items;
    loading;
    tick().then(syncThumb);
  });

  function setActive(index: number, scroll = false) {
    if (!items.length) return;
    activeIndex = (index + items.length) % items.length;
    if (scroll) {
      tick().then(() => {
        listEl
          ?.querySelectorAll(".row")
          [activeIndex]?.scrollIntoView({ block: "nearest" });
      });
    }
  }

  function selectResult(result: SearchResult) {
    navigate(
      result.type === "chat"
        ? `/?chatId=${result.id}`
        : `/projects/${result.id}`,
    );
    onClose();
  }

  function clearSearch() {
    query = "";
    activeIndex = 0;
    inputEl?.focus();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex + 1, true);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex - 1, true);
    } else if (event.key === "Home") {
      event.preventDefault();
      setActive(0, true);
    } else if (event.key === "End") {
      event.preventDefault();
      setActive(items.length - 1, true);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const result = items[activeIndex];
      if (result) selectResult(result);
    } else if (event.key === "Escape") {
      event.preventDefault();
      // Escape clears a typed query first, then closes.
      if (query) clearSearch();
      else onClose();
    }
  }
</script>

<svelte:window onresize={syncThumb} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="overlay"
    role="presentation"
    onmousedown={(e) => {
      if (e.target === e.currentTarget) onClose();
    }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div
      class="search-popup"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      aria-label={$_("sidebar.searchChatsProjects")}
      onkeydown={handleKeydown}
    >
      <div class="header-input-area">
        <svg
          class="icon-search"
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M14.0001 14.0001L11.1068 11.1068M12.6667 7.33333C12.6667 10.2789 10.2789 12.6667 7.33333 12.6667C4.38781 12.6667 2 10.2789 2 7.33333C2 4.38781 4.38781 2 7.33333 2C10.2789 2 12.6667 4.38781 12.6667 7.33333Z"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>

        <input
          bind:this={inputEl}
          bind:value={query}
          class="search-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          placeholder={$_("sidebar.searchChatsProjects")}
          aria-label={$_("sidebar.searchChatsProjects")}
          aria-autocomplete="list"
          role="combobox"
          aria-expanded="true"
          aria-controls="search-results-list"
        />

        <button
          class="clear-btn"
          type="button"
          onclick={clearSearch}
          aria-label={$_("sidebar.clearSearch")}
          title={$_("sidebar.clearSearch")}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M15.0003 8.99971L8.99983 15.0002M8.99983 8.99971L15.0003 15.0002M22.0009 11.9999C22.0009 17.5232 17.5234 22.0007 12.0001 22.0007C6.47678 22.0007 1.99927 17.5232 1.99927 11.9999C1.99927 6.47666 6.47678 1.99915 12.0001 1.99915C17.5234 1.99915 22.0009 6.47666 22.0009 11.9999Z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
            />
          </svg>
        </button>
      </div>

      <div class="results-wrap">
        <div
          class="results-list"
          id="search-results-list"
          role="listbox"
          aria-label={$_("sidebar.searchChatsProjects")}
          bind:this={listEl}
          onscroll={syncThumb}
        >
          {#if loading && items.length === 0}
            <div class="empty-state">
              <div class="search-spinner"></div>
              <p>{$_("sidebar.loadingChats")}</p>
            </div>
          {:else if items.length === 0}
            <div class="empty-state">
              <h2>
                {$_("sidebar.noMatchesFor", { values: { query: query.trim() } })}
              </h2>
              <p>{$_("sidebar.tryShorterWord")}</p>
            </div>
          {:else}
            {#each items as item, i (item.type + "-" + item.id)}
              <button
                type="button"
                class="row"
                class:is-active={i === activeIndex}
                role="option"
                aria-selected={i === activeIndex}
                onmousemove={() => setActive(i)}
                onclick={() => selectResult(item)}
                title={item.title}
              >
                {#if item.type === "project"}
                  <svg
                    class="row-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.5 4.08333V11.0833C1.5 11.6356 1.94772 12.0833 2.5 12.0833H11.5C12.0523 12.0833 12.5 11.6356 12.5 11.0833V5.5C12.5 4.94772 12.0523 4.5 11.5 4.5H7.29L6.02 2.71C5.83 2.45 5.53 2.29 5.21 2.29H2.5C1.94772 2.29 1.5 2.73772 1.5 3.29V4.08333Z"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linejoin="round"
                    />
                  </svg>
                {:else}
                  <svg
                    class="row-icon"
                    width="14"
                    height="14"
                    viewBox="0 0 14 14"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M1.79963 10.2137C1.84967 9.98633 1.83057 9.74924 1.74479 9.53285C1.14786 8.29432 1.00755 6.88476 1.34862 5.55285C1.68968 4.22095 2.4902 3.05231 3.60895 2.25311C4.72769 1.45391 6.09275 1.07551 7.4633 1.18469C8.83384 1.29386 10.1218 1.88359 11.0999 2.84982C12.078 3.81605 12.6834 5.09669 12.8093 6.46579C12.9352 7.83489 12.5736 9.20446 11.7881 10.3329C11.0026 11.4613 9.84381 12.276 8.51616 12.6333C7.18852 12.9906 5.77734 12.8676 4.53159 12.2858C4.32714 12.2082 4.10498 12.1896 3.89046 12.2321L1.89939 12.8143C1.80334 12.8398 1.70237 12.8404 1.60606 12.8159C1.50975 12.7914 1.42129 12.7427 1.34907 12.6745C1.27684 12.6062 1.22325 12.5207 1.19337 12.4259C1.16349 12.3311 1.15831 12.2303 1.17833 12.133L1.79963 10.2137Z"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                {/if}

                <span class="title-text">
                  {#each highlightParts(item.title, query.trim()) as part}
                    {#if part.mark}<mark>{part.text}</mark>{:else}{part.text}{/if}
                  {/each}
                </span>

                <span class="time-label">{item.group}</span>

                <svg
                  class="enter-hint"
                  width="12"
                  height="12"
                  viewBox="0 0 12 12"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M8.49969 3.50037L3.50049 8.49957M3.50049 3.50037V8.49957H8.49969"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                  />
                </svg>
              </button>
            {/each}
          {/if}
        </div>
        {#if thumbVisible}
          <div class="sp-scrollbar" aria-hidden="true">
            <div
              class="sp-scrollbar__thumb"
              style="height: {thumbHeight}px; transform: translateY({thumbTop}px);"
            ></div>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* ===== Search popup — Figma "search-popup" (159:15367, 520 × 486) ===== */
  .overlay {
    position: fixed;
    inset: 0;
    z-index: 10050;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 96px 32px 32px;
    background: var(--gx-scrim);
    animation: overlay-in 140ms ease;
  }

  .search-popup {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    width: 520px;
    max-width: 100%;
    height: 486px;
    max-height: 100%;
    overflow: hidden;
    border: 0;
    border-radius: 12px;
    background: var(--gx-surface);
    box-shadow:
      inset 0 0 0 1px var(--gx-line),
      0 12px 24px 0 rgba(0, 0, 0, 0.0392);
    font-family: var(--gx-font-display);
    animation: popup-in 140ms ease;
  }

  /* ---------- header ---------- */
  .header-input-area {
    display: flex;
    height: 52px;
    gap: 12px;
    padding: 14px 16px;
    align-items: center;
    align-self: stretch;
    flex-shrink: 0;
    border: 1px solid var(--gx-line);
  }

  .icon-search {
    display: flex;
    flex: 0 0 16px;
    color: var(--gx-dim);
  }

  .search-input {
    flex: 1 1 auto;
    min-width: 0;
    border: 0;
    outline: 0;
    padding: 0;
    background: transparent;
    font-family: inherit;
    font-size: 14px;
    font-weight: 500;
    line-height: 1;
    color: var(--gx-ink);
    box-shadow: none !important;
  }

  .search-input::placeholder {
    color: var(--gx-dim);
    opacity: 1;
  }

  .clear-btn {
    display: flex;
    flex: 0 0 24px;
    width: 24px;
    height: 24px;
    padding: 0;
    margin: 0;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 12px;
    background: none;
    color: var(--gx-dim);
    cursor: pointer;
    box-shadow: none;
    backdrop-filter: none;
    transition: color 120ms ease;
  }

  .clear-btn:hover {
    background: none;
    color: var(--gx-ink);
    transform: none;
    box-shadow: none;
  }

  .clear-btn:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: 2px;
  }

  /* ---------- results ---------- */
  .results-wrap {
    position: relative;
    align-self: stretch;
    flex: 1 1 auto;
    min-height: 0;
  }

  .results-list {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 2px;
    height: 100%;
    padding: 8px;
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: none;
  }

  .results-list::-webkit-scrollbar {
    display: none;
  }

  /* the 4px scrollbar the design draws itself */
  .sp-scrollbar {
    position: absolute;
    top: 8px;
    bottom: 8px;
    inset-inline-end: 8px;
    width: 4px;
    border-radius: 2px;
    background: var(--gx-scroll-track);
    pointer-events: none;
  }

  .sp-scrollbar__thumb {
    width: 4px;
    border-radius: 2px;
    background: var(--gx-scroll-thumb);
  }

  /* ---------- rows ---------- */
  .row {
    display: flex;
    flex: 0 0 auto;
    height: 40px;
    width: 100%;
    gap: 10px;
    padding: 0 12px;
    justify-content: flex-start;
    align-items: center;
    align-self: stretch;
    border: 0;
    border-radius: 6px;
    background: none;
    font-family: inherit;
    text-align: left;
    cursor: pointer;
    box-shadow: none !important;
    backdrop-filter: none;
    transition: background-color 120ms ease;
  }

  .row:hover {
    background: var(--gx-row-hover);
    transform: none;
  }

  .row:focus-visible {
    outline: 2px solid var(--gx-blue);
    outline-offset: -2px;
  }

  .row-icon {
    display: flex;
    flex: 0 0 14px;
    color: var(--gx-dim);
  }

  .title-text {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    font-weight: 500;
    line-height: 1;
    color: var(--gx-ink);
  }

  .title-text mark {
    background: transparent;
    color: inherit;
    font-weight: 700;
  }

  .time-label {
    flex: 0 0 auto;
    font-size: 11px;
    font-weight: 500;
    line-height: 1;
    color: var(--gx-dim);
    white-space: nowrap;
  }

  .enter-hint {
    display: none;
    flex: 0 0 12px;
    color: var(--gx-blue);
  }

  /* the highlighted row swaps its timestamp for the ⏎ hint */
  .row.is-active {
    background: var(--gx-blue-soft);
  }

  .row.is-active:hover {
    background: var(--gx-blue-soft-hover);
  }

  .row.is-active .row-icon,
  .row.is-active .title-text {
    color: var(--gx-blue);
  }

  .row.is-active .time-label {
    display: none;
  }

  .row.is-active .enter-hint {
    display: flex;
  }

  /* ---------- empty / loading ---------- */
  .empty-state {
    padding: 24px 12px;
  }

  .empty-state h2 {
    margin: 0 0 4px;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    letter-spacing: normal;
    color: var(--gx-dim);
  }

  .empty-state p {
    margin: 0;
    font-size: 13px;
    font-weight: 500;
    line-height: 1.4;
    color: var(--gx-dim);
  }

  .search-spinner {
    width: 16px;
    height: 16px;
    margin: 0 0 8px;
    border: 2px solid var(--gx-line);
    border-top-color: var(--gx-blue);
    border-radius: 50%;
    animation: search-spin 0.8s linear infinite;
  }

  /* ---------- mobile ---------- */
  @media (max-width: 600px) {
    .overlay {
      padding: 0;
      align-items: stretch;
    }

    .search-popup {
      width: 100%;
      height: 100%;
      border-radius: 0;
      box-shadow: none;
    }

    .header-input-area {
      padding: 14px;
      padding-top: max(14px, env(safe-area-inset-top));
    }

    .search-input {
      /* 16px keeps iOS from zooming the viewport on focus */
      font-size: 16px;
    }

    .sp-scrollbar {
      display: none;
    }
  }

  @keyframes search-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes overlay-in {
    from {
      opacity: 0;
    }
  }

  @keyframes popup-in {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .overlay,
    .search-popup {
      animation: none;
    }

    .row {
      transition: none;
    }
  }
</style>
