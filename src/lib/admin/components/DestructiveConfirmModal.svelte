<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<!--
  The destructive confirm from organization.html (".delete-modal"): a red trash
  tile, a list of what the action takes with it, and — when the caller asks for
  one — a field that holds the danger button disarmed until the admin types the
  subject's name back.

  It is deliberately content-agnostic. Callers pass already-localised strings
  (they know whether it is a department, a role, or something else) and perform
  the work themselves, reporting progress through `isBusy`. That keeps one copy
  of the dialog's design for every destructive action in the admin.
-->

<script lang="ts">
  import { _ } from "svelte-i18n";
  import Modal from "./Modal.svelte";

  interface Props {
    title: string;
    subtitle: string;
    /** Heading above the impact list, e.g. "This will also remove". */
    impactLabel: string;
    /** Localised lines for the impact box. Empty hides the box entirely. */
    impacts: string[];
    /**
     * Word the admin must type before the button arms. Leave null to arm
     * immediately — right when the action carries no warned-about consequence.
     */
    confirmWord?: string | null;
    /** Label above the confirm field; only read when `confirmWord` is set. */
    confirmLabel?: string;
    /** Small print under the confirm field. */
    confirmHint?: string;
    /** Danger button at rest. */
    confirmButtonLabel: string;
    /** Danger button while `isBusy`. */
    busyLabel: string;
    /** True while the caller's request is in flight. */
    isBusy: boolean;
    onCancel: () => void;
    onConfirm: () => void;
  }

  let {
    title,
    subtitle,
    impactLabel,
    impacts,
    confirmWord = null,
    confirmLabel = "",
    confirmHint = "",
    confirmButtonLabel,
    busyLabel,
    isBusy,
    onCancel,
    onConfirm,
  }: Props = $props();

  let typedName = $state("");

  const needsTypedConfirm = $derived(!!confirmWord);

  /** Comparison ignores surrounding space and case — a speed bump, not a password. */
  const nameMatches = $derived(
    !!confirmWord &&
      typedName.trim().toLocaleLowerCase() ===
        confirmWord.trim().toLocaleLowerCase(),
  );

  const canConfirm = $derived(!isBusy && (!needsTypedConfirm || nameMatches));

  // A different subject in the same mounted dialog starts from a blank field.
  let lastConfirmWord = $state<string | null | undefined>(undefined);
  $effect(() => {
    if (confirmWord !== lastConfirmWord) {
      lastConfirmWord = confirmWord;
      typedName = "";
    }
  });

  function handleConfirm() {
    if (!canConfirm) return;
    onConfirm();
  }

  function handleClose() {
    if (isBusy) return;
    onCancel();
  }

  /** Enter in the confirm field submits, matching the footer button's gate. */
  function handleInputKeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      handleConfirm();
    }
  }
</script>

<Modal
  isOpen={true}
  variant="delete-department"
  onclose={handleClose}
  {title}
  {subtitle}
  descriptionId="destructive-confirm-impact"
