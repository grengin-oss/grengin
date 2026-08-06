<!--
SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
SPDX-License-Identifier: Apache-2.0
-->

<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "svelte-routing";
  import { _ } from "svelte-i18n";
  import AdminPanelCard from "../AdminPanelCard.svelte";
  import LoadingSpinner from "../LoadingSpinner.svelte";
  import Forbidden from "../../../components/Forbidden.svelte";
  import DomainReconfigureCard from "./DomainReconfigureCard.svelte";
  import BinariesUpdateCard from "./BinariesUpdateCard.svelte";
  import { ApiError } from "../../../api/client.js";
  import { getLocalizedError } from "../../../utils/errorLocalization.js";
  import { permissionsStore } from "../../../features/auth/index.js";
  import {
    getReconfigureAvailable,
    type ReconfigureAvailableResponse,
    type ReconfigureScriptAvailability,
  } from "../../../api/admin/reconfigure.js";
  import type { HealthStatus } from "../../../api/admin/systemMetrics.js";

  interface MaintenanceTabProps {
    /** Lifted from the page so the version deep-link and this tab agree. */
    healthData?: HealthStatus | null;
    /**
     * Runs `fn` with the Metrics auto-refresh interval suspended for the
     * duration (and resumed + re-fetched afterward). Reconfigure runs added in
     * the follow-up cards go through this so background metrics polling does not
     * fight a service restart. Scaffolded here; wired to the placeholder
     * actions below until the full Domain/Binaries cards land.
     */
    runWithAutoRefreshSuspended?: <T>(fn: () => Promise<T>) => Promise<T>;
    /**
     * Lifts freshly-polled health after an API-only binaries update so the
     * page's version badge agrees with the Binaries card.
     */
    onhealthrefresh?: (health: HealthStatus) => void;
  }

  let {
    healthData = null,
    runWithAutoRefreshSuspended = (fn) => fn(),
    onhealthrefresh,
  }: MaintenanceTabProps = $props();

  const canMaintain = $derived(permissionsStore.canMaintainSystem());

  let isLoading = $state(true);
  let forbidden = $state(false);
  let error = $state<string | null>(null);
  let available = $state<ReconfigureAvailableResponse | null>(null);
  let showAdvanced = $state(false);

  // Neither root nor sudo → the host cannot run any reconfigure script.
  const noPrivilege = $derived(
    !!available && !available.running_as_root && !available.sudo_available
  );

  async function loadPreflight() {
    isLoading = true;
    error = null;
    forbidden = false;
    try {
      available = await getReconfigureAvailable();
    } catch (err: unknown) {
      if (err instanceof ApiError && err.status === 403) {
        forbidden = true;
      } else {
        error =
          err instanceof ApiError
            ? getLocalizedError(err, "description", $_)
            : $_("admin.maintenance.preflight.loadError");
      }
      console.error("Reconfigure preflight fetch error:", err);
    } finally {
      isLoading = false;
    }
  }

  // Lazy: this component is only mounted when the Maintenance tab is opened,
  // so mounting is the "first open" the PRD calls for.
  onMount(loadPreflight);
</script>

