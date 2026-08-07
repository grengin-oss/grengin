<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onDestroy } from "svelte";
  import { _ } from "svelte-i18n";
  import ReconfigureConfirmModal from "./ReconfigureConfirmModal.svelte";
  import ReconfigureOutputConsole from "./ReconfigureOutputConsole.svelte";
  import { toast } from "../../../components/Toaster.svelte";
  import { ApiError } from "../../../api/client.js";
  import { getLocalizedError } from "../../../utils/errorLocalization.js";
  import {
    reconfigureDomain,
    probeOriginReachable,
    newOriginFor,
    type ReconfigureScriptAvailability,
    type DomainReconfigureRequest,
    type DomainReconfigureResponse,
    type SslMode,
  } from "../../../api/admin/reconfigure.js";

  interface Props {
    availability: ReconfigureScriptAvailability;
    /** Disabled when the script is unavailable OR the host has no privilege. */
    disabled: boolean;
    runWithAutoRefreshSuspended: <T>(fn: () => Promise<T>) => Promise<T>;
    /** Called after any successful run so the preflight can be re-fetched. */
    onsuccess: () => void;
  }

  let { availability, disabled, runWithAutoRefreshSuspended, onsuccess }: Props =
    $props();

  // ---- Form state ----
  let domain = $state("");
  let sslMode = $state<SslMode>("letsencrypt");
  let email = $state("");
  let selfSignedDays = $state(365);
  // Let's Encrypt pre-requisite acknowledgements.
  let ackDns = $state(false);
  let ackPorts = $state(false);
  let ackProxy = $state(false);

  type FieldErrors = { domain?: string; email?: string; selfSignedDays?: string };
  let errors = $state<FieldErrors>({});

  // ---- Run state ----
  let confirmOpen = $state(false);
  let running = $state(false);
  let result = $state<DomainReconfigureResponse | null>(null);

  // ---- Verify-then-go state ----
  type VerifyState = "idle" | "checking" | "reachable" | "timeout";
  let verifyState = $state<VerifyState>("idle");
  let verifyOrigin = $state("");
  let verifyCancelled = false;

  const VERIFY_MAX_MS = 90_000;
  const VERIFY_START_DELAY_MS = 2_000;
  const VERIFY_MAX_DELAY_MS = 10_000;

  const reason = $derived(
    availability.reason ?? $_("admin.maintenance.domain.unavailable")
  );

  // ---- Validation ----
  function validateDomain(value: string): string | undefined {
    const v = value.trim();
    if (!v) return $_("admin.maintenance.domain.domainRequired");
    if (/^https?:\/\//i.test(v))
      return $_("admin.maintenance.domain.domainNoScheme");
    if (/[\s/]/.test(v)) return $_("admin.maintenance.domain.domainInvalid");
    // hostname / FQDN: labels.tld, each label 1-63 chars, total <= 253.
    const fqdn =
      /^(?=.{1,253}$)([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$/;
    if (!fqdn.test(v)) return $_("admin.maintenance.domain.domainInvalid");
    return undefined;
  }

  function validateEmail(value: string): string | undefined {
    if (sslMode !== "letsencrypt") return undefined;
    const v = value.trim();
    if (!v) return $_("admin.maintenance.domain.emailRequired");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))
      return $_("admin.maintenance.domain.emailInvalid");
    return undefined;
  }

  function validateDays(value: number): string | undefined {
    if (sslMode !== "selfsigned") return undefined;
    if (!Number.isInteger(value) || value < 1)
      return $_("admin.maintenance.domain.selfSignedDaysInvalid");
    return undefined;
  }

  function validate(): boolean {
    const next: FieldErrors = {
      domain: validateDomain(domain),
      email: validateEmail(email),
      selfSignedDays: validateDays(selfSignedDays),
    };
    errors = next;
    return !next.domain && !next.email && !next.selfSignedDays;
  }

  // All Let's Encrypt pre-requisites must be acknowledged before applying.
  const prereqsMet = $derived(
    sslMode !== "letsencrypt" || (ackDns && ackPorts && ackProxy)
  );

  function openConfirm() {
    if (running || disabled) return;
    if (!validate() || !prereqsMet) return;
    confirmOpen = true;
  }

  // ---- Apply ----
  async function applyDomain() {
    confirmOpen = false;
    running = true;
    result = null;
    verifyState = "idle";

    const targetDomain = domain.trim();
    const body: DomainReconfigureRequest = {
      domain: targetDomain,
      ssl_mode: sslMode,
    };
    if (sslMode === "letsencrypt") body.email = email.trim();
    if (sslMode === "selfsigned") body.self_signed_days = selfSignedDays;

    try {
      const response = await runWithAutoRefreshSuspended(() =>
        reconfigureDomain(body)
      );
      result = response;
      if (response.success) {
        // PRD: re-fetch availability after any successful operation.
        onsuccess();
        // Verify-then-go: probe the NEW origin; do not auto-redirect.
        startVerify(response.redirect_url || newOriginFor(targetDomain));
      }
      // success === false → console renders message + output; form stays for retry.
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        // A real HTTP error from the host — not a dropped connection.
        if (err.status === 503) {
          toast.error($_("admin.maintenance.domain.serviceUnavailable"));
        } else {
          toast.error(getLocalizedError(err, "description", $_));
        }
        console.error("Domain reconfigure error:", err);
      } else {
        // Network error (proxy reload dropped the in-flight connection). The
        // change may well have applied — route into the SAME verify-then-go
        // readiness check against the target domain instead of failing.
        console.warn(
          "Domain reconfigure POST connection dropped — entering readiness check:",
          err
        );
        startVerify(newOriginFor(targetDomain));
      }
    } finally {
      running = false;
    }
  }

  // ---- Verify-then-go readiness check ----
  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async function startVerify(origin: string) {
    verifyOrigin = origin;
    verifyState = "checking";
    verifyCancelled = false;

    const deadline = Date.now() + VERIFY_MAX_MS;
    let delay = VERIFY_START_DELAY_MS;

    while (!verifyCancelled && Date.now() < deadline) {
      const reachable = await probeOriginReachable(origin);
      if (verifyCancelled) return;
      if (reachable) {
        verifyState = "reachable";
        return;
      }
      await sleep(delay);
      delay = Math.min(delay * 1.5, VERIFY_MAX_DELAY_MS);
    }
    if (!verifyCancelled) verifyState = "timeout";
  }

  function retryVerify() {
    if (verifyOrigin) startVerify(verifyOrigin);
  }

  function goToNewAddress() {
    if (verifyOrigin) window.location.assign(verifyOrigin);
  }

  onDestroy(() => {
    verifyCancelled = true;
  });
