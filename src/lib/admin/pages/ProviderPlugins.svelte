<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Check,
    FileJson,
    FlaskConical,
    LoaderCircle,
    Plus,
    Power,
    PowerOff,
    Trash2,
    Upload,
    X,
  } from '@lucide/svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import Modal from '../components/Modal.svelte';
  import LoadingSpinner from '../components/LoadingSpinner.svelte';
  import AdminEmptyState from '../components/AdminEmptyState.svelte';
  import { toast } from '../../components/Toaster.svelte';
  import { permissionsStore } from '../../features/auth/index.js';
  import {
    deleteProviderPlugin,
    disableProviderPlugin,
    enableProviderPlugin,
    getProviderPlugins,
    installProviderPlugin,
    testProviderPlugin,
    validateProviderPlugin,
    type ProviderPlugin,
    type ProviderPluginValidation,
  } from '../../api/admin/ProviderPlugins.js';

  let plugins = $state<ProviderPlugin[]>([]);
  let loading = $state(true);
  let loadError = $state(false);
  let installOpen = $state(false);
  let submitting = $state(false);
  let validating = $state(false);
  let activeAction = $state<string | null>(null);
  let validation = $state<ProviderPluginValidation | null>(null);
  let manifestText = $state('');
  let configurationText = $state('{}');
  let baseUrlOverride = $state('');
  let credentials = $state<Record<string, string>>({});
  let allowInsecureHttp = $state(false);
  let allowPrivateNetwork = $state(false);
  let enableAfterInstall = $state(false);

  const canManage = $derived(permissionsStore.canManageAiEngines());

  async function loadPlugins() {
    loading = true;
    loadError = false;
    try {
      plugins = await getProviderPlugins();
    } catch {
      loadError = true;
      toast.error('Failed to load provider plugins');
    } finally {
      loading = false;
    }
  }

  function resetInstall() {
    manifestText = '';
    configurationText = '{}';
    baseUrlOverride = '';
    credentials = {};
    validation = null;
    allowInsecureHttp = false;
    allowPrivateNetwork = false;
    enableAfterInstall = false;
  }

  function closeInstall() {
    installOpen = false;
    resetInstall();
  }

  function parseJson(value: string, field: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error(`${field} is not valid JSON`);
    }
  }

  async function handleFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    if (file.size > 1024 * 1024) {
      toast.error('Manifest exceeds the 1 MiB limit');
      input.value = '';
      return;
    }
    manifestText = await file.text();
    validation = null;
    input.value = '';
  }

  async function runValidation() {
    validating = true;
    validation = null;
    try {
      const manifest = parseJson(manifestText, 'Manifest');
      const configuration = parseJson(configurationText, 'Configuration');
      if (!configuration || Array.isArray(configuration) || typeof configuration !== 'object') {
        throw new Error('Configuration must be a JSON object');
      }
      const result = await validateProviderPlugin({
        manifest,
        configuration: configuration as Record<string, unknown>,
        baseUrlOverride: baseUrlOverride.trim() || null,
        allowInsecureHttp,
        allowPrivateNetwork,
      });
      validation = result;
      credentials = Object.fromEntries(
        result.credentialSlots.map((slot) => [slot.slotId, credentials[slot.slotId] ?? '']),
      );
      if (result.valid) toast.success('Manifest is valid');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Manifest validation failed');
    } finally {
      validating = false;
    }
  }

  async function installPlugin() {
    if (!validation?.valid) return;
    submitting = true;
    try {
      const manifest = parseJson(manifestText, 'Manifest');
      const configuration = parseJson(configurationText, 'Configuration') as Record<string, unknown>;
      await installProviderPlugin({
        manifest,
        configuration,
        credentials: Object.fromEntries(
          Object.entries(credentials).filter(([, value]) => value.length > 0),
        ),
        baseUrlOverride: baseUrlOverride.trim() || null,
        allowInsecureHttp,
        allowPrivateNetwork,
        enabled: enableAfterInstall,
      });
      toast.success('Provider plugin installed');
      closeInstall();
      await loadPlugins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Provider installation failed');
    } finally {
      submitting = false;
    }
  }

  async function togglePlugin(plugin: ProviderPlugin) {
    activeAction = plugin.providerKey;
    try {
      const updated = plugin.status === 'enabled'
        ? await disableProviderPlugin(plugin.providerKey)
        : await enableProviderPlugin(plugin.providerKey);
      plugins = plugins.map((item) => item.id === updated.id ? updated : item);
      toast.success(updated.status === 'enabled' ? 'Provider enabled' : 'Provider disabled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Provider update failed');
    } finally {
      activeAction = null;
    }
  }

  async function testConnection(plugin: ProviderPlugin) {
    activeAction = plugin.providerKey;
    try {
      const result = await testProviderPlugin(plugin.providerKey);
      if (result.valid) {
        const suffix = result.modelsAvailable === null ? '' : `, ${result.modelsAvailable} models`;
        toast.success(`Connection valid${suffix}`);
      } else {
        toast.error(`Connection failed: ${result.errorClass ?? 'provider error'}`);
      }
      await loadPlugins();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Connection test failed');
    } finally {
      activeAction = null;
    }
  }

  async function removePlugin(plugin: ProviderPlugin) {
    if (!window.confirm(`Delete ${plugin.name}?`)) return;
    activeAction = plugin.providerKey;
    try {
      await deleteProviderPlugin(plugin.providerKey);
      plugins = plugins.filter((item) => item.id !== plugin.id);
      toast.success('Provider plugin deleted');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Provider deletion failed');
    } finally {
      activeAction = null;
    }
  }

  function capabilityLabels(plugin: ProviderPlugin): string[] {
    const labels: string[] = [];
    if (plugin.capabilities.chat) labels.push('Chat');
    if (plugin.capabilities.embeddings) labels.push('Embeddings');
    if (plugin.capabilities.imageGeneration) labels.push('Images');
    if (plugin.capabilities.chat?.tools) labels.push('Tools');
    return labels;
  }

  onMount(loadPlugins);
