// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Build-time switches for features that ship dark.
 */

/**
 * Prompts — the Prompt Library page, the Prompt Effectiveness page, the
 * department "Prompts" tab and the user settings "Prompt Settings" tab — is
 * hidden for the v1.0.0 launch (ENGG-423).
 *
 * Nothing was deleted: flip this to `true` to restore the sidebar entries,
 * the `/admin/prompt-library` and `/admin/prompt-effectiveness` routes, the
 * department tab and the user settings tab.
 */
export const PROMPTS_FEATURE_ENABLED = false;