</script>

<div class="domain-card" class:domain-card--disabled={disabled}>
  <div class="domain-card__head">
    <h3>{$_("admin.maintenance.domain.title")}</h3>
  </div>
  <p class="domain-card__desc">{$_("admin.maintenance.domain.description")}</p>

  {#if disabled}
    <p class="domain-card__reason" role="note">{reason}</p>
  {:else}
    <form
      class="domain-form"
      onsubmit={(e) => {
        e.preventDefault();
        openConfirm();
      }}
    >
      <!-- Domain -->
      <div class="form-group">
        <label for="reconfigure-domain">
          {$_("admin.maintenance.domain.domainLabel")}
        </label>
        <input
          id="reconfigure-domain"
          type="text"
          bind:value={domain}
          class:error={Boolean(errors.domain)}
          placeholder={$_("admin.maintenance.domain.domainPlaceholder")}
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          disabled={running}
          aria-describedby="reconfigure-domain-hint"
          oninput={() => {
            if (errors.domain) errors = { ...errors, domain: validateDomain(domain) };
          }}
        />
        <span id="reconfigure-domain-hint" class="form-hint">
          {$_("admin.maintenance.domain.domainHint")}
        </span>
        {#if errors.domain}
          <span class="error-text">{errors.domain}</span>
        {/if}
      </div>

      <!-- SSL mode (segmented) -->
      <div class="form-group">
        <span class="form-group__label">{$_("admin.maintenance.domain.sslMode")}</span>
        <div class="segmented" role="radiogroup" aria-label={$_("admin.maintenance.domain.sslMode")}>
          {#each [["letsencrypt", "sslLetsencrypt"], ["selfsigned", "sslSelfsigned"], ["none", "sslNone"]] as [mode, labelKey] (mode)}
            <button
              type="button"
              class="segmented__option"
              class:segmented__option--active={sslMode === mode}
              role="radio"
              aria-checked={sslMode === mode}
              disabled={running}
              onclick={() => (sslMode = mode as SslMode)}
            >
              {$_(`admin.maintenance.domain.${labelKey}`)}
            </button>
          {/each}
        </div>
      </div>

      <!-- Conditional: Let's Encrypt → email + prereq checklist -->
      {#if sslMode === "letsencrypt"}
        <div class="form-group">
          <label for="reconfigure-email">
            {$_("admin.maintenance.domain.emailLabel")}
          </label>
          <input
            id="reconfigure-email"
            type="email"
            bind:value={email}
            class:error={Boolean(errors.email)}
            placeholder={$_("admin.maintenance.domain.emailPlaceholder")}
            disabled={running}
            aria-describedby="reconfigure-email-hint"
            oninput={() => {
              if (errors.email) errors = { ...errors, email: validateEmail(email) };
            }}
          />
          <span id="reconfigure-email-hint" class="form-hint">
            {$_("admin.maintenance.domain.emailHint")}
          </span>
          {#if errors.email}
            <span class="error-text">{errors.email}</span>
          {/if}
        </div>

        <fieldset class="prereq">
          <legend>{$_("admin.maintenance.domain.prereqTitle")}</legend>
          <label class="prereq__item">
            <input type="checkbox" bind:checked={ackDns} disabled={running} />
            <span>{$_("admin.maintenance.domain.prereqDns")}</span>
          </label>
          <label class="prereq__item">
            <input type="checkbox" bind:checked={ackPorts} disabled={running} />
            <span>{$_("admin.maintenance.domain.prereqPorts")}</span>
          </label>
          <label class="prereq__item">
            <input type="checkbox" bind:checked={ackProxy} disabled={running} />
            <span>{$_("admin.maintenance.domain.prereqProxy")}</span>
          </label>
        </fieldset>
      {/if}

      <!-- Conditional: self-signed → days -->
      {#if sslMode === "selfsigned"}
        <div class="form-group">
          <label for="reconfigure-days">
            {$_("admin.maintenance.domain.selfSignedDaysLabel")}
          </label>
          <input
            id="reconfigure-days"
            type="number"
            min="1"
            bind:value={selfSignedDays}
            class:error={Boolean(errors.selfSignedDays)}
            disabled={running}
            aria-describedby="reconfigure-days-hint"
            oninput={() => {
              if (errors.selfSignedDays)
                errors = { ...errors, selfSignedDays: validateDays(selfSignedDays) };
            }}
          />
          <span id="reconfigure-days-hint" class="form-hint">
            {$_("admin.maintenance.domain.selfSignedDaysHint")}
          </span>
          {#if errors.selfSignedDays}
            <span class="error-text">{errors.selfSignedDays}</span>
          {/if}
        </div>
      {/if}

      <!-- Conditional: none → note -->
      {#if sslMode === "none"}
        <p class="ssl-none-note" role="note">
          {$_("admin.maintenance.domain.sslNoneNote")}
        </p>
      {/if}

      <div class="domain-form__actions">
        <button
          type="submit"
          class="btn-primary"
          disabled={running || !prereqsMet}
        >
          {#if running}
            <span class="btn-spinner" aria-hidden="true"></span>
          {/if}
          {$_("admin.maintenance.domain.apply")}
        </button>
      </div>
    </form>

    <!-- Verify-then-go readiness state -->
    {#if verifyState !== "idle"}
      <div class="verify" role="status" aria-live="polite">
        <div class="verify__head">
          {#if verifyState === "checking"}
            <span class="verify__hourglass" aria-hidden="true">⏳</span>
            <p class="verify__text">
              {$_("admin.maintenance.domain.verify.checking", {
                values: { origin: verifyOrigin },
              })}
            </p>
          {:else if verifyState === "reachable"}
            <span class="verify__icon verify__icon--ok" aria-hidden="true">✓</span>
            <p class="verify__text">
              {$_("admin.maintenance.domain.verify.reachable")}
            </p>
          {:else if verifyState === "timeout"}
            <span class="verify__icon verify__icon--warn" aria-hidden="true">⚠</span>
            <p class="verify__text">
              {$_("admin.maintenance.domain.verify.timeout")}
            </p>
          {/if}
        </div>

        <p class="verify__session-warning">
          {$_("admin.maintenance.domain.verify.sessionWarning")}
        </p>

        <div class="verify__actions">
          {#if verifyState === "timeout"}
            <button type="button" class="btn-secondary" onclick={retryVerify}>
              {$_("admin.maintenance.domain.verify.retryCheck")}
            </button>
            <button type="button" class="btn-secondary" onclick={goToNewAddress}>
              {$_("admin.maintenance.domain.verify.openAnyway")}
            </button>
          {:else}
            <button
              type="button"
              class="btn-primary"
              disabled={verifyState !== "reachable"}
              onclick={goToNewAddress}
            >
              {$_("admin.maintenance.domain.verify.goToNewAddress", {
                values: { origin: verifyOrigin },
              })}
            </button>
          {/if}
        </div>
      </div>
    {/if}

    <!-- Output console (after any run; primary debugging artifact on failure) -->
    {#if result}
      <ReconfigureOutputConsole
        success={result.success}
        message={result.message}
        scriptPath={result.script_path}
        output={result.output}
      />
    {/if}
  {/if}
</div>

<ReconfigureConfirmModal
  bind:isOpen={confirmOpen}
  title={$_("admin.maintenance.domain.confirm.title")}
  warning={$_("admin.maintenance.domain.confirm.warning", {
    values: { domain: newOriginFor(domain) },
  })}
  confirmPhrase={domain.trim()}
  typeLabel={$_("admin.maintenance.domain.confirm.typeToConfirm")}
  confirmLabel={$_("admin.maintenance.domain.confirm.confirm")}
  {running}
  onconfirm={applyDomain}
  oncancel={() => (confirmOpen = false)}
/>

<style>
  .domain-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md);
  }

  .domain-card--disabled {
    opacity: 0.6;
  }

  .domain-card__head h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .domain-card__desc {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .domain-card__reason {
    margin: 0;
    font-size: 0.8125rem;
    color: #f59e0b;
  }

  .domain-form {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    margin-top: var(--space-sm);
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .form-group label,
  .form-group__label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .form-group input[type="text"],
  .form-group input[type="email"],
  .form-group input[type="number"] {
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--input-bg, rgba(0, 0, 0, 0.2));
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .form-group input:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 1px;
    border-color: var(--brand);
  }

  .form-group input.error {
    border-color: #ef4444;
  }

  .form-group input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .form-hint {
    font-size: 0.75rem;
    color: var(--text-secondary);
    opacity: 0.8;
  }

  .error-text {
    font-size: 0.75rem;
    color: #ef4444;
  }

  /* Segmented control for ssl_mode */
  .segmented {
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: var(--radius-md);
    background: rgba(0, 0, 0, 0.25);
    border: 1px solid var(--glass-stroke-dark);
    align-self: flex-start;
  }

  .segmented__option {
    padding: 0.375rem 0.875rem;
    border: none;
    border-radius: calc(var(--radius-md) - 2px);
    background: transparent;
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .segmented__option:hover:not(:disabled) {
    color: var(--text-primary);
  }

  .segmented__option--active {
    background: var(--brand);
    color: #fff;
  }

  .segmented__option:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .segmented__option:disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  /* Pre-requisite checklist */
  .prereq {
    margin: 0;
    border: 1px solid rgba(245, 158, 11, 0.25);
    background: rgba(245, 158, 11, 0.06);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
  }

  .prereq legend {
    padding: 0 var(--space-xs);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .prereq__item {
    display: flex;
    gap: var(--space-sm);
    align-items: flex-start;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .prereq__item input {
    /* Override the global `input { width: 100% }` so the checkbox does not
       stretch across the flex row and crush the label text. */
    width: auto;
    margin-top: 0.15rem;
    flex-shrink: 0;
  }

  .ssl-none-note {
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(239, 68, 68, 0.08);
    color: #f59e0b;
    font-size: 0.8125rem;
  }

  .domain-form__actions {
    display: flex;
    justify-content: flex-start;
  }

  .btn-primary {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn-primary:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: domain-spin 0.7s linear infinite;
  }

  @keyframes domain-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Verify-then-go */
  .verify {
    display: flex;
    flex-direction: column;
    gap: var(--space-sm);
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    margin-top: var(--space-sm);
  }

  .verify__head {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
  }

  .verify__hourglass {
    font-size: 1.25rem;
    animation: hourglass-turn 1.8s ease-in-out infinite;
  }

  @keyframes hourglass-turn {
    0%,
    40% {
      transform: rotate(0deg);
    }
    50%,
    90% {
      transform: rotate(180deg);
    }
    100% {
      transform: rotate(180deg);
    }
  }

  .verify__icon {
    font-size: 1.125rem;
    font-weight: 700;
  }

  .verify__icon--ok {
    color: #34d399;
  }

  .verify__icon--warn {
    color: #f59e0b;
  }

  .verify__text {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-primary);
  }

  .verify__session-warning {
    margin: 0;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .verify__actions {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }
</style>
