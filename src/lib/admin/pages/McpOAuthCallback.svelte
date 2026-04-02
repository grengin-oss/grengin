<script lang="ts">
  import { onMount } from "svelte";
  import { navigate } from "svelte-routing";
  import { _ } from "svelte-i18n";
  import { toast } from "../../components/Toaster.svelte";
  import { ApiError } from "../../api/client.js";
  import { getLocalizedError } from "../../utils/errorLocalization.js";
  import { completeMcpOAuth } from "../../api/admin/mcpServers.js";

  type CallbackStatus = "processing" | "success" | "error";
  let status = $state<CallbackStatus>("processing");

  const REDIRECT_DELAY_SUCCESS = 300; // ms
  const REDIRECT_DELAY_ERROR = 3000; // ms

  async function processCallback(): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    const errorDescription = params.get("error_description");
    const code = params.get("code");
    const state = params.get("state");

    if (error) {
      const message = errorDescription || error;
      toast.error(message);
      throw new Error(message);
    }

    if (!code || !state) {
      const message = $_("admin.mcpServers.callbackMissingParams");
      toast.error(message);
      throw new Error(message);
    }

    await completeMcpOAuth(code, state);
  }

  function redirectAfterSuccess(): void {
    setTimeout(() => {
      navigate("/admin/mcp-servers", { replace: true });
    }, REDIRECT_DELAY_SUCCESS);
  }

  function redirectAfterError(): void {
    setTimeout(() => {
      navigate("/admin/mcp-servers", { replace: true });
    }, REDIRECT_DELAY_ERROR);
  }

  onMount(async () => {
    try {
      await processCallback();
      toast.success($_("admin.mcpServers.connected"));
      status = "success";
      redirectAfterSuccess();
    } catch (err: unknown) {
      const apiError =
        err instanceof ApiError
          ? err
          : new ApiError(
              500,
              err instanceof Error
                ? err.message
                : $_("admin.mcpServers.connectFailed"),
            );
      const errorMessage =
        getLocalizedError(apiError, "description", $_) || apiError.description;
      toast.error(errorMessage || $_("admin.mcpServers.connectFailed"));
      status = "error";
      redirectAfterError();
    }
  });
</script>

