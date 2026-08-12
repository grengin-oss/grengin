/**
 * Demo login API (ENGG-379 / Interactive Demo spec §2).
 *
 * ADDITIVE FILE. Mirrors the real `login()` in src/lib/api/auth.ts, but hits the
 * demo endpoint and takes the visitor's self-declared identity instead of a
 * password. No bot-gate token — the demo entry deliberately omits the Turnstile
 * widget. The response is the SAME `LoginResponse` shape, so the caller feeds it
 * straight into the app's normal `setAuth()` flow.
 */

import { API_BASE, ApiError, parseErrorDetail } from '../../api/client.js';
import type { LoginResponse } from '../../api/auth.js';

export async function demoLogin(name: string, email: string): Promise<LoginResponse> {
  const response = await fetch(`${API_BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(response.status, parseErrorDetail(body));
  }

  return response.json();
}
