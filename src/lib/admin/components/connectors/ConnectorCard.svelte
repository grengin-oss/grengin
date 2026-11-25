<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0

Compact Browse card: identity, a short description and app icons, with
region selection beside the connection action.
-->
<script lang="ts">
  import ConnectorIcon from "$lib/admin/components/connectors/ConnectorIcon.svelte";
  import { _ } from "svelte-i18n";
  import {
    iconUrl,
    type ConnectorCatalogEntry,
  } from "$lib/api/admin/connectors.js";

  interface Props {
    entry: ConnectorCatalogEntry;
    connected: boolean;
    connecting?: boolean;
    categoryLabel: string;
    /** Text for the connected pill, e.g. "Connected · 6 of 9". */
    connectedLabel?: string;
    /** False until an admin adds it (creates its MCP server); then it can be connected. */
    added?: boolean;
    adding?: boolean;
    onOpen: () => void;
    onConnect: () => void;
    onAdd?: () => void;
    /** Suites: the apps one sign-in covers, shown as a row of small icons. */
    members?: { key: string; name: string; icon: string }[];
    regions?: { key: string; label: string }[];
    onRegionChange?: (key: string) => void;
  }
  let {
    entry,
    connected,
    connecting = false,
    categoryLabel,
    connectedLabel,
    added = true,
    adding = false,
    onOpen,
    onConnect,
    onAdd,
    members = [],
    regions = [],
    onRegionChange,
  }: Props = $props();
</script>

<article class="cn-card" aria-label={entry.display_name} aria-busy={adding || connecting}>
  <button class="cn-card-open" type="button" onclick={onOpen} title={entry.display_name}>
    <span class="cn-card-icon">
      <ConnectorIcon src={iconUrl(entry.icon)} name={entry.display_name} size={28} />
    </span>
    <span class="cn-card-head">
      <span class="cn-card-name">{entry.display_name}</span>
      <span class="cn-card-cat">{categoryLabel}</span>
    </span>
  </button>
    <p class="cn-card-job" title={entry.job}>{entry.job}</p>
    {#if members.length}
      <div class="cn-card-members">
        <div class="cn-card-member-icons" aria-label={members.map((member) => member.name).join(", ")}>
          {#each members as member (member.key)}
            <span class="cn-card-member" title={member.name}>
              <ConnectorIcon src={iconUrl(member.icon)} name={member.name} size={16} />
            </span>
          {/each}
        </div>
        <span class="cn-card-members-label">{$_("admin.connectors.oneSignIn", { values: { count: members.length } })}</span>
      </div>
    {/if}

  <div class="cn-card-foot">
    {#if regions.length > 1}
      <label class="cn-region">
        <span>{$_("admin.connectors.region")}</span>
        <span class="cn-region-control">
          <select
            value={entry.key}
            disabled={adding || connecting}
            onchange={(event) => onRegionChange?.(event.currentTarget.value)}
          >
            {#each regions as region (region.key)}
              <option value={region.key}>{region.label}</option>
            {/each}
          </select>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="m4 6 4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </span>
      </label>
    {/if}
    {#if connected}
      <span class="cn-connected" title={connectedLabel ?? $_("connectors.connected")}>
        <span class="cn-dot" aria-hidden="true"></span>
        {connectedLabel ?? $_("connectors.connected")}
      </span>
    {:else if !added}
      <button class="cn-card-action" type="button" disabled={adding || connecting || !onAdd} onclick={onAdd}>
        {adding ? $_("admin.connectors.adding") : $_("admin.connectors.add")}
      </button>
    {:else}
      <button class="cn-card-action" type="button" disabled={adding || connecting} onclick={onConnect}>
        {connecting ? $_("connectors.connecting") : $_("admin.connectors.connect")}
      </button>
    {/if}
  </div>
</article>

<style>
  .cn-card {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
    padding: 14px;
    box-sizing: border-box;
    text-align: start;
    font-family: var(--gx-font);
    background: var(--gx-surface);
    border: 1px solid var(--gx-hair);
    border-radius: 10px;
    transition: background-color 150ms ease;
  }
  .cn-card:hover { background: var(--gx-fill-soft); }
  .cn-card-icon { flex: none; }
  .cn-card-head { display: flex; flex-direction: column; min-width: 0; }
  .cn-card button {
    margin: 0;
    box-shadow: none;
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transform: none;
    font-family: inherit;
  }
  .cn-card button:focus-visible,
  .cn-region select:focus-visible {
    outline: 2px solid var(--gx-org-primary-500);
    outline-offset: 3px;
  }
  .cn-card-open {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    min-height: 36px;
    max-width: 100%;
    padding: 0;
    border: 0;
    border-radius: 3px;
    background: transparent;
    text-align: start;
    white-space: normal;
  }
  .cn-card-open:hover,
  .cn-card-open:active { background: transparent; }
  .cn-card-open:hover .cn-card-name { color: var(--gx-org-primary-500); }
  .cn-card-name {
    font-weight: 650;
    font-size: 14px;
    line-height: 20px;
    color: var(--gx-slate-900);
    overflow-wrap: anywhere;
  }
  .cn-card-cat {
    font-weight: 400;
    font-size: 11px;
    line-height: 16px;
    color: var(--gx-an-sub);
  }
  .cn-card-job {
    margin: 0;
    min-height: 36px;
    font-size: 12px;
    font-weight: 400;
    line-height: 18px;
    color: var(--gx-an-sub);
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    overflow: hidden;
  }
  .cn-card-members {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    margin-top: 0;
  }
  .cn-card-members-label {
    font-size: 11px;
    line-height: 16px;
    color: var(--gx-an-sub);
  }
  .cn-card-member-icons { display: flex; flex-wrap: wrap; gap: 5px; }
  .cn-card-member { display: block; }
  .cn-card-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: auto;
    min-height: 32px;
    max-width: 100%;
  }
  .cn-region {
    margin-inline-end: auto;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    color: var(--gx-an-sub);
    font-size: 11px;
    line-height: 16px;
  }
  .cn-region-control { position: relative; }
  .cn-region select {
    display: block;
    width: 88px;
    max-width: 100%;
    min-height: 32px;
    margin: 0;
    padding: 5px 8px;
    padding-inline-end: 24px;
    appearance: none;
    border: 1px solid var(--gx-hair-strong);
    border-radius: 6px;
    background: var(--gx-surface);
    color: var(--gx-slate-900);
    font: inherit;
    font-size: 12px;
    box-shadow: none;
    cursor: pointer;
  }
  .cn-region-control svg {
    position: absolute;
    inset-inline-end: 7px;
    top: 50%;
    transform: translateY(-50%);
    pointer-events: none;
  }
  .cn-card .cn-card-action {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 76px;
    min-height: 32px;
    padding: 6px 12px;
    border: 1px solid var(--gx-hair-strong);
    border-radius: 6px;
    background: var(--gx-card);
    color: var(--gx-org-primary-500);
    font-size: 12px;
    font-weight: 600;
    line-height: 18px;
    transition: background-color 150ms ease;
  }
  .cn-card-action:hover:not(:disabled) { background: var(--gx-ring-soft); }
  .cn-card-action:disabled { opacity: 0.65; cursor: wait; }
  .cn-connected {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    min-height: 32px;
    font-size: 12px;
    color: var(--gx-slate-900);
  }
  .cn-dot { width: 6px; height: 6px; border-radius: 50%; background: rgb(76, 169, 122); flex: none; }
</style>
