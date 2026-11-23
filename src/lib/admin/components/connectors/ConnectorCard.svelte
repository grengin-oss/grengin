<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0

The connector card (ENGG-511), matched to connectors.html, used by the Browse
dialog (catalog). Icon + name + category, a one-line job, and a footer with
the connection pill and a Manage/Connect action.
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
  }: Props = $props();
</script>

<button class="cn-card" onclick={onOpen}>
  <div class="cn-card-top">
    <ConnectorIcon
      src={iconUrl(entry.icon)}
      name={entry.display_name}
      size={32}
    />
    <div class="cn-card-head">
      <span class="cn-card-name">{entry.display_name}</span>
      <span class="cn-card-cat">{categoryLabel}</span>
    </div>
  </div>
  <p class="cn-card-job">{entry.job}</p>
  {#if members.length}
    <div class="cn-card-members" aria-label={$_("admin.connectors.oneSignIn", { values: { count: members.length } })}>
      <span class="cn-card-member-icons">
        {#each members as member (member.key)}
          <span title={member.name}><ConnectorIcon src={iconUrl(member.icon)} name={member.name} size={18} /></span>
        {/each}
      </span>
      <span class="cn-card-members-label">{$_("admin.connectors.oneSignIn", { values: { count: members.length } })}</span>
    </div>
  {/if}
  <div class="cn-card-foot">
    {#if connected}
      <span
        class="cn-dot"
        title={connectedLabel ?? $_("connectors.connected")}
        aria-label={connectedLabel ?? $_("connectors.connected")}
      ></span>
    {:else if !added}
      <span
        class="cn-btn cn-btn-primary cn-card-action"
        class:busy={adding}
        role="button"
        tabindex="-1"
        onclick={(e) => {
          e.stopPropagation();
          onAdd?.();
        }}
        onkeydown={() => {}}
        >{adding
          ? $_("admin.connectors.adding")
          : $_("admin.connectors.add")}</span
      >
    {:else}
      <span
        class="cn-btn cn-btn-primary cn-card-action"
        class:busy={connecting}
        role="button"
        tabindex="-1"
        onclick={(e) => {
          e.stopPropagation();
          onConnect();
        }}
        onkeydown={() => {}}
        >{connecting
          ? $_("connectors.connecting")
          : $_("admin.connectors.connect")}</span
      >
    {/if}
  </div>
</button>

<style>
  .cn-card {
    text-align: start;
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
    background: var(--gx-surface);
    border: 1px solid rgb(222, 225, 230);
    border-radius: 14px;
    padding: 18px;
    cursor: pointer;
    font-family: var(--gx-font);
    box-sizing: border-box;
    transition:
      border-color 120ms ease,
      box-shadow 120ms ease;
  }
  .cn-card:hover {
    border-color: rgb(185, 201, 241);
    box-shadow: 0 2px 10px rgba(63, 92, 184, 0.08);
  }
  .cn-card-top {
    display: flex;
    gap: 12px;
    align-items: center;
    height: 39px;
  }
  .cn-card-head {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .cn-card-name {
    font-weight: 700;
    font-size: 14.5px;
    line-height: 21px;
    color: var(--gx-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .cn-card-cat {
    font-weight: 400;
    font-size: 12px;
    line-height: 17.4px;
    color: rgb(134, 140, 153);
    white-space: nowrap;
  }
  .cn-card-members {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .cn-card-member-icons {
    display: inline-flex;
    gap: 4px;
  }
  .cn-card-members-label {
    font-size: 12px;
    color: rgb(134, 140, 153);
  }
  .cn-card-job {
    margin: 0;
    font-weight: 400;
    font-size: 13px;
    line-height: 18.85px;
    color: rgb(55, 65, 81);
    min-height: 38px;
    text-wrap: pretty;
  }
  .cn-card-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    height: 32px;
    margin-top: auto;
  }

  .cn-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-family: var(--gx-font);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    border: 1px solid transparent;
    box-sizing: border-box;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      color 120ms ease;
  }
  .cn-btn-primary {
    background: rgb(66, 122, 198);
    color: #fff;
  }
  .cn-btn-primary:hover {
    background: rgb(56, 106, 176);
  }
  .cn-btn-primary.busy {
    opacity: 0.7;
    pointer-events: none;
  }
  .cn-card-action {
    height: 32px;
    border-radius: 10px;
    padding: 0 13px;
    font-size: 12px;
    line-height: 1;
  }

  .cn-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: rgb(76, 169, 122);
    box-shadow: 0 0 0 3px rgba(76, 169, 122, 0.18);
    flex-shrink: 0;
  }
</style>
