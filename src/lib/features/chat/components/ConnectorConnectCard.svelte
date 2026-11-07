<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0

Connect card in chat (ENGG-511). When an answer needs an allowed connector that
isn't connected, the answer offers it in place — read only, for that user only,
with a paste fallback. Figma: 2381-17229.

Reusable: pass the heading, note and the connector options (key + label +
icon). `onConnect` is called with the chosen key; it should start that user's
own connection. Defaults match the Figma accounting example.
-->
<script lang="ts">
  import ConnectorIcon from '$lib/admin/components/connectors/ConnectorIcon.svelte';
  import { iconUrl, connectConnector } from '$lib/api/admin/connectors.js';
  import { toast } from '$lib/components/Toaster.svelte';
  import { _ } from 'svelte-i18n';

  export interface ConnectOption {
    key: string;
    label: string;
    icon: string;
  }

  interface Props {
    heading?: string;
    note?: string;
    options: ConnectOption[];
    footerNote?: string;
    elseLabel?: string;
    onConnect?: (key: string) => void | Promise<void>;
    onElse?: () => void;
  }
  let {
    heading,
    note,
    options,
    footerNote,
    elseLabel,
    onConnect,
    onElse,
  }: Props = $props();

  let connecting = $state<string | null>(null);

  async function choose(key: string) {
    connecting = key;
    try {
      if (onConnect) await onConnect(key);
      else {
        await connectConnector(key);
        toast.success($_('chat.connectCard.connectedAskAgain'));
      }
    } catch {
      toast.error($_('connectors.errors.connectFailed'));
    } finally {
      connecting = null;
    }
  }
</script>

<div class="cc-card">
  <div class="cc-head">
    <h3 class="cc-title">{heading ?? $_('chat.connectCard.accountingHeading')}</h3>
    <p class="cc-note">{note ?? $_('chat.connectCard.accountingNote')}</p>
  </div>
  <div class="cc-options">
    {#each options as opt (opt.key)}
      <button class="cc-option" class:busy={connecting === opt.key} onclick={() => choose(opt.key)}>
        <ConnectorIcon src={iconUrl(opt.icon)} name={opt.label} size={28} />
        <span class="cc-option-label">{connecting === opt.key ? $_('connectors.connecting') : opt.label}</span>
      </button>
    {/each}
  </div>
  <div class="cc-foot">
    <span class="cc-foot-note">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" stroke-width="1.4" />
        <path d="M5.5 7V5.25a2.5 2.5 0 0 1 5 0V7" stroke="currentColor" stroke-width="1.4" />
      </svg>
      {footerNote ?? $_('chat.connectCard.footerNote')}
    </span>
    <button class="cc-else" onclick={() => onElse?.()}>{elseLabel ?? $_('chat.connectCard.elseLabel')}</button>
  </div>
</div>

<style>
  .cc-card {
    font-family: var(--gx-font);
    background: var(--gx-card);
    border: 1px solid var(--gx-hair);
    border-radius: 0.875rem;
    padding: 1.1rem 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    max-width: 640px;
  }
  .cc-head { display: flex; flex-direction: column; gap: 0.2rem; }
  .cc-title { margin: 0; font-size: 0.98rem; font-weight: 700; color: var(--gx-ink); }
  .cc-note { margin: 0; font-size: 0.85rem; color: var(--gx-muted); line-height: 1.4; }
  .cc-options { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
  @media (max-width: 560px) { .cc-options { grid-template-columns: 1fr; } }
  .cc-option {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.7rem 0.85rem;
    border: 1px solid var(--gx-hair-strong);
    border-radius: 0.6rem;
    background: var(--gx-surface);
    cursor: pointer;
    font-family: var(--gx-font);
    transition: border-color 0.12s ease, background 0.12s ease;
  }
  .cc-option:hover { border-color: var(--gx-org-primary-500); background: var(--gx-org-primary-tint); }
  .cc-option.busy { opacity: 0.6; pointer-events: none; }
  .cc-option-label { font-size: 0.9rem; font-weight: 600; color: var(--gx-ink); }
  .cc-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }
  .cc-foot-note {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--gx-dim);
  }
  .cc-else {
    background: none;
    border: none;
    color: var(--gx-org-primary-500);
    font-family: var(--gx-font);
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
  }
  .cc-else:hover { text-decoration: underline; }
</style>
