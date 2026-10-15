<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  The `‹ 1 / 2 ›` version switcher (ENGG-459). Shown under a user or assistant
  message that editing or regenerating has branched. It is purely presentational:
  the arrows ask the parent to switch to a sibling version by its id, and the
  parent calls the branch endpoint and re-renders what it returns — the shown
  version, and everything below it, follows.
-->
<script lang="ts">
  import { _ } from "svelte-i18n";
  import type { MessageVersions } from "../../../types/chat";

  interface Props {
    versions: MessageVersions;
    /** The id of the message this switcher sits on — i.e. the version shown now. */
    messageId: string;
    /** Disabled while an answer is streaming, so versions can't change mid-flight. */
    disabled?: boolean;
    onSwitch: (messageId: string) => void;
  }

  let { versions, messageId, disabled = false, onSwitch }: Props = $props();

  // Which version is shown = where this message's own id sits in `message_ids`.
  // This is unambiguous and avoids depending on `versions.current`, which the
  // backend reports 1-based (ENGG-459); fall back to it (converted) only if the
  // id somehow isn't listed.
  const index = $derived.by(() => {
    const byId = versions.message_ids?.indexOf(messageId) ?? -1;
    if (byId >= 0) return byId;
    const fromCurrent = (versions.current ?? 1) - 1;
    return Math.min(Math.max(fromCurrent, 0), versions.total - 1);
  });
  const atStart = $derived(index <= 0);
  const atEnd = $derived(index >= versions.total - 1);

  function go(targetIndex: number) {
    if (disabled) return;
    const clamped = Math.min(Math.max(targetIndex, 0), versions.total - 1);
    const id = versions.message_ids?.[clamped];
    if (id && clamped !== index) onSwitch(id);
  }
</script>

<div class="msg-versions" role="group" aria-label={$_("chat.message.versionsLabel")}>
  <button
    type="button"
    class="msg-versions__arrow"
    onclick={() => go(index - 1)}
    disabled={disabled || atStart}
    aria-label={$_("chat.message.previousVersion")}
    title={$_("chat.message.previousVersion")}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="15 18 9 12 15 6" />
    </svg>
  </button>

  <span class="msg-versions__count" aria-live="polite">
    {$_("chat.message.versionCounter", {
      values: { current: index + 1, total: versions.total },
    })}
  </span>

  <button
    type="button"
    class="msg-versions__arrow"
    onclick={() => go(index + 1)}
    disabled={disabled || atEnd}
    aria-label={$_("chat.message.nextVersion")}
    title={$_("chat.message.nextVersion")}
  >
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  </button>
</div>

<style>
  .msg-versions {
    display: inline-flex;
    align-items: center;
    gap: 0.125rem;
    margin-top: var(--space-xs);
    user-select: none;
  }

  .msg-versions__arrow {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.125rem;
    border: none;
    border-radius: var(--radius-sm, 0.375rem);
    background: none;
    color: var(--text-secondary);
    cursor: pointer;
    transition:
      color 0.15s ease,
      background 0.15s ease,
      transform 0.15s ease;
  }

  .msg-versions__arrow:hover:not(:disabled) {
    color: var(--brand);
    background: var(--btn-secondary);
  }

  .msg-versions__arrow:active:not(:disabled) {
    transform: scale(0.9);
  }

  .msg-versions__arrow:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 1px;
  }

  .msg-versions__arrow:disabled {
    opacity: 0.4;
    cursor: default;
  }

  /* The arrows are direction-relative (prev = start, next = end), so mirror the
     glyphs for RTL just as the surrounding layout flips. */
  :global([dir="rtl"]) .msg-versions__arrow svg {
    transform: scaleX(-1);
  }

  .msg-versions__count {
    min-width: 2.5rem;
    text-align: center;
    font-family: var(--gx-font, inherit);
    font-size: 0.75rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: var(--text-secondary);
  }
</style>
