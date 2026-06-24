import { request } from '../client.js';
import { API_BASE } from '../client.js';

// ---------------------------------------------------------------------------
// Host reconfiguration API client.
//
// These types are HAND-WRITTEN on purpose. The generated `src/lib/types/api.ts`
// is built from the mock OpenAPI spec (`mock/types/api.ts`, version 1.0.0), not
// from the backend `docs/openapi.json` (0.2.61) that defines the reconfigure
// schemas — so the generated types do not contain them. Keep field names in
// snake_case exactly as the API uses them.
//
// All three calls go through the shared authenticated `request()` helper
// (Bearer token + 401 refresh) per CLAUDE.md — never raw `fetch()`.
// ---------------------------------------------------------------------------

/** Per-script availability, as reported by the preflight endpoint. */
export interface ReconfigureScriptAvailability {
  script_path: string;
  exists: boolean;
  executable: boolean;
  requested_use_sudo: boolean;
  effective_use_sudo: boolean;
  available: boolean;
  /** Why the script is unavailable, when `available === false`. */
  reason: string | null;
}

/** Response of `GET /admin/reconfigure/available`. */
export interface ReconfigureAvailableResponse {
  success: boolean;
  message: string;
  running_as_root: boolean;
  sudo_available: boolean;
  domain: ReconfigureScriptAvailability;
  binaries: ReconfigureScriptAvailability;
}

export type SslMode = 'letsencrypt' | 'selfsigned' | 'none';

/** Request body for `POST /admin/reconfigure/domain`. */
export interface DomainReconfigureRequest {
  /** REQUIRED — hostname/FQDN with no scheme or path. */
  domain: string;
  /** Optional; UI always sends an explicit value. */
  ssl_mode?: SslMode;
  /** Optional; required by the API when `ssl_mode === 'letsencrypt'`. */
  email?: string;
  /** Optional; used for `selfsigned`. API allows integer >= 0. */
  self_signed_days?: number;
}

/** Response of `POST /admin/reconfigure/domain`. */
export interface DomainReconfigureResponse {
  success: boolean;
  message: string;
  domain: string;
  ssl_mode: SslMode;
  redirect_url: string;
  script_path: string;
  /** OPTIONAL — may be absent; consumers must handle its absence. */
  output?: string[];
}

export type ReconfigureArch = 'x86_64' | 'aarch64';

/** Request body for `POST /admin/reconfigure/binaries` (all fields optional). */
export interface BinariesUpdateRequest {
  version?: string;
  release_base_url?: string | null;
  /** Defaults to auto-detect (`null`) on the host. */
  arch?: ReconfigureArch | null;
  update_api?: boolean;
  update_webapp?: boolean;
  update_installer?: boolean;
  verify_checksums?: boolean;
  /** Advanced; request-only — NOT echoed back in the response. */
  api_service_name?: string;
}

/** Response of `POST /admin/reconfigure/binaries` (echoes resolved values). */
export interface BinariesUpdateResponse {
  success: boolean;
  message: string;
  version: string;
  release_base_url: string | null;
  arch: ReconfigureArch;
  update_api: boolean;
  update_webapp: boolean;
  update_installer: boolean;
  verify_checksums: boolean;
  script_path: string;
  /** OPTIONAL — may be absent; consumers must handle its absence. */
  output?: string[];
}

/**
 * Preflight — reports whether each reconfigure script exists, is executable,
 * and can run with sufficient privilege. Errors: 401, 403.
 */
export async function getReconfigureAvailable(): Promise<ReconfigureAvailableResponse> {
  return request<ReconfigureAvailableResponse>('/admin/reconfigure/available', {
    method: 'GET',
  });
}

/**
 * Change the serving domain and (re)issue TLS. Synchronous — blocks until the
 * host script finishes. Errors: 401, 403, 503.
 */
export async function reconfigureDomain(
  body: DomainReconfigureRequest
): Promise<DomainReconfigureResponse> {
  return request<DomainReconfigureResponse>('/admin/reconfigure/domain', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Pull and install new API / webapp / installer binaries. Synchronous — blocks
 * until the host script finishes. Errors: 401, 403, 503.
 */
export async function updateBinaries(
  body: BinariesUpdateRequest
): Promise<BinariesUpdateResponse> {
  return request<BinariesUpdateResponse>('/admin/reconfigure/binaries', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

/**
 * Verify-then-go readiness probe: is Grengin reachable at the *new* origin yet?
 *
 * This is intentionally a raw `fetch` (a documented exception to the
 * `request()` rule, like `getHealthStatus()`): it is an unauthenticated
 * reachability check against a *different* origin than the app is served from.
 *
 * Because the target origin is cross-origin, a normal CORS JSON fetch would be
 * blocked, so we use `mode: 'no-cors'`. That yields an *opaque* response whose
 * body/status we cannot read — but the `fetch` promise only **resolves** when
 * the origin is actually reachable (TCP + TLS handshake succeeded). DNS / TLS /
 * connection failures **reject**. So _reachability_, not the response body, is
 * the signal: resolve → reachable, throw → not yet.
 *
 * `signal` lets callers abort an in-flight probe (e.g. on unmount).
 */
export async function probeOriginReachable(
  origin: string,
  signal?: AbortSignal
): Promise<boolean> {
  try {
    await fetch(origin, {
      method: 'GET',
      mode: 'no-cors',
      cache: 'no-store',
      redirect: 'follow',
      signal,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Build the origin to probe after a domain change. The POST response carries a
 * `redirect_url`; when the proxy drops the connection mid-POST we don't have a
 * response, so we reconstruct `https://{domain}` from the submitted form.
 * Falls back to the API base path shape only if needed.
 */
export function newOriginFor(domain: string): string {
  return `https://${domain.trim().replace(/\/+$/, '')}`;
}

/** Re-exported for callers that want the current API base (health route). */
export { API_BASE };
