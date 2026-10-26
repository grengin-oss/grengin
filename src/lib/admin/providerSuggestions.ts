// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import type { AIEngine } from './types.js';

export function mergeProviderSuggestions(
  installed: AIEngine[],
  suggestions: AIEngine[],
): AIEngine[] {
  const byKey = new Map(suggestions.map((engine) => [engine.engine_key, engine]));
  for (const engine of installed) byKey.set(engine.engine_key, engine);
  return [...byKey.values()];
}
