// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

// Label resolution for the model catalog metadata introduced in grengin-api
// 0.9.14 (specialty, price_tier). The webapp translates the codes it knows via
// i18n (so they read in the user's language), and for a code it does not know
// it shows the English `label` the API supplies in `specialties` / `price_tiers`.
// New catalog codes therefore appear without a webapp release.

import type { SpecialtyInfo, PriceTierInfo } from '../../api/models';

/** Specialty codes the webapp translates (i18n key `chat.modelSpecialty.<code>`). */
export const KNOWN_SPECIALTIES = [
  'general',
  'frontier',
  'reasoning',
  'coding',
  'agentic',
  'fast-cheap',
  'long-context',
  'multimodal',
  'research',
  'writing',
  'multilingual',
  'image-generation',
] as const;

/** Price-tier codes the webapp translates (i18n key `chat.priceTier.<code>`). */
export const KNOWN_PRICE_TIERS = ['free', 'cheap', 'moderate', 'expensive', 'premium'] as const;

/** A minimal translate signature compatible with svelte-i18n's `$_`. */
export type Translate = (key: string, options?: Record<string, unknown>) => string;

function translateCode(
  code: string | undefined | null,
  known: readonly string[],
  keyPrefix: string,
  catalog: Array<{ id: string; label: string }> | undefined,
  translate: Translate,
): string {
  if (!code) return '';
  if (known.includes(code)) {
    const key = `${keyPrefix}.${code}`;
    const translated = translate(key);
    // svelte-i18n returns the key itself when a message is missing.
    if (translated && translated !== key) return translated;
  }
  const fromCatalog = catalog?.find((entry) => entry.id === code)?.label;
  return fromCatalog ?? code;
}

/**
 * Human label for a specialty code: the webapp's translation when it knows the
 * code, else the English label from the `specialties` catalog, else the raw code.
 */
export function specialtyLabel(
  code: string | undefined | null,
  specialties: SpecialtyInfo[] | undefined,
  translate: Translate,
): string {
  return translateCode(code, KNOWN_SPECIALTIES, 'chat.modelSpecialty', specialties, translate);
}

/** Human label for a price-tier code (see {@link specialtyLabel}). */
export function priceTierLabel(
  code: string | undefined | null,
  priceTiers: PriceTierInfo[] | undefined,
  translate: Translate,
): string {
  return translateCode(code, KNOWN_PRICE_TIERS, 'chat.priceTier', priceTiers, translate);
}

/**
 * The "general" / all-rounder specialty is the catalog's neutral default — most
 * models carry it, so a badge for it is noise. Hide it; badge everything else.
 */
export function shouldShowSpecialtyBadge(code: string | undefined | null): boolean {
  return !!code && code !== 'general';
}
