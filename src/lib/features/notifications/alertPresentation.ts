// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Presentation rules shared by the Alerts page and the bell popover, so a
 * notification wears the same skin in both places.
 */

import type { NotificationItem } from '../../api/notificationsApi.js';

/** Drives the tile fill and, on the page, the card tint. */
export type AlertSeverity = 'critical' | 'warning' | 'info';
/** Picks the mark inside the tile. */
export type AlertGlyph = 'budget' | 'warning' | 'critical' | 'info';

export interface AlertCategory {
  severity: AlertSeverity;
  glyph: AlertGlyph;
}

/**
 * The kinds GET /me/notifications emits today. `kind` is a dotted namespace and
 * the same string is repeated in `payload.kind`; this map reads the former.
 *
 * Matching alerts.html: an exhausted budget is red and wears the money mark, a
 * low budget is amber and wears the warning triangle.
 */
const KIND_CATEGORIES: Record<string, AlertCategory> = {
  'budget.exhausted': { severity: 'critical', glyph: 'budget' },
  'budget.low': { severity: 'warning', glyph: 'warning' },
};

/** A kind the backend added since: read the severity out of the name. */
function fallbackCategory(kind: string): AlertCategory {
  const budgetFamily = isBudgetKind(kind);
  if (/exhaust|exceed|critical|fail|error|block|denied|expired|revoked/.test(kind)) {
    return { severity: 'critical', glyph: budgetFamily ? 'budget' : 'critical' };
  }
  if (/low|warn|near|threshold|approach|pending|expiring/.test(kind)) {
    return { severity: 'warning', glyph: 'warning' };
  }
  return { severity: 'info', glyph: budgetFamily ? 'budget' : 'info' };
}

function isBudgetKind(kind: string): boolean {
  return /budget|spend|quota|credit/.test(kind);
}

function kindOf(n: NotificationItem): string {
  return `${n.kind ?? ''}`.toLowerCase();
}

export function isUnread(n: { read_at: string | null }): boolean {
  return n.read_at == null || n.read_at === '';
}

export function categorize(n: NotificationItem): AlertCategory {
  const kind = kindOf(n);
  return KIND_CATEGORIES[kind] ?? fallbackCategory(kind);
}

export function severityOf(n: NotificationItem): AlertSeverity {
  return categorize(n).severity;
}

/**
 * Whether the alert still covers the budget period we are in now. Rows carry
 * `period_start` plus `payload.budget_period` ("monthly" is the only value the
 * backend emits today), so the period's end is derivable; an unknown or missing
 * period is treated as monthly.
 */
export function isCurrentPeriod(n: NotificationItem, now: Date = new Date()): boolean {
  if (!n.period_start) return false;
  const start = new Date(n.period_start);
  if (Number.isNaN(start.getTime())) return false;
  const period = `${n.payload?.budget_period ?? ''}`.toLowerCase();
  return now >= start && now < periodEnd(start, period);
}

function periodEnd(start: Date, period: string): Date {
  const end = new Date(start);
  switch (period) {
    case 'daily':
      end.setUTCDate(end.getUTCDate() + 1);
      break;
    case 'weekly':
      end.setUTCDate(end.getUTCDate() + 7);
      break;
    case 'quarterly':
      end.setUTCMonth(end.getUTCMonth() + 3);
      break;
    case 'yearly':
    case 'annual':
    case 'annually':
      end.setUTCFullYear(end.getUTCFullYear() + 1);
      break;
    default:
      end.setUTCMonth(end.getUTCMonth() + 1);
      break;
  }
  return end;
}

/**
 * ".alert-group" — what belongs in the design's top group: anything not yet
 * read, plus anything still live for the period it covers. Everything else has
 * been both seen and superseded, and drops to "Earlier".
 */
export function needsAttention(n: NotificationItem, now?: Date): boolean {
  return isUnread(n) || isCurrentPeriod(n, now);
}

/** Whether the alert has a budget to go and look at. */
export function isBudgetAlert(n: NotificationItem): boolean {
  return isBudgetKind(kindOf(n));
}
