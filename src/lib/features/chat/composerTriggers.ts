// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// Inline composer triggers: the "/" command menu and "@" mention menu.
//
// `detectTrigger` inspects the text to the left of the caret and reports an
// active trigger token, if any. A token is active only when its "/" or "@"
// sits at the start of the text or directly after whitespace, and the run from
// there to the caret contains no whitespace — so "a/b" or an email "x@y" never
// opens a menu, but "/res" and "@mcp" do.

export type TriggerKind = "slash" | "mention";

export interface TriggerMatch {
  kind: TriggerKind;
  /** Text typed after the trigger char, up to the caret (may be empty). */
  query: string;
  /** Index of the trigger char within the text. */
  start: number;
}

const WHITESPACE = new Set([" ", "\t", "\n", "\r"]);

/** Detect an active "/" or "@" token immediately preceding `caret`, else null. */
export function detectTrigger(text: string, caret: number): TriggerMatch | null {
  if (caret < 0 || caret > text.length) return null;

  for (let i = caret - 1; i >= 0; i--) {
    const ch = text[i];
    // Whitespace before reaching a trigger char means there's no active token.
    if (WHITESPACE.has(ch)) return null;
    if (ch === "/" || ch === "@") {
      const before = i === 0 ? "" : text[i - 1];
      if (before === "" || WHITESPACE.has(before)) {
        return {
          kind: ch === "/" ? "slash" : "mention",
          query: text.slice(i + 1, caret),
          start: i,
        };
      }
      // A trigger char glued to a preceding word (e.g. an email) is literal.
      return null;
    }
  }
  return null;
}

/** A single row in the inline suggestion popover. */
export interface ComposerSuggestion {
  /** Namespaced id, e.g. "skill:<id>", "mcp:<id>", "action:web-search". */
  id: string;
  title: string;
  subtitle?: string;
  /** Emoji or short glyph shown at the row's lead. */
  icon?: string;
  /** For toggle rows (skills / MCP servers): whether it's currently on. */
  selected?: boolean;
}
