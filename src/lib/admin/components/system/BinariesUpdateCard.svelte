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
    updateBinaries,
    type ReconfigureScriptAvailability,
    type BinariesUpdateRequest,
    type BinariesUpdateResponse,
    type ReconfigureArch,
  } from "../../../api/admin/reconfigure.js";
  import {
    getHealthStatus,
    type HealthStatus,
  } from "../../../api/admin/systemMetrics.js";

  interface Props {
    availability: ReconfigureScriptAvailability;
    /** Disabled when the script is unavailable OR the host has no privilege. */
    disabled: boolean;
    /** Current running version (from `getHealthStatus()`), for the header. */
    currentVersion?: string | null;
    runWithAutoRefreshSuspended: <T>(fn: () => Promise<T>) => Promise<T>;
    /** Called after any successful run so the preflight can be re-fetched. */
    onsuccess: () => void;
    /**
     * Called with the freshly-polled health after an API-only update so the
     * page can lift its `healthData` and the version badge agrees with the card.
     */
    onhealthrefresh?: (health: HealthStatus) => void;
  }

  let {
    availability,
    disabled,
    currentVersion = null,
    runWithAutoRefreshSuspended,
    onsuccess,
    onhealthrefresh,
  }: Props = $props();

  // ---- Form state ----
  let version = $state("latest");
  // `release_base_url` is a root-level supply-chain-sensitive field (PRD §17 C
  // is still open on a server default / allowlist). Until that is decided we
  // keep it optional free-text, blank by default: blank → omit from the body so
  // the host script falls back to its built-in default release source.
  let releaseBaseUrl = $state("");
  // "" → auto-detect (send `null`); otherwise the chosen arch.
  let arch = $state<"" | ReconfigureArch>("");
  let updateApi = $state(true);
  let updateWebapp = $state(true);
  let updateInstaller = $state(false);
  let verifyChecksums = $state(true);
  let apiServiceName = $state("");
  let showAdvanced = $state(false);

  type FieldErrors = { version?: string; releaseBaseUrl?: string };
  let errors = $state<FieldErrors>({});

  // ---- Run state ----
  let confirmOpen = $state(false);
  let running = $state(false);
  let result = $state<BinariesUpdateResponse | null>(null);

  // ---- Post-update state ----
  // "idle" — no run yet / installer-only run finished.
  // "reload" — webapp was replaced; the running SPA is stale, force a reload.
  // "waiting" — API-only update; poll health until the service is back.
  // "back" — API came back; show the new version.
  type PostState = "idle" | "reload" | "waiting" | "back";
  let postState = $state<PostState>("idle");
  let newVersion = $state<string | null>(null);
  let pollCancelled = false;

  const WAIT_MAX_MS = 120_000;
  const WAIT_START_DELAY_MS = 2_000;
  const WAIT_MAX_DELAY_MS = 8_000;

  const reason = $derived(
    availability.reason ?? $_("admin.maintenance.binaries.unavailable")
  );

  // At least one update target is required before the run is allowed.
  const hasTarget = $derived(updateApi || updateWebapp || updateInstaller);

  // Show a "current → target" line once a concrete target version is known.
  const targetVersion = $derived(version.trim() || "latest");

  // ---- Validation ----
  function validateVersion(value: string): string | undefined {
    const v = value.trim();
    if (!v) return $_("admin.maintenance.binaries.versionRequired");
    // "latest" or a semver-ish tag (vX.Y.Z / X.Y.Z, optional pre-release).
    if (v !== "latest" && !/^v?\d+(\.\d+){0,2}(-[0-9A-Za-z.-]+)?$/.test(v))
      return $_("admin.maintenance.binaries.versionInvalid");
    return undefined;
  }

  function validateReleaseUrl(value: string): string | undefined {
    const v = value.trim();
    if (!v) return undefined; // optional → host default
    let url: URL;
    try {
      url = new URL(v);
    } catch {
      return $_("admin.maintenance.binaries.releaseBaseUrlInvalid");
    }
    if (url.protocol !== "https:")
      return $_("admin.maintenance.binaries.releaseBaseUrlInsecure");
    return undefined;
  }

  function validate(): boolean {
    const next: FieldErrors = {
      version: validateVersion(version),
      releaseBaseUrl: validateReleaseUrl(releaseBaseUrl),
    };
    errors = next;
    return !next.version && !next.releaseBaseUrl;
  }

  function openConfirm() {
    if (running || disabled) return;
    if (!hasTarget) return;
    if (!validate()) return;
    confirmOpen = true;
  }

  // ---- Apply ----
  async function applyUpdate() {
    confirmOpen = false;
    running = true;
    result = null;
    postState = "idle";
    newVersion = null;

    // Capture the requested targets up-front: a connection drop during the
    // restart can leave us without a response to read them from.
    const wantedWebapp = updateWebapp;
    const wantedApi = updateApi;

    const body: BinariesUpdateRequest = {
      version: version.trim() || "latest",
      update_api: updateApi,
      update_webapp: updateWebapp,
      update_installer: updateInstaller,
      verify_checksums: verifyChecksums,
    };
    const url = releaseBaseUrl.trim();
    if (url) body.release_base_url = url;
    if (arch) body.arch = arch;
    const svc = apiServiceName.trim();
    if (svc) body.api_service_name = svc;

    try {
      const response = await runWithAutoRefreshSuspended(() =>
        updateBinaries(body)
      );
      result = response;
      if (response.success) {
        // PRD: re-fetch availability after any successful operation.
        onsuccess();
        handlePostUpdate(response.update_webapp, response.update_api);
      }
      // success === false → console renders message + output; form stays.
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 503) {
          toast.error($_("admin.maintenance.binaries.serviceUnavailable"));
        } else {
          toast.error(getLocalizedError(err, "description", $_));
        }
        console.error("Binaries update error:", err);
      } else {
        // Network error: the service restart likely dropped the in-flight
        // connection. The change probably applied, so move into the same
        // post-update handling using the requested targets.
        console.warn(
          "Binaries update POST connection dropped — entering post-update handling:",
          err
        );
        handlePostUpdate(wantedWebapp, wantedApi);
      }
    } finally {
      running = false;
    }
  }

  // ---- Post-update handling ----
  function handlePostUpdate(webappUpdated: boolean, apiUpdated: boolean) {
    if (webappUpdated) {
      // The running frontend was replaced — never keep the stale SPA.
      postState = "reload";
    } else if (apiUpdated) {
      // API-only: wait for the service to come back, then show the new version.
      postState = "waiting";
      pollHealthUntilBack();
    } else {
      // Installer-only: nothing client-side to reconcile.
      postState = "idle";
    }
  }

  function sleep(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  async function pollHealthUntilBack() {
    pollCancelled = false;
    const deadline = Date.now() + WAIT_MAX_MS;
    let delay = WAIT_START_DELAY_MS;

    // Brief initial wait — the service has just been told to restart.
    await sleep(delay);

    while (!pollCancelled && Date.now() < deadline) {
      try {
        const health = await getHealthStatus();
        if (pollCancelled) return;
        newVersion = health.version;
        postState = "back";
        // Lift the new health so the page version badge agrees.
        onhealthrefresh?.(health);
        return;
      } catch {
        // Not back yet — keep polling with backoff.
      }
      if (pollCancelled) return;
      await sleep(delay);
      delay = Math.min(delay * 1.5, WAIT_MAX_DELAY_MS);
    }
    // Timed out: leave the result console visible; operator can re-check.
    if (!pollCancelled) postState = "idle";
  }

  function hardReload() {
    // Cache-bust so the browser fetches the freshly-installed assets, not a
    // cached stale SPA shell.
    const u = new URL(window.location.href);
    u.searchParams.set("_v", Date.now().toString());
    window.location.assign(u.toString());
  }

  onDestroy(() => {
    pollCancelled = true;
  });
</script>

<div class="binaries-card" class:binaries-card--disabled={disabled}>
  <div class="binaries-card__head">
    <h3>{$_("admin.maintenance.binaries.title")}</h3>
  </div>
  <p class="binaries-card__desc">
    {$_("admin.maintenance.binaries.description")}
  </p>

  <!-- Current version + current → target -->
  <p class="binaries-card__version">
    {$_("admin.maintenance.binaries.currentVersion")}:
    {#if currentVersion}
      <code>v{currentVersion}</code>
    {:else}
      <span class="binaries-card__version-unknown"
        >{$_("admin.maintenance.binaries.versionUnknown")}</span
      >
    {/if}
    {#if !disabled && targetVersion}
      <span class="binaries-card__arrow" aria-hidden="true">→</span>
      <code>{targetVersion}</code>
    {/if}
  </p>

  {#if disabled}
    <p class="binaries-card__reason" role="note">{reason}</p>
  {:else}
    <form
      class="binaries-form"
      onsubmit={(e) => {
        e.preventDefault();
        openConfirm();
      }}
    >
      <!-- Version -->
      <div class="form-group">
        <label for="binaries-version">
          {$_("admin.maintenance.binaries.version")}
        </label>
        <input
          id="binaries-version"
          type="text"
          bind:value={version}
          class:error={Boolean(errors.version)}
          placeholder="latest"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          disabled={running}
          aria-describedby="binaries-version-hint"
          oninput={() => {
            if (errors.version)
              errors = { ...errors, version: validateVersion(version) };
          }}
        />
        <span id="binaries-version-hint" class="form-hint">
          {$_("admin.maintenance.binaries.versionHint")}
        </span>
        {#if errors.version}
          <span class="error-text">{errors.version}</span>
        {/if}
      </div>

      <!-- Release base URL (optional) -->
      <div class="form-group">
        <label for="binaries-release-url">
          {$_("admin.maintenance.binaries.releaseBaseUrl")}
        </label>
        <input
          id="binaries-release-url"
          type="text"
          bind:value={releaseBaseUrl}
          class:error={Boolean(errors.releaseBaseUrl)}
          placeholder={$_("admin.maintenance.binaries.releaseBaseUrlPlaceholder")}
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          disabled={running}
          aria-describedby="binaries-release-url-hint"
          oninput={() => {
            if (errors.releaseBaseUrl)
              errors = {
                ...errors,
                releaseBaseUrl: validateReleaseUrl(releaseBaseUrl),
              };
          }}
        />
        <span id="binaries-release-url-hint" class="form-hint">
          {$_("admin.maintenance.binaries.releaseBaseUrlHint")}
        </span>
        {#if errors.releaseBaseUrl}
          <span class="error-text">{errors.releaseBaseUrl}</span>
        {/if}
      </div>

      <!-- Architecture -->
      <div class="form-group">
        <label for="binaries-arch">
          {$_("admin.maintenance.binaries.arch")}
        </label>
        <select id="binaries-arch" bind:value={arch} disabled={running}>
          <option value="">{$_("admin.maintenance.binaries.archAuto")}</option>
          <option value="x86_64">x86_64</option>
          <option value="aarch64">aarch64</option>
        </select>
      </div>

      <!-- Update targets -->
      <fieldset class="targets">
        <legend>{$_("admin.maintenance.binaries.targets")}</legend>

        <div class="toggle-row">
          <button
            type="button"
            class="status-toggle"
            class:active={updateApi}
            role="switch"
            aria-checked={updateApi}
            aria-label={$_("admin.maintenance.binaries.updateApi")}
            disabled={running}
            onclick={() => (updateApi = !updateApi)}
          >
            <span class="toggle-slider"></span>
          </button>
          <span class="toggle-text">
            <span class="toggle-text__label"
              >{$_("admin.maintenance.binaries.updateApi")}</span
            >
            <span class="toggle-text__hint"
              >{$_("admin.maintenance.binaries.updateApiHint")}</span
            >
          </span>
        </div>

        <div class="toggle-row">
          <button
            type="button"
            class="status-toggle"
            class:active={updateWebapp}
            role="switch"
            aria-checked={updateWebapp}
            aria-label={$_("admin.maintenance.binaries.updateWebapp")}
            disabled={running}
            onclick={() => (updateWebapp = !updateWebapp)}
          >
            <span class="toggle-slider"></span>
          </button>
          <span class="toggle-text">
            <span class="toggle-text__label"
              >{$_("admin.maintenance.binaries.updateWebapp")}</span
            >
            <span class="toggle-text__hint"
              >{$_("admin.maintenance.binaries.updateWebappHint")}</span
            >
          </span>
        </div>

        <div class="toggle-row">
          <button
            type="button"
            class="status-toggle"
            class:active={updateInstaller}
            role="switch"
            aria-checked={updateInstaller}
            aria-label={$_("admin.maintenance.binaries.updateInstaller")}
            disabled={running}
            onclick={() => (updateInstaller = !updateInstaller)}
          >
            <span class="toggle-slider"></span>
          </button>
          <span class="toggle-text">
            <span class="toggle-text__label"
              >{$_("admin.maintenance.binaries.updateInstaller")}</span
            >
            <span class="toggle-text__hint"
              >{$_("admin.maintenance.binaries.updateInstallerHint")}</span
            >
          </span>
        </div>

        {#if !hasTarget}
          <p class="targets__warning" role="alert">
            {$_("admin.maintenance.binaries.noTarget")}
          </p>
        {/if}
      </fieldset>

      <!-- Verify checksums -->
      <div class="toggle-row">
        <button
          type="button"
          class="status-toggle"
          class:active={verifyChecksums}
          role="switch"
          aria-checked={verifyChecksums}
          aria-label={$_("admin.maintenance.binaries.verifyChecksums")}
          disabled={running}
          onclick={() => (verifyChecksums = !verifyChecksums)}
        >
          <span class="toggle-slider"></span>
        </button>
        <span class="toggle-text">
          <span class="toggle-text__label"
            >{$_("admin.maintenance.binaries.verifyChecksums")}</span
          >
          <span class="toggle-text__hint"
            >{$_("admin.maintenance.binaries.verifyChecksumsHint")}</span
          >
        </span>
      </div>
      {#if !verifyChecksums}
        <p class="checksums-warning" role="alert">
          {$_("admin.maintenance.binaries.verifyChecksumsWarning")}
        </p>
      {/if}

      <!-- Advanced -->
      <button
        type="button"
        class="advanced-toggle"
        aria-expanded={showAdvanced}
        onclick={() => (showAdvanced = !showAdvanced)}
      >
        {$_("admin.maintenance.binaries.advanced")}
      </button>
      {#if showAdvanced}
        <div class="form-group">
          <label for="binaries-service-name">
            {$_("admin.maintenance.binaries.apiServiceName")}
          </label>
          <input
            id="binaries-service-name"
            type="text"
            bind:value={apiServiceName}
            placeholder="grengin-api"
            autocomplete="off"
            autocapitalize="off"
            autocorrect="off"
            spellcheck="false"
            disabled={running}
            aria-describedby="binaries-service-name-hint"
          />
          <span id="binaries-service-name-hint" class="form-hint">
            {$_("admin.maintenance.binaries.apiServiceNameHint")}
          </span>
        </div>
      {/if}

      <div class="binaries-form__actions">
        <button
          type="submit"
          class="btn-primary"
          disabled={running || !hasTarget}
        >
          {#if running}
            <span class="btn-spinner" aria-hidden="true"></span>
          {/if}
          {$_("admin.maintenance.binaries.update")}
        </button>
      </div>
    </form>

    <!-- Post-update state -->
    {#if postState === "reload"}
      <div class="post" role="status" aria-live="polite">
        <p class="post__text">
          {$_("admin.maintenance.binaries.result.reloadPrompt")}
        </p>
        <button type="button" class="btn-primary" onclick={hardReload}>
          {$_("admin.maintenance.binaries.result.reload")}
        </button>
      </div>
    {:else if postState === "waiting"}
      <div class="post" role="status" aria-live="polite">
        <span class="post__spinner" aria-hidden="true"></span>
        <p class="post__text">
          {$_("admin.maintenance.binaries.result.waitingForApi")}
        </p>
      </div>
    {:else if postState === "back"}
      <div class="post" role="status" aria-live="polite">
        <span class="post__icon" aria-hidden="true">✓</span>
        <p class="post__text">
          {$_("admin.maintenance.binaries.result.newVersion", {
            values: { version: newVersion ?? "" },
          })}
        </p>
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
  title={$_("admin.maintenance.binaries.confirm.title")}
  warning={$_("admin.maintenance.binaries.confirm.warning")}
  confirmPhrase="CONFIRM"
  typeLabel={$_("admin.maintenance.binaries.confirm.typeToConfirm")}
  confirmLabel={$_("admin.maintenance.binaries.confirm.confirm")}
  {running}
  onconfirm={applyUpdate}
  oncancel={() => (confirmOpen = false)}
/>

<style>
  .binaries-card {
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
    padding: var(--space-md);
  }

  .binaries-card--disabled {
    opacity: 0.6;
  }

  .binaries-card__head h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .binaries-card__desc {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
  }

  .binaries-card__version {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
  }

  .binaries-card__version code {
    font-family: "SF Mono", "Menlo", "Consolas", monospace;
    color: var(--text-primary);
  }

  .binaries-card__version-unknown {
    font-style: italic;
    opacity: 0.8;
  }

  .binaries-card__arrow {
    color: var(--brand);
    font-weight: 700;
  }

  .binaries-card__reason {
    margin: 0;
    font-size: 0.8125rem;
    color: #f59e0b;
  }

  .binaries-form {
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

  .form-group label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-secondary);
  }

  .form-group input[type="text"],
  .form-group select {
    padding: 0.625rem 0.75rem;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    background: var(--input-bg, rgba(0, 0, 0, 0.2));
    color: var(--text-primary);
    font-size: 0.875rem;
  }

  .form-group input:focus-visible,
  .form-group select:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 1px;
    border-color: var(--brand);
  }

  .form-group input.error {
    border-color: #ef4444;
  }

  .form-group input:disabled,
  .form-group select:disabled {
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

  /* Update targets */
  .targets {
    margin: 0;
    border: 1px solid var(--glass-stroke-dark);
    border-radius: var(--radius-md);
    padding: var(--space-md);
    display: flex;
    flex-direction: column;
    gap: var(--space-md);
  }

  .targets legend {
    padding: 0 var(--space-xs);
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .targets__warning {
    margin: 0;
    font-size: 0.75rem;
    color: #f59e0b;
  }

  .toggle-row {
    display: flex;
    align-items: flex-start;
    gap: var(--space-md);
  }

  .toggle-text {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .toggle-text__label {
    font-size: 0.8125rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  .toggle-text__hint {
    font-size: 0.75rem;
    color: var(--text-secondary);
  }

  /* Toggle switch — mirrors MCPServers.svelte's status-toggle. */
  .status-toggle {
    position: relative;
    flex-shrink: 0;
    width: 2.25rem;
    height: 1.25rem;
    padding: 0;
    border: none;
    border-radius: 100px;
    background: rgba(255, 255, 255, 0.15);
    cursor: pointer;
    transition: background 0.2s ease;
    margin-top: 0.0625rem;
  }

  .status-toggle.active {
    background: var(--brand);
  }

  .status-toggle:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .status-toggle:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .toggle-slider {
    position: absolute;
    top: 0.1875rem;
    inset-inline-start: 0.1875rem;
    width: 0.875rem;
    height: 0.875rem;
    border-radius: 50%;
    background: #fff;
    transition: transform 0.2s ease;
  }

  .status-toggle.active .toggle-slider {
    transform: translateX(1rem);
  }

  .checksums-warning {
    margin: 0;
    padding: var(--space-sm) var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(245, 158, 11, 0.08);
    color: #f59e0b;
    font-size: 0.8125rem;
  }

  .advanced-toggle {
    align-self: flex-start;
    background: none;
    border: none;
    padding: 0;
    color: var(--brand);
    font-size: 0.8125rem;
    font-weight: 500;
    cursor: pointer;
  }

  .advanced-toggle:focus-visible {
    outline: 2px solid var(--brand-ring);
    outline-offset: 2px;
  }

  .binaries-form__actions {
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

  .btn-spinner,
  .post__spinner {
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid rgba(255, 255, 255, 0.4);
    border-top-color: #fff;
    border-radius: 50%;
    animation: binaries-spin 0.7s linear infinite;
  }

  @keyframes binaries-spin {
    to {
      transform: rotate(360deg);
    }
  }

  /* Post-update state */
  .post {
    display: flex;
    align-items: center;
    gap: var(--space-sm);
    flex-wrap: wrap;
    padding: var(--space-md);
    border-radius: var(--radius-md);
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid rgba(255, 255, 255, 0.1);
    margin-top: var(--space-sm);
  }

  .post__text {
    margin: 0;
    font-size: 0.875rem;
    color: var(--text-primary);
    flex: 1;
    min-width: 0;
  }

  .post__icon {
    font-size: 1.125rem;
    font-weight: 700;
    color: #34d399;
  }
</style>
