<!--
  Global Top Bar — ENGG-381 / Interactive Demo spec §1.

  ADDITIVE COMPONENT. Persistent, fixed-position chrome that wraps the REAL
  Grengin app (Chat UI + Control Hub). The app renders underneath; this bar is
  identical on every page.

  Layout (left → right):
    • DEMO pill + banner text  ......  demo notice
    • VIEWING AS <role> ▾  .........   role switcher (view-only; never resets data)
    • Deploy CTA  ..................   links to grengin.com/deploy
    • Exit ✕  ......................   tears down session, returns to grengin.com

  The only edit to an existing file is mounting <GlobalTopBar /> once at the top
  of the authenticated layout in App.svelte (plus top padding so content clears
  the fixed bar).
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { _ } from 'svelte-i18n';
  import { demoView } from './demoView.svelte.js';
  import type { DemoRole } from './demoRoles.js';

  interface Props {
    /** Banner text override. Defaults to the localized `demo.bar.banner` string. */
    bannerText?: string;
    deployHref?: string;
    /** Deploy CTA label override. Defaults to the localized `demo.bar.deploy` string. */
    deployLabel?: string;
    exitHref?: string;
    /** Called when the viewing role changes (view-only). */
    onRoleChange?: (id: string) => void;
    /** Called on exit; if it returns false the default navigation is skipped
        (e.g. the app runs its own async session teardown then navigates). */
    onExit?: () => boolean | void;
  }

  let {
    bannerText,
    deployHref = 'https://grengin.com/deploy',
    deployLabel,
    exitHref = 'https://grengin.com',
    onRoleChange,
    onExit,
  }: Props = $props();

  const roles = $derived(demoView.roles as readonly DemoRole[]);
  const current = $derived(demoView.role);

  // Localized copy. Props still win when a parent passes an explicit override.
  const banner = $derived(bannerText ?? $_('demo.bar.banner'));
  const deploy = $derived(deployLabel ?? $_('demo.bar.deploy'));

  // Role label/description/tag come from the `demo` namespace, keyed by role id,
  // so the switcher follows the visitor's language. Falls back to the value
  // baked into demoRoles.ts if a key is ever missing.
  const roleLabel = (r: DemoRole): string => $_(`demo.roles.${r.id}.label`, { default: r.label });
  const roleDesc = (r: DemoRole): string => $_(`demo.roles.${r.id}.desc`, { default: r.desc });
  const roleTag = (r: DemoRole): string =>
    $_(`demo.tags.${r.tag.toLowerCase()}`, { default: r.tag });

  let open = $state(false);
  let activeIndex = $state(0);
  let triggerEl = $state<HTMLButtonElement>();
  let menuEl = $state<HTMLUListElement>();

  function selectRole(id: string) {
    demoView.setRole(id);
    onRoleChange?.(id);
    close();
    triggerEl?.focus();
  }

  function openMenu() {
    open = true;
    activeIndex = Math.max(0, roles.findIndex((r) => r.id === current?.id));
    focusOption(activeIndex);
  }
  function close() {
    open = false;
  }
  function toggle() {
    open ? close() : openMenu();
  }

  function onTriggerKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu();
    }
  }

  function onMenuKeydown(e: KeyboardEvent) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        triggerEl?.focus();
        break;
      case 'ArrowDown':
        e.preventDefault();
        activeIndex = (activeIndex + 1) % roles.length;
        focusOption(activeIndex);
        break;
      case 'ArrowUp':
        e.preventDefault();
        activeIndex = (activeIndex - 1 + roles.length) % roles.length;
        focusOption(activeIndex);
        break;
      case 'Home':
        e.preventDefault();
        activeIndex = 0;
        focusOption(0);
        break;
      case 'End':
        e.preventDefault();
        activeIndex = roles.length - 1;
        focusOption(activeIndex);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        selectRole(roles[activeIndex].id);
        break;
    }
  }

  function focusOption(i: number) {
    queueMicrotask(() => {
      const opt = menuEl?.querySelectorAll<HTMLElement>('[role="option"]')[i];
      opt?.focus();
    });
  }

  function handleExit() {
    const proceed = onExit?.();
    if (proceed !== false) window.location.href = exitHref;
  }

  onMount(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!open) return;
      const t = e.target as Node;
      if (menuEl && !menuEl.contains(t) && triggerEl && !triggerEl.contains(t)) close();
    };
    window.addEventListener('click', onDocClick, true);
    return () => window.removeEventListener('click', onDocClick, true);
  });
</script>

