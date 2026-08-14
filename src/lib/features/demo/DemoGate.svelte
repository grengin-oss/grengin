<!--
  Demo entry flow — Interactive Demo spec §2 / §3.6 (ENGG-379).

  The visitor-facing first seconds on grengin.com/demo, before the Chat UI
  landing takes over. A small state machine with NO dead ends:

    identity   optional name/email (§3.6); skippable → backend pins "Unknown".
      │        Start/Skip call demo-login directly.
      │          ├─ success → setAuth() → hand off to the app
      │          ├─ 429/503 → busy   (concurrency cap: friendly retry page)
      │          └─ other   → error  (provisioning failed: retry page)

  Deliberately EXCLUDED from this build (per ticket scope): the Cloudflare
  Turnstile bot-gate widget, and the separate branded "spinning up" provisioning
  screen. The demo-login round-trip is fast (target < 5s), so Start/Skip just
  show an inline button spinner and hand off straight to the app on success.

  busy and error offer a way back to the form and a way back to grengin.com, so
  every screen has a way forward. All states share DemoStateScreen's branded
  shell and are keyboard-accessible; DemoStateScreen focuses each title on mount.

  ADDITIVE COMPONENT.
-->
<script lang="ts">
  import { _ } from "svelte-i18n";
  import { setAuth, ApiError } from "../auth/index.js";
  import { demoLogin } from "./demoApi.js";
  import DemoStateScreen from "./DemoStateScreen.svelte";

  interface Props {
    onLoginSuccess?: () => void;
    /** Where the "back to site" affordance on the busy/error screens points. */
    exitHref?: string;
  }
  let { onLoginSuccess, exitHref = "https://grengin.com" }: Props = $props();

  type Step = "identity" | "busy" | "error";
  let step = $state<Step>("identity");

  // Visitor identity (spec §3.6) — optional. When skipped we send nothing and the
  // backend pins the row as "Unknown".
  let name = $state("");
  let email = $state("");

  // In-flight flag for the demo-login round trip. There is no full-page
  // provisioning screen (excluded by scope); the buttons show an inline spinner.
  let submitting = $state(false);
  let errorMessage = $state("");

  async function provision(useIdentity: boolean) {
    if (submitting) return;
    submitting = true;
    errorMessage = "";
    try {
      const response = await demoLogin(
        useIdentity ? name.trim() : "",
        useIdentity ? email.trim() : "",
      );
      if (response.accessToken && response.refreshToken && response.user) {
        setAuth(response.accessToken, response.refreshToken, response.user);
        onLoginSuccess?.();
        return; // app takes over and this component unmounts; keep the form inert
      }
      // Malformed success — surface it as a retryable failure, not a dead end.
      errorMessage = $_("demo.gate.malformed");
      step = "error";
    } catch (err) {
      // Concurrency cap reached → intentional busy page rather than an error.
      if (
        err instanceof ApiError &&
        (err.status === 429 || err.status === 503)
      ) {
        step = "busy";
      } else {
        errorMessage =
          err instanceof ApiError
            ? err.description
            : $_("demo.gate.unreachable");
        step = "error";
      }
    }
    // Reached only on a non-success outcome (busy/error) — re-enable the controls.
    submitting = false;
  }

  function backToForm() {
    step = "identity";
    submitting = false;
  }

  function onIdentitySubmit(e: Event) {
    e.preventDefault();
    void provision(true);
  }
</script>