<div class="callback-container">
  <div class="callback-card">
    {#if status === "processing"}
      <div class="callback-content">
        <div class="brand-header">
          <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />
          <div class="brand-text">
            <h1 class="brand-name">Grengin</h1>
            <p class="brand-tagline">
              {$_("admin.mcpServers.connectingTitle")}
            </p>
          </div>
        </div>

        <div class="processing-section">
          <div class="spinner-container">
            <div class="spinner"></div>
            <div class="pulse-ring"></div>
          </div>
          <div class="status-text">
            <h2>{$_("admin.mcpServers.connectingTitle")}</h2>
            <p class="status-message">
              {$_("admin.mcpServers.connectingMessage")}
            </p>
          </div>
        </div>
      </div>
    {:else if status === "success"}
      <div class="callback-content">
        <div class="brand-header">
          <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />
          <div class="brand-text">
            <h1 class="brand-name">Grengin</h1>
            <p class="brand-tagline">{$_("admin.mcpServers.connected")}</p>
          </div>
        </div>

        <div class="success-section">
          <div class="status-icon success">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
          </div>
          <div class="status-text">
            <h2>{$_("admin.mcpServers.connected")}</h2>
            <p class="status-message">{$_("admin.mcpServers.redirecting")}</p>
          </div>
        </div>
      </div>
    {:else}
      <div class="callback-content">
        <div class="brand-header">
          <img src="/grengin-icon.svg" alt="Grengin" class="callback-logo" />
          <div class="brand-text">
            <h1 class="brand-name">Grengin</h1>
            <p class="brand-tagline">{$_("admin.mcpServers.connectFailed")}</p>
          </div>
        </div>

        <div class="error-section">
          <div class="status-icon error">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
            >
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="15" y1="9" x2="9" y2="15"></line>
              <line x1="9" y1="9" x2="15" y2="15"></line>
            </svg>
          </div>
          <div class="status-text">
            <h2>{$_("admin.mcpServers.connectFailed")}</h2>
            <p class="status-submessage">
              {$_("admin.mcpServers.redirecting")}
            </p>
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .callback-container {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
      "Helvetica Neue", Arial, sans-serif;
  }

  .callback-card {
    width: 100%;
    max-width: 400px;
    padding: 0;
    background: rgba(255, 255, 255, 0.98);
    border: 1px solid #eaeaea;
    border-radius: 20px;
    box-shadow:
      0 32px 64px rgba(0, 0, 0, 0.12),
      0 0 0 1px rgba(255, 255, 255, 0.1);
    overflow: hidden;
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
  }

  .callback-content {
    display: flex;
    flex-direction: column;
    min-height: 400px;
  }

  .brand-header {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 32px 32px 24px 32px;
    background: linear-gradient(
      135deg,
      rgba(102, 126, 234, 0.05) 0%,
      rgba(118, 75, 162, 0.05) 100%
    );
    border-bottom: 1px solid rgba(102, 126, 234, 0.1);
  }

  .callback-logo {
    width: 48px;
    height: 48px;
    flex-shrink: 0;
  }

  .brand-text {
    flex: 1;
  }

  .brand-name {
    font-size: 24px;
    font-weight: 700;
    color: #1a202c;
    margin: 0 0 4px 0;
    letter-spacing: -0.025em;
  }

  .brand-tagline {
    font-size: 14px;
    color: #718096;
    margin: 0;
    font-weight: 500;
  }

  .processing-section,
  .success-section,
  .error-section {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 40px 32px;
    text-align: center;
    flex: 1;
  }

  .spinner-container {
    position: relative;
    width: 80px;
    height: 80px;
    margin-bottom: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(102, 126, 234, 0.15);
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    z-index: 2;
    position: relative;
  }

  .pulse-ring {
    position: absolute;
    width: 80px;
    height: 80px;
    border: 2px solid rgba(102, 126, 234, 0.2);
    border-radius: 50%;
    animation: pulse 2s ease-in-out infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pulse {
    0% {
      transform: scale(0.8);
      opacity: 1;
    }
    50% {
      transform: scale(1.1);
      opacity: 0.3;
    }
    100% {
      transform: scale(0.8);
      opacity: 1;
    }
  }

  .status-icon {
    width: 64px;
    height: 64px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 24px;
  }

  .status-icon.success {
    background: linear-gradient(
      135deg,
      rgba(72, 187, 120, 0.1) 0%,
      rgba(56, 161, 105, 0.1) 100%
    );
    color: #48bb78;
    border: 1px solid rgba(72, 187, 120, 0.2);
  }

  .status-icon.error {
    background: linear-gradient(
      135deg,
      rgba(245, 101, 101, 0.1) 0%,
      rgba(229, 62, 62, 0.1) 100%
    );
    color: #f56565;
    border: 1px solid rgba(245, 101, 101, 0.2);
  }

  .status-icon svg {
    width: 32px;
    height: 32px;
  }

  .status-text {
    max-width: 320px;
  }

  h2 {
    font-size: 20px;
    font-weight: 600;
    color: #1a202c;
    margin: 0 0 8px 0;
    letter-spacing: -0.025em;
  }

  .status-message {
    font-size: 15px;
    color: #4a5568;
    margin: 0;
    line-height: 1.5;
  }

  .status-submessage {
    font-size: 14px;
    color: #718096;
    margin: 8px 0 0 0;
    line-height: 1.4;
  }

  @media (max-width: 480px) {
    .callback-container {
      padding: 16px;
    }

    .callback-card {
      max-width: 100%;
    }

    .brand-header {
      padding: 24px 20px 20px 20px;
    }

    .processing-section,
    .success-section,
    .error-section {
      padding: 32px 20px;
    }

    .brand-name {
      font-size: 20px;
    }

    .brand-tagline {
      font-size: 13px;
    }

    h2 {
      font-size: 18px;
    }

    .status-message {
      font-size: 14px;
    }

    .spinner-container {
      width: 64px;
      height: 64px;
    }

    .spinner {
      width: 32px;
      height: 32px;
    }

    .pulse-ring {
      width: 64px;
      height: 64px;
    }

    .status-icon {
      width: 56px;
      height: 56px;
    }

    .status-icon svg {
      width: 28px;
      height: 28px;
    }
  }

  @media (prefers-color-scheme: dark) {
    .callback-card {
      background: rgba(45, 55, 72, 0.98);
      color: #e2e8f0;
    }

    .brand-header {
      background: linear-gradient(
        135deg,
        rgba(102, 126, 234, 0.1) 0%,
        rgba(118, 75, 162, 0.1) 100%
      );
      border-bottom-color: rgba(102, 126, 234, 0.2);
    }

    .brand-name {
      color: #f7fafc;
    }

    .brand-tagline {
      color: #cbd5e0;
    }

    h2 {
      color: #f7fafc;
    }

    .status-message {
      color: #cbd5e0;
    }

    .status-submessage {
      color: #a0aec0;
    }
  }
</style>