{#if !canMaintain}
  <!-- Defensive guard: the tab is already hidden for non-holders, but guard the
       body too so a direct render can never expose maintenance controls. -->
  <Forbidden />
{:else}
  <section
    class="maintenance-tab"
    aria-label={$_("admin.maintenance.title")}
  >
    <header class="maintenance-header">
      <h2 class="maintenance-title">{$_("admin.maintenance.title")}</h2>
      <p class="maintenance-subtitle">{$_("admin.maintenance.subtitle")}</p>
    </header>

    {#if isLoading}
      <div
        class="maintenance-status"
        role="status"
        aria-live="polite"
        aria-label={$_("admin.maintenance.preflight.checking")}
      >
        <LoadingSpinner />
        <p>{$_("admin.maintenance.preflight.checking")}</p>
      </div>
    {:else if forbidden}
      <Forbidden />
    {:else if error}
      <AdminPanelCard>
        <div class="maintenance-error" role="alert" aria-live="assertive">
          <p class="maintenance-error__message">{error}</p>
          <button class="btn-primary" onclick={loadPreflight}>
            {$_("admin.maintenance.preflight.recheck")}
          </button>
        </div>
      </AdminPanelCard>
    {:else if available}
      <!-- ===== Preflight banner ===== -->
      <AdminPanelCard>
        <div class="preflight" role="status" aria-live="polite">
          <div class="preflight__row">
            <span class="preflight__label">{$_("admin.maintenance.preflight.privilege")}</span>
            <div class="chips">
              <span class="chip" class:chip--ok={available.running_as_root} class:chip--off={!available.running_as_root}>
                {$_("admin.maintenance.preflight.runningAsRoot")}: {available.running_as_root ? $_("admin.maintenance.yes") : $_("admin.maintenance.no")}
              </span>
              <span class="chip" class:chip--ok={available.sudo_available} class:chip--off={!available.sudo_available}>
                {$_("admin.maintenance.preflight.sudoAvailable")}: {available.sudo_available ? $_("admin.maintenance.yes") : $_("admin.maintenance.no")}
              </span>
            </div>
            <button class="btn-recheck" onclick={loadPreflight}>
              {$_("admin.maintenance.preflight.recheck")}
            </button>
          </div>

          {#if noPrivilege}
            <p class="preflight__warning" role="alert">
              {$_("admin.maintenance.preflight.privilegeMissing")}
            </p>
          {/if}

          <button
            type="button"
            class="preflight__disclosure"
            aria-expanded={showAdvanced}
            onclick={() => (showAdvanced = !showAdvanced)}
          >
            {$_("admin.maintenance.preflight.advancedDetails")}
          </button>
          {#if showAdvanced}
            <dl class="preflight__details">
              {#each [["admin.maintenance.domain.title", available.domain], ["admin.maintenance.binaries.title", available.binaries]] as [labelKey, script] (labelKey)}
                {@const s = script as ReconfigureScriptAvailability}
                <div class="preflight__detail-group">
                  <dt>{$_(labelKey as string)}</dt>
                  <dd>
                    <code>{s.script_path}</code>
                    <span class="detail-flag">{$_("admin.maintenance.preflight.exists")}: {s.exists ? $_("admin.maintenance.yes") : $_("admin.maintenance.no")}</span>
                    <span class="detail-flag">{$_("admin.maintenance.preflight.executable")}: {s.executable ? $_("admin.maintenance.yes") : $_("admin.maintenance.no")}</span>
                    <span class="detail-flag">{$_("admin.maintenance.preflight.effectiveSudo")}: {s.effective_use_sudo ? $_("admin.maintenance.yes") : $_("admin.maintenance.no")}</span>
                    {#if s.reason}
                      <span class="detail-flag detail-flag--reason">{$_("admin.maintenance.preflight.reason")}: {s.reason}</span>
                    {/if}
                  </dd>
                </div>
              {/each}
            </dl>
          {/if}
        </div>
      </AdminPanelCard>

      <!-- ===== Domain & TLS card ===== -->
      {@const domainEnabled = available.domain.available && !noPrivilege}
      <AdminPanelCard>
        <DomainReconfigureCard
          availability={available.domain}
          disabled={!domainEnabled}
          {runWithAutoRefreshSuspended}
          onsuccess={loadPreflight}
        />
      </AdminPanelCard>

      <!-- ===== Application Updates card ===== -->
      {@const binariesEnabled = available.binaries.available && !noPrivilege}
      <AdminPanelCard>
        <BinariesUpdateCard
          availability={available.binaries}
          disabled={!binariesEnabled}
          currentVersion={healthData?.version ?? null}
          {runWithAutoRefreshSuspended}
          onsuccess={loadPreflight}
          {onhealthrefresh}
        />
      </AdminPanelCard>

      <!-- ===== Secondary CTA: view audit trail ===== -->
      <div class="maintenance-footer">
        <button
          type="button"
          class="btn-link"
          onclick={() => navigate("/admin/audit-logs")}
        >
          {$_("admin.maintenance.viewAuditLogs")}
        </button>
      </div>
    {/if}
  </section>
{/if}

<style>
  .maintenance-tab {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
  }

  .maintenance-footer {
    display: flex;
    justify-content: flex-end;
  }

  .btn-link {
    background: none;
    border: none;
    padding: 0;
    color: var(--brand);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .btn-link:hover {
    text-decoration: underline;
  }

  .btn-link:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .maintenance-header {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .maintenance-title {
    font-size: 1.125rem;
    font-weight: 700;
    color: var(--text-primary);
    margin: 0;
    letter-spacing: -0.02em;
  }

  .maintenance-subtitle {
    font-size: 0.875rem;
    color: var(--text-secondary);
    margin: 0;
  }

  .maintenance-status {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-md);
    padding: var(--space-3xl);
    color: var(--text-secondary);
  }

  .maintenance-error {
    display: flex;
    flex-direction: column;
    gap: var(--space-lg);
    align-items: flex-start;
    padding: var(--space-lg);
  }

  .maintenance-error__message {
    color: var(--brand-red);
    margin: 0;
  }

  /* ===== Preflight ===== */
  .preflight {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md);
  }

  .preflight__row {
    display: flex;
    align-items: center;
    gap: var(--space-md);
    flex-wrap: wrap;
  }

  .preflight__label {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--text-secondary);
  }

  .chips {
    display: flex;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .chip {
    display: inline-flex;
    align-items: center;
    padding: 0.1875rem 0.625rem;
    border-radius: var(--radius-sm);
    font-size: 0.75rem;
    font-weight: 600;
  }

  .chip--ok {
    background: rgba(52, 211, 153, 0.12);
    color: #34d399;
  }

  .chip--off {
    background: rgba(239, 68, 68, 0.1);
    color: #ef4444;
  }

  .btn-recheck {
    margin-inline-start: auto;
    padding: 0.375rem 0.75rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--btn-secondary);
    color: var(--text-secondary);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-recheck:hover {
    color: var(--brand);
    border-color: var(--brand);
  }

  .btn-recheck:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .preflight__warning {
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(239, 68, 68, 0.08);
    color: #ef4444;
    font-size: 0.875rem;
  }

  .preflight__disclosure {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    color: var(--brand);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .preflight__disclosure:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .preflight__details {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    margin: 0;
  }

  .preflight__detail-group {
    display: flex;
    flex-direction: column;
    gap: var(--space-xs);
  }

  .preflight__detail-group dt {
    font-weight: 600;
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .preflight__detail-group dd {
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-sm);
    align-items: center;
  }

  .preflight__detail-group code {
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .detail-flag {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  .detail-flag--reason {
    color: #f59e0b;
  }
</style>