</script>

<div class="provider-plugins-page">
  <PageHeader title="Provider plugins" subtitle="Declarative HTTP and SSE provider integrations">
    {#snippet children()}
      {#if canManage}
        <button class="primary-button" type="button" onclick={() => (installOpen = true)}>
          <Plus size={17} aria-hidden="true" />
          Install plugin
        </button>
      {/if}
    {/snippet}
  </PageHeader>

  {#if loading}
    <div class="page-state"><LoadingSpinner text="Loading provider plugins" /></div>
  {:else if loadError}
    <div class="page-state error-state">
      <p>Provider plugins could not be loaded.</p>
      <button class="secondary-button" type="button" onclick={loadPlugins}>Retry</button>
    </div>
  {:else if plugins.length === 0}
    <div class="page-state">
      <AdminEmptyState title="No provider plugins" message="Install a provider manifest to add it here.">
        {#snippet icon()}<FileJson size={30} aria-hidden="true" />{/snippet}
      </AdminEmptyState>
    </div>
  {:else}
    <section class="plugins-table-wrap" aria-label="Installed provider plugins">
      <table class="plugins-table">
        <thead>
          <tr>
            <th>Provider</th>
            <th>Destination</th>
            <th>Capabilities</th>
            <th>Credentials</th>
            <th>Status</th>
            {#if canManage}<th class="actions-heading">Actions</th>{/if}
          </tr>
        </thead>
        <tbody>
          {#each plugins as plugin (plugin.id)}
            <tr>
              <td data-label="Provider">
                <strong>{plugin.name}</strong>
                <span class="secondary-text">{plugin.providerKey} · v{plugin.version}</span>
              </td>
              <td data-label="Destination"><code class="destination">{plugin.destination}</code></td>
              <td data-label="Capabilities">
                <div class="capabilities">
                  {#each capabilityLabels(plugin) as capability}
                    <span>{capability}</span>
                  {/each}
                </div>
              </td>
              <td data-label="Credentials">
                {#if plugin.credentialSlots.length === 0}
                  <span class="secondary-text">None</span>
                {:else}
                  <div class="credential-statuses">
                    {#each plugin.credentialSlots as credential}
                      <span class:credential-valid={credential.status === 'valid'} class:credential-invalid={credential.status === 'invalid'}>
                        {credential.configured ? credential.slotId : `${credential.slotId} missing`}
                      </span>
                    {/each}
                  </div>
                {/if}
              </td>
              <td data-label="Status">
                <span class="status" class:enabled={plugin.status === 'enabled'} class:invalid={plugin.status === 'invalid'}>
                  {plugin.status}
                </span>
              </td>
              {#if canManage}
                <td data-label="Actions">
                  <div class="row-actions">
                    <button class="icon-button" type="button" title="Test connection" aria-label={`Test ${plugin.name}`} disabled={activeAction === plugin.providerKey} onclick={() => testConnection(plugin)}>
                      {#if activeAction === plugin.providerKey}<LoaderCircle class="spin" size={17} />{:else}<FlaskConical size={17} />{/if}
                    </button>
                    <button class="icon-button" type="button" title={plugin.status === 'enabled' ? 'Disable' : 'Enable'} aria-label={`${plugin.status === 'enabled' ? 'Disable' : 'Enable'} ${plugin.name}`} disabled={activeAction === plugin.providerKey} onclick={() => togglePlugin(plugin)}>
                      {#if plugin.status === 'enabled'}<PowerOff size={17} />{:else}<Power size={17} />{/if}
                    </button>
                    <button class="icon-button danger" type="button" title="Delete" aria-label={`Delete ${plugin.name}`} disabled={activeAction === plugin.providerKey} onclick={() => removePlugin(plugin)}>
                      <Trash2 size={17} />
                    </button>
                  </div>
                </td>
              {/if}
            </tr>
          {/each}
        </tbody>
      </table>
    </section>
  {/if}
</div>

<Modal bind:isOpen={installOpen} title="Install provider plugin" onclose={closeInstall}>
  {#snippet children()}
    <form class="install-form" onsubmit={(event) => { event.preventDefault(); installPlugin(); }}>
      <div class="form-row manifest-heading">
        <label for="provider-manifest">Provider manifest</label>
        <label class="file-button" title="Import provider.json">
          <Upload size={16} aria-hidden="true" />
          Import JSON
          <input type="file" accept="application/json,.json" onchange={handleFile} />
        </label>
      </div>
      <textarea id="provider-manifest" class="code-input" bind:value={manifestText} oninput={() => (validation = null)} spellcheck="false" required rows="12" placeholder="Paste provider.json"></textarea>

      <div class="two-column">
        <label>
          <span>Base URL override</span>
          <input type="url" bind:value={baseUrlOverride} oninput={() => (validation = null)} placeholder="https://llm.example.com/v1/" />
        </label>
        <label>
          <span>Configuration JSON</span>
          <input class="code-inline" bind:value={configurationText} oninput={() => (validation = null)} spellcheck="false" />
        </label>
      </div>

      <div class="security-options">
        <label><input type="checkbox" bind:checked={allowPrivateNetwork} onchange={() => (validation = null)} /> Allow private network destination</label>
        <label><input type="checkbox" bind:checked={allowInsecureHttp} onchange={() => (validation = null)} /> Allow HTTP destination</label>
      </div>

      <div class="validation-row" class:validation-success={validation?.valid} class:validation-error={validation && !validation.valid}>
        {#if validation?.valid}
          <Check size={17} aria-hidden="true" />
          <span><strong>{validation.name}</strong> · {validation.destination}</span>
        {:else if validation}
          <X size={17} aria-hidden="true" />
          <span>{validation.error}</span>
        {:else}
          <span>Validate the manifest before installing.</span>
        {/if}
        <button class="secondary-button" type="button" disabled={validating || !manifestText.trim()} onclick={runValidation}>
          {#if validating}<LoaderCircle class="spin" size={16} />{/if}
          Validate
        </button>
      </div>

      {#if validation?.valid && validation.credentialSlots.length > 0}
        <fieldset class="credentials-fields">
          <legend>Credentials</legend>
          {#each validation.credentialSlots as slot (slot.slotId)}
            <label>
              <span>{slot.label ?? slot.slotId}{slot.required ? '' : ' (optional)'}</span>
              <input type={slot.credentialType === 'secret' ? 'password' : 'text'} value={credentials[slot.slotId] ?? ''} oninput={(event) => (credentials[slot.slotId] = event.currentTarget.value)} autocomplete={slot.credentialType === 'secret' ? 'new-password' : 'off'} required={slot.required} />
            </label>
          {/each}
        </fieldset>
      {/if}

      {#if validation?.valid}
        <label class="enable-option"><input type="checkbox" bind:checked={enableAfterInstall} /> Enable after installation</label>
      {/if}

      <div class="modal-actions">
        <button class="secondary-button" type="button" onclick={closeInstall}>Cancel</button>
        <button class="primary-button" type="submit" disabled={!validation?.valid || submitting}>
          {#if submitting}<LoaderCircle class="spin" size={16} />{/if}
          Install plugin
        </button>
      </div>
    </form>
  {/snippet}
</Modal>

<style>
  .provider-plugins-page { padding: var(--space-2xl); max-width: 1440px; margin: 0 auto; }
  .primary-button, .secondary-button, .file-button, .icon-button { display: inline-flex; align-items: center; justify-content: center; gap: 0.45rem; min-height: 36px; border-radius: 6px; font: inherit; font-weight: 600; cursor: pointer; }
  .primary-button { border: 1px solid var(--brand); background: var(--brand); color: white; padding: 0 0.9rem; }
  .primary-button:hover { background: var(--brand-hover); }
  .secondary-button, .file-button { border: 1px solid var(--surface-border); background: var(--surface-elevated); color: var(--text-primary); padding: 0 0.8rem; }
  button:disabled { opacity: 0.55; cursor: not-allowed; }
  .page-state { min-height: 240px; display: grid; place-items: center; border-top: 1px solid var(--surface-border); }
  .error-state { align-content: center; gap: 0.75rem; color: var(--text-secondary); }
  .plugins-table-wrap { overflow-x: auto; border: 1px solid var(--surface-border); border-radius: 8px; background: var(--surface-elevated); }
  .plugins-table { width: 100%; min-width: 980px; border-collapse: collapse; table-layout: fixed; }
  th, td { padding: 0.9rem 1rem; border-bottom: 1px solid var(--surface-border); text-align: left; vertical-align: middle; }
  th { color: var(--text-secondary); font-size: 0.78rem; text-transform: uppercase; font-weight: 700; }
  tbody tr:last-child td { border-bottom: 0; }
  td strong, .secondary-text { display: block; }
  .secondary-text { color: var(--text-secondary); margin-top: 0.25rem; font-size: 0.82rem; }
  .destination { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); }
  .capabilities, .credential-statuses { display: flex; flex-wrap: wrap; gap: 0.35rem; }
  .capabilities span, .credential-statuses span, .status { display: inline-flex; align-items: center; min-height: 24px; padding: 0.1rem 0.45rem; border: 1px solid var(--surface-border); border-radius: 5px; color: var(--text-secondary); font-size: 0.75rem; }
  .status { text-transform: capitalize; }
  .status { justify-self: start; }
  .status.enabled, .credential-valid { color: var(--brand-green) !important; border-color: color-mix(in srgb, currentColor 35%, transparent) !important; }
  .status.invalid, .credential-invalid { color: var(--brand-red) !important; border-color: color-mix(in srgb, currentColor 35%, transparent) !important; }
  .actions-heading { text-align: right; }
  .row-actions { display: flex; justify-content: flex-end; gap: 0.35rem; }
  .icon-button { width: 36px; padding: 0; border: 1px solid transparent; background: transparent; color: var(--text-secondary); }
  .icon-button:hover { border-color: var(--surface-border); background: var(--surface-subtle); color: var(--text-primary); }
  .icon-button.danger:hover { color: var(--brand-red); }
  .install-form { display: grid; gap: 1rem; width: 100%; min-width: 0; }
  .form-row, .manifest-heading { display: flex; align-items: center; justify-content: space-between; gap: 1rem; }
  label, legend { color: var(--text-primary); font-size: 0.88rem; font-weight: 600; }
  label span { display: block; margin-bottom: 0.4rem; }
  input[type='url'], input[type='password'], .code-inline, .code-input { width: 100%; border: 1px solid var(--surface-border); border-radius: 6px; background: var(--surface-subtle); color: var(--text-primary); font: inherit; box-sizing: border-box; }
  input[type='url'], input[type='password'], .code-inline { height: 40px; padding: 0 0.7rem; }
  .code-input, .code-inline { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
  .code-input { resize: vertical; padding: 0.75rem; line-height: 1.45; }
  .file-button input { position: absolute; width: 1px; height: 1px; overflow: hidden; opacity: 0; }
  .two-column { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  .security-options { display: flex; flex-wrap: wrap; gap: 1rem; padding: 0.75rem 0; border-top: 1px solid var(--surface-border); border-bottom: 1px solid var(--surface-border); }
  .security-options label, .enable-option { display: flex; align-items: center; gap: 0.5rem; font-weight: 500; }
  .security-options input, .enable-option input { width: 16px; height: 16px; margin: 0; flex: 0 0 16px; }
  .validation-row { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 0.65rem; min-height: 48px; padding: 0.55rem 0.65rem; border: 1px solid var(--surface-border); border-radius: 6px; color: var(--text-secondary); }
  .validation-success { color: var(--brand-green); }
  .validation-error { color: var(--brand-red); }
  .validation-row span { min-width: 0; overflow-wrap: anywhere; }
  .credentials-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0.8rem; border: 1px solid var(--surface-border); border-radius: 6px; padding: 0.9rem; }
  .credentials-fields legend { padding: 0 0.35rem; }
  .modal-actions { display: flex; justify-content: flex-end; gap: 0.6rem; padding-top: 0.5rem; }
  :global(.spin) { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (max-width: 760px) {
    .provider-plugins-page { padding: var(--space-lg); }
    .plugins-table-wrap { overflow: visible; border: 0; background: transparent; }
    .plugins-table { min-width: 0; table-layout: auto; }
    .plugins-table thead { display: none; }
    .plugins-table, .plugins-table tbody, .plugins-table tr, .plugins-table td { display: block; width: 100%; box-sizing: border-box; }
    .plugins-table tr { margin-bottom: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--surface-border); border-radius: 8px; background: var(--surface-elevated); }
    .plugins-table td { display: grid; grid-template-columns: 96px minmax(0, 1fr); gap: 0.65rem; padding: 0.55rem 0; border-bottom: 1px solid var(--surface-border); }
    .plugins-table td:last-child { border-bottom: 0; }
    .plugins-table td::before { content: attr(data-label); color: var(--text-secondary); font-size: 0.72rem; font-weight: 700; text-transform: uppercase; }
    .row-actions { justify-content: flex-start; }
    .two-column, .credentials-fields { grid-template-columns: 1fr; }
    .validation-row { grid-template-columns: auto 1fr; }
    .validation-row button { grid-column: 1 / -1; }
  }
</style>