{#if step === "identity"}
  <DemoStateScreen
    eyebrow={$_("demo.gate.eyebrow")}
    title={$_("demo.gate.title")}
    message={$_("demo.gate.message")}
  >
    {#snippet body()}
      <form onsubmit={onIdentitySubmit}>
        <label class="field-label" for="demo-name"
          >{$_("demo.gate.nameLabel")}</label
        >
        <input
          id="demo-name"
          class="field"
          bind:value={name}
          placeholder={$_("demo.gate.namePlaceholder")}
          autocomplete="name"
          disabled={submitting}
        />

        <label class="field-label" for="demo-email"
          >{$_("demo.gate.emailLabel")}</label
        >
        <input
          id="demo-email"
          class="field"
          type="email"
          bind:value={email}
          placeholder={$_("demo.gate.emailPlaceholder")}
          autocomplete="email"
          disabled={submitting}
        />

        <button class="primary" type="submit" disabled={submitting}>
          {#if submitting}<span class="btn-spinner" aria-hidden="true"
            ></span>{$_("demo.gate.starting")}{:else}{$_(
              "demo.gate.start",
            )}{/if}
        </button>
        <button
          class="ghost"
          type="button"
          disabled={submitting}
          onclick={() => void provision(false)}
        >
          {$_("demo.gate.skip")}
        </button>

        <p class="foot">{$_("demo.gate.privacy")}</p>
      </form>
    {/snippet}
  </DemoStateScreen>
{:else if step === "busy"}
  <DemoStateScreen
    tone="busy"
    eyebrow={$_("demo.busy.eyebrow")}
    title={$_("demo.busy.title")}
    message={$_("demo.busy.message")}
  >
    {#snippet actions()}
      <button class="primary" type="button" onclick={backToForm}
        >{$_("demo.actions.tryAgain")}</button
      >
      <a class="ghost" href={exitHref}>{$_("demo.actions.backToSite")}</a>
    {/snippet}
  </DemoStateScreen>
{:else}
  <DemoStateScreen
    tone="error"
    eyebrow={$_("demo.error.eyebrow")}
    title={$_("demo.error.title")}
    message={errorMessage}
  >
    {#snippet actions()}
      <button class="primary" type="button" onclick={backToForm}
        >{$_("demo.actions.tryAgain")}</button
      >
      <a class="ghost" href={exitHref}>{$_("demo.actions.backToSite")}</a>
    {/snippet}
  </DemoStateScreen>
{/if}

<style>
  /* Field + button styles for the snippet content projected into
     DemoStateScreen's card. Scoped to this component (where the markup lives). */
  .field-label {
    display: block;
    margin-bottom: 6px;
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text-secondary);
  }
  .field {
    width: 100%;
    height: 46px;
    padding: 0 14px;
    margin-bottom: 14px;
    border-radius: 14px;
    background: var(--surface-subtle, rgba(255, 255, 255, 0.04));
    border: 1px solid var(--surface-border);
    color: var(--text-primary);
    font-size: 14.5px;
    outline: none;
    box-sizing: border-box;
  }
  .field:focus-visible {
    border-color: var(--brand);
    box-shadow: 0 0 0 3px rgba(var(--brand-rgb), 0.25);
  }
  .field:disabled {
    opacity: 0.6;
  }
  .primary {
    width: 100%;
    height: 48px;
    margin-top: 6px;
    border: none;
    border-radius: 16px;
    background: linear-gradient(
      135deg,
      var(--brand-green-accent) 0%,
      var(--brand) 100%
    );
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.2),
      0 6px 20px rgba(var(--brand-rgb), 0.3);
  }
  .primary:disabled {
    opacity: 0.7;
    cursor: default;
  }
  .primary:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .ghost {
    display: block;
    width: 100%;
    height: 42px;
    margin-top: 10px;
    border: none;
    background: transparent;
    border-radius: 14px;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-secondary);
    text-align: center;
    text-decoration: none;
    cursor: pointer;
    transition: color 150ms;
  }
  .ghost:disabled {
    opacity: 0.55;
    cursor: default;
  }
  .ghost:hover:not(:disabled) {
    color: var(--text-primary);
  }
  .ghost:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
  }
  .foot {
    margin: 18px 0 0;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--text-secondary);
    opacity: 0.8;
  }
  .btn-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid rgba(255, 255, 255, 0.45);
    border-top-color: #fff;
    border-radius: 50%;
    animation: btnspin 0.7s linear infinite;
  }
  @keyframes btnspin {
    to {
      transform: rotate(360deg);
    }
  }
</style>