>
  {#snippet headerIcon()}
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M2.5 5h15M8 5V3.5A1.5 1.5 0 0 1 9.5 2h1A1.5 1.5 0 0 1 12 3.5V5m2.5 0-.6 10.2a2 2 0 0 1-2 1.8H8.1a2 2 0 0 1-2-1.8L5.5 5"
        stroke="currentColor"
        stroke-width="1.5"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  {/snippet}

  <div class="dd-body" id="destructive-confirm-impact">
    {#if impacts.length > 0}
      <div class="impact-box">
        <span class="impact-box__label">{impactLabel}</span>
        <div class="impact-rows">
          {#each impacts as line (line)}
            <div class="impact-row">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <circle cx="7" cy="7" r="6" stroke="currentColor" stroke-width="1.3" />
                <path
                  d="M4.8 4.8l4.4 4.4M9.2 4.8l-4.4 4.4"
                  stroke="currentColor"
                  stroke-width="1.3"
                  stroke-linecap="round"
                />
              </svg>
              <span>{line}</span>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    {#if needsTypedConfirm}
      <div class="confirm-block">
        <label class="confirm-label" for="destructive-confirm-input">
          {confirmLabel}
        </label>
        <input
          id="destructive-confirm-input"
          class="confirm-input"
          type="text"
          autocomplete="off"
          spellcheck="false"
          disabled={isBusy}
          placeholder={confirmWord}
          bind:value={typedName}
          onkeydown={handleInputKeydown}
        />
        {#if confirmHint}
          <span class="confirm-hint">{confirmHint}</span>
        {/if}
      </div>
    {/if}
  </div>

  {#snippet footer()}
    <button
      type="button"
      class="btn-cancel"
      disabled={isBusy}
      onclick={handleClose}
    >
      {$_("common.cancel")}
    </button>
    <button
      type="button"
      class="btn-delete"
      class:btn-delete--busy={isBusy}
      data-armed={canConfirm}
      disabled={!canConfirm}
      onclick={handleConfirm}
    >
      {#if isBusy}
        <span class="spinner" aria-hidden="true"></span>
      {/if}
      <span>{isBusy ? busyLabel : confirmButtonLabel}</span>
    </button>
  {/snippet}
</Modal>

<style>
  /* app.css paints every bare <button> as a glass pill; the two footer actions
     are flat, so the blur and lift are switched off first. */
  button {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }

  .dd-body {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ".impact-box" */
  .impact-box {
    border-radius: 12px;
    background: var(--gx-hover-soft);
    box-shadow: inset 0 0 0 1px var(--gx-hair);
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
  }

  .impact-box__label {
    font-weight: 700;
    font-size: 11px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: var(--gx-slate-500);
  }

  .impact-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .impact-row {
    display: flex;
    gap: 8px;
    align-items: center;
    color: var(--gx-org-danger);
  }

  .impact-row svg {
    flex-shrink: 0;
  }

  .impact-row span {
    font-weight: 400;
    font-size: 13px;
    line-height: 1.35;
    color: var(--gx-org-ink);
  }

  /* ".confirm-block" */
  .confirm-block {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .confirm-label {
    font-weight: 600;
    font-size: 12px;
    line-height: 100%;
    color: var(--gx-org-ink);
  }

  /* app.css gives every input a glass fill, a blur and its own focus ring;
     this field carries the design's flat ring instead. */
  .confirm-input {
    height: 37px;
    box-sizing: border-box;
    border: none;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-hair);
    padding: 10px 12px;
    font-family: inherit;
    font-weight: 400;
    font-size: 14px;
    color: var(--gx-org-ink);
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
    transition: box-shadow 120ms ease;
  }

  .confirm-input::placeholder {
    color: var(--gx-slate-400);
    opacity: 1;
  }

  .confirm-input:focus {
    outline: none;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1.5px var(--gx-org-danger);
  }

  .confirm-input:disabled {
    opacity: 0.6;
  }

  .confirm-hint {
    font-weight: 400;
    font-size: 12px;
    line-height: 1.35;
    color: var(--gx-slate-400);
  }

  /* ".btn-cancel-exact" / ".btn-delete-confirm" */
  .btn-cancel {
    height: 36px;
    border: none;
    border-radius: 8px;
    background: var(--gx-card);
    box-shadow: inset 0 0 0 1px var(--gx-hair-strong);
    padding: 0 16px;
    display: flex;
    align-items: center;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    color: var(--gx-org-ink);
    white-space: nowrap;
    cursor: pointer;
  }

  .btn-cancel:hover:not(:disabled) {
    background: var(--gx-hover-soft);
    transform: none;
  }

  .btn-cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Disarmed until the typed name matches — grey and inert, so the dangerous
     button never looks pressable before the admin has confirmed. */
  .btn-delete {
    height: 36px;
    border: none;
    border-radius: 8px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    font-family: inherit;
    font-weight: 600;
    font-size: 13px;
    background: var(--gx-hair);
    color: var(--gx-slate-400);
    white-space: nowrap;
    cursor: not-allowed;
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .btn-delete[data-armed="true"] {
    background: var(--gx-org-danger);
    color: #fff;
    cursor: pointer;
  }

  .btn-delete[data-armed="true"]:hover {
    background: var(--gx-org-danger-hover);
    transform: none;
  }

  /* Held at the armed colours while the request runs, so the button does not
     flash grey between the click and the dialog closing. */
  .btn-delete.btn-delete--busy {
    background: var(--gx-org-danger);
    color: #fff;
    cursor: wait;
  }

  .spinner {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    border: 1.5px solid currentColor;
    border-top-color: transparent;
    animation: dd-spin 0.6s linear infinite;
    flex-shrink: 0;
  }

  @keyframes dd-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation-duration: 2s;
    }
  }
</style>
