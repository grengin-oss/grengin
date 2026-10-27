// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// Central app-global keyboard shortcuts.
//
// A single `<svelte:window onkeydown>` in App.svelte calls
// `handleGlobalShortcut`. Rather than reach into component state from here, the
// dispatcher fires window CustomEvents and the owning component listens — the
// same decoupled pattern already used for "focusChatInput". That keeps this
// module free of lifecycle wiring and avoids double-handling when several
// components mount.
//
// Focus-sensitive shortcuts (Enter / Cmd+Enter to send, Esc to stop) stay in
// the composer itself, where focus is guaranteed and a global handler would
// fight the browser's own Escape/Enter semantics. Only shortcuts that must work
// from "anywhere in the app" live here.

/** Events this module emits. Listeners live in the components that own the action. */
export const SHORTCUT_EVENTS = {
  /** Toggle the command palette (Sidebar owns the modal). */
  toggleCommandPalette: "toggleCommandPalette",
  /** Focus the chat composer (Chat owns the textarea). */
  focusChatInput: "focusChatInput",
} as const;

/**
 * Cross-component events fired by command-palette actions. The palette has no
 * direct handle on the chat or sidebar state, so it dispatches these and the
 * owning component applies them — same decoupled pattern as the shortcuts above.
 */
export const APP_EVENTS = {
  /** Switch the active model: `detail = { model, provider }` (registry keys). */
  selectModel: "commandSelectModel",
  /** Flip the composer's web-search toggle. */
  toggleWebSearch: "commandToggleWebSearch",
  /** Collapse/expand the sidebar. */
  toggleSidebar: "commandToggleSidebar",
} as const;

/** Payload for the {@link APP_EVENTS.selectModel} event. */
export interface SelectModelDetail {
  model: string;
  provider: string;
}

/**
 * True when the event target is a text-entry surface we must not hijack —
 * inputs, textareas, selects, and contenteditable regions. Single-key
 * shortcuts (like "/") check this so they never steal a keystroke the user
 * meant to type.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== "function") return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return !!el.closest('[contenteditable="true"], [role="textbox"]');
}

/** A modal/menu is capturing input, so app-global shortcuts should stand down. */
function hasOpenModalLayer(): boolean {
  return !!document.querySelector('[aria-modal="true"]');
}

/**
 * App-global key dispatch. Mounted once, at the app shell. It never stops an
 * event another handler already claimed (`defaultPrevented`), and it leaves
 * focus-sensitive keys (Enter/Esc) to the composer.
 */
export function handleGlobalShortcut(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;

  // Cmd/Ctrl+K — toggle the command palette from anywhere, including while
  // typing (it's an explicit chord, not a stray keystroke).
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.toggleCommandPalette));
    return;
  }

  // "/" — jump to the composer, but only when the user isn't already typing
  // somewhere and no modal/menu is open.
  if (
    event.key === "/" &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.altKey &&
    !isEditableTarget(event.target) &&
    !hasOpenModalLayer()
  ) {
    event.preventDefault();
    window.dispatchEvent(new CustomEvent(SHORTCUT_EVENTS.focusChatInput));
  }
}