<header class="demo-bar" role="banner">
  <!-- Left: demo notice -->
  <div class="left">
    <span class="pill">{$_('demo.bar.pill')}</span>
    <span class="banner" title={banner}>{banner}</span>
  </div>

  <!-- Center: role switcher (view-only) -->
  <div class="switcher">
    <button
      bind:this={triggerEl}
      class="trigger"
      type="button"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={$_('demo.bar.changeRole', { values: { role: current ? roleLabel(current) : '' } })}
      onclick={toggle}
      onkeydown={onTriggerKeydown}
    >
      <span class="viewing">{$_('demo.bar.viewingAs')}</span>
      <span class="rolename">{current ? roleLabel(current) : ''}</span>
      <svg class="chev {open ? 'up' : ''}" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 9l6 6 6-6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </button>

    {#if open}
      <ul bind:this={menuEl} class="menu" role="listbox" aria-label={$_('demo.bar.viewingRole')} tabindex="-1" onkeydown={onMenuKeydown}>
        {#each roles as r, i (r.id)}
          <li
            role="option"
            tabindex="-1"
            aria-selected={r.id === current?.id}
            class:active={i === activeIndex}
            class:selected={r.id === current?.id}
            onclick={() => selectRole(r.id)}
          >
            <span class="opt-top">
              <span class="opt-label">{roleLabel(r)}</span>
              <span class="tag {r.tag.toLowerCase()}">{roleTag(r)}</span>
            </span>
            <span class="opt-desc">{roleDesc(r)}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>

  <!-- Right: deploy CTA + exit -->
  <div class="right">
    <a class="deploy" href={deployHref} target="_blank" rel="noopener">
      <span class="deploy-label">{deploy}</span>
      <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
    </a>
    <button class="exit" type="button" aria-label={$_('demo.bar.exit')} title={$_('demo.bar.exit')} onclick={handleExit}>
      <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    </button>
  </div>
</header>

<style>
  .demo-bar {
    --grad: linear-gradient(135deg, var(--brand-green-accent, #2d906b) 0%, var(--brand, #4079c5) 100%);
    --bar-h: 46px;

    position: fixed;
    inset: 0 0 auto 0;
    height: var(--bar-h);
    z-index: 1000;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 0 10px 0 12px;
    background: var(--surface-subtle, #0f1115);
    border-bottom: 1px solid var(--surface-border, rgba(255, 255, 255, 0.08));
    color: var(--text-primary, #fff);
    box-sizing: border-box;
  }
  .demo-bar *,
  .demo-bar *::before,
  .demo-bar *::after {
    box-sizing: border-box;
  }

  .left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1 1 0;
  }
  .pill {
    display: inline-flex;
    align-items: center;
    height: 22px;
    padding: 0 9px;
    border-radius: 9999px;
    background: var(--grad);
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    flex-shrink: 0;
  }
  .banner {
    font-size: 13px;
    color: var(--text-secondary, rgba(255, 255, 255, 0.66));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    min-width: 0;
  }

  .switcher {
    position: relative;
    flex-shrink: 0;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    height: 32px;
    padding: 0 12px;
    border-radius: 11px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid var(--surface-border, rgba(255, 255, 255, 0.1));
    color: var(--text-primary, #fff);
    cursor: pointer;
    transition: background 150ms;
    font: inherit;
  }
  .trigger:hover {
    background: rgba(255, 255, 255, 0.1);
  }
  .trigger:focus-visible,
  .exit:focus-visible,
  .deploy:focus-visible,
  li[role='option']:focus-visible {
    outline: 2px solid var(--brand, #7cb0ff);
    outline-offset: 2px;
  }
  .viewing {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: var(--text-secondary, rgba(255, 255, 255, 0.45));
    opacity: 0.7;
  }
  .rolename {
    font-size: 13px;
    font-weight: 600;
  }
  .chev {
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    transition: transform 150ms;
  }
  .chev.up {
    transform: rotate(180deg);
  }

  .menu {
    position: absolute;
    top: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    width: 300px;
    max-width: min(300px, calc(100vw - 20px));
    margin: 0;
    padding: 6px;
    list-style: none;
    background: var(--surface-elevated, #16181f);
    border: 1px solid var(--surface-border, rgba(255, 255, 255, 0.1));
    border-radius: 14px;
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.5);
  }
  li[role='option'] {
    display: block;
    padding: 9px 10px;
    border-radius: 10px;
    cursor: pointer;
  }
  li[role='option'].active,
  li[role='option']:hover {
    background: var(--surface-card-interactive, rgba(255, 255, 255, 0.06));
  }
  li[role='option'].selected {
    background: var(--surface-accent, rgba(64, 121, 197, 0.16));
  }
  .opt-top {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .opt-label {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text-primary, #fff);
  }
  .tag {
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    padding: 2px 6px;
    border-radius: 6px;
  }
  .tag.system {
    color: #9ec1ff;
    background: rgba(64, 121, 197, 0.18);
  }
  .tag.scoped {
    color: #7fd6b0;
    background: rgba(45, 144, 107, 0.22);
  }
  .tag.custom {
    color: #d8b4fe;
    background: rgba(147, 51, 234, 0.2);
  }
  .opt-desc {
    display: block;
    margin-top: 3px;
    font-size: 11.5px;
    line-height: 1.45;
    color: var(--text-secondary, rgba(255, 255, 255, 0.5));
    opacity: 0.85;
  }

  .right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 0;
    justify-content: flex-end;
  }
  .deploy {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    height: 32px;
    padding: 0 14px;
    border-radius: 11px;
    background: var(--grad);
    color: #fff;
    font-size: 13px;
    font-weight: 700;
    text-decoration: none;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2), 0 4px 14px rgba(64, 121, 197, 0.3);
    white-space: nowrap;
  }
  .exit {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 11px;
    background: transparent;
    border: none;
    color: var(--text-secondary, rgba(255, 255, 255, 0.6));
    cursor: pointer;
    transition: background 150ms, color 150ms;
  }
  .exit:hover {
    background: rgba(255, 255, 255, 0.08);
    color: var(--text-primary, #fff);
  }

  /* Responsive: shed non-essentials on narrow screens; switcher/deploy/exit
     always survive. */
  @media (max-width: 720px) {
    .banner {
      display: none;
    }
  }
  @media (max-width: 520px) {
    .viewing {
      display: none;
    }
    .deploy-label {
      display: none;
    }
    .deploy {
      padding: 0 10px;
    }
  }
</style>
