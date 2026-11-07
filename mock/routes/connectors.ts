// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Connectors redesign (ENGG-511) mock.
 *
 * Two concerns, mirroring production:
 *  1. The published catalog metadata — a local mirror of meta.grengin.com. The
 *     real host serves `connectors.json` and the per-connector config files
 *     (e.g. `connectors/gmail.json`) as static files without CORS headers, so
 *     the browser cannot fetch them cross-origin. Pointing VITE_META_BASE at
 *     this mock server (see .env.mock) serves the exact same JSON with CORS.
 *     These files are checked in under mock/examples/connectors/.
 *  2. The signed-in user's own connections (/connectors), held in memory.
 */

import { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import crypto from 'crypto'
import { requireAuth } from '../lib/middleware.js'

const router = Router()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONNECTORS_DIR = path.resolve(__dirname, '../examples/connectors')
const META_ICON_BASE = 'https://meta.grengin.com/connectors/icons'
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36'

type CatalogEntry = {
  key: string
  display_name: string
  icon: string
  description: string
  category: string
  job: string
  suite: string
  keywords: string[]
  sign_in: string
  status: string
}
type Catalog = {
  schemaVersion: string
  catalogVersion: string
  categories: { id: string; label: string }[]
  catalog: CatalogEntry[]
}

const catalog: Catalog = JSON.parse(
  fs.readFileSync(path.join(CONNECTORS_DIR, 'connectors.json'), 'utf-8'),
)

/** Read a per-connector config file, or null when it is not on disk. */
function readConfig(key: string): Record<string, unknown> | null {
  const safe = key.replace(/[^a-z0-9-]/gi, '')
  const file = path.join(CONNECTORS_DIR, `${safe}.json`)
  if (!file.startsWith(CONNECTORS_DIR) || !fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}

// ---------------------------------------------------------------------------
// 1. Published catalog metadata (mirror of meta.grengin.com, CORS-enabled)
// ---------------------------------------------------------------------------

router.get('/connectors.json', (_req, res) => {
  res.json(catalog)
})

/** Versioned manifest, as meta.grengin.com/connectors/<key>/versions/<version>.json. */
router.get('/connectors/:key/versions/:version.json', (req, res) => {
  const cfg = readConfig(req.params.key)
  if (!cfg || cfg.version !== req.params.version) {
    res.status(404).json({ detail: 'Unknown connector version' })
    return
  }
  res.json(cfg)
})

router.get('/connectors/:key.json', (req, res) => {
  const cfg = readConfig(req.params.key)
  if (!cfg) {
    res.status(404).json({ detail: 'Unknown connector' })
    return
  }
  res.json(cfg)
})

/**
 * Icon proxy. The published catalog points icons at meta.grengin.com, which
 * rejects some clients; proxying them through the mock (with a browser UA)
 * guarantees they render in local development. Icons are rewritten to this
 * path by the frontend when VITE_META_BASE is the mock server.
 */
router.get('/connectors/icons/:file', async (req, res) => {
  const file = req.params.file.replace(/[^a-z0-9.-]/gi, '')
  try {
    const upstream = await fetch(`${META_ICON_BASE}/${file}`, {
      headers: { 'User-Agent': BROWSER_UA },
    })
    if (!upstream.ok) {
      res.status(upstream.status).end()
      return
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/svg+xml')
    res.setHeader('Cache-Control', 'public, max-age=86400')
    res.send(buf)
  } catch {
    res.status(502).end()
  }
})

// ---------------------------------------------------------------------------
// 2. Real connection lifecycle (mirrors test-devel.grengin.com /connectors)
//
// Per-user OAuth connections for the signed-in caller. This
// is the real source of "connected or not" that the frontend reads. The mock
// resolves OAuth in one shot (no popup): connect returns `connected`.
// ---------------------------------------------------------------------------

type ConnectionStatus =
  | 'pending'
  | 'awaiting_confirmation'
  | 'connected'
  | 'expired'
  | 'revoked'
  | 'failed'

interface ConnectorConnection {
  id: string
  connector_key: string
  catalog_version: string
  status: ConnectionStatus
  revocation_pending: boolean
  scopes: string[]
  authorization_url: string | null
  connected_at: string | null
  expires_at: string | null
  server_id: string | null
  provider_revocation: 'revoked' | 'pending' | 'unsupported' | 'not_applicable' | null
}

function catalogVersionOf(key: string): string {
  const entry = catalog.catalog.find((c) => c.key === key) as
    | (CatalogEntry & { latestVersion?: string })
    | undefined
  return entry?.latestVersion ?? '1.0.0'
}

function scopesOf(key: string): string[] {
  const cfg = readConfig(key) as
    | { capabilities?: { read?: { tools: string[] }[] } }
    | null
  return (cfg?.capabilities?.read ?? []).flatMap((g) => g.tools).slice(0, 6)
}

/** The caller's connections, keyed by id. */
const connections: ConnectorConnection[] = []

function makeConnection(
  key: string,
  status: ConnectionStatus,
  version = catalogVersionOf(key),
): ConnectorConnection {
  const now = new Date().toISOString()
  return {
    id: crypto.randomUUID(),
    connector_key: key,
    catalog_version: version,
    status,
    revocation_pending: false,
    scopes: scopesOf(key),
    authorization_url: null,
    connected_at: status === 'connected' ? now : null,
    expires_at: null,
    server_id: null,
    provider_revocation: null,
  }
}

// Seed the caller as connected to a few connectors.
for (const key of ['gmail', 'slack']) {
  connections.push(makeConnection(key, 'connected'))
}

/** GET /connectors — the caller's stored connections. */
router.get('/connectors', requireAuth, (_req, res) => {
  res.json(connections)
})

/**
 * Pending consents, keyed by connection id: the OAuth `state`, the webapp origin
 * to return to, and the confirmation code issued once the user approves.
 */
const consents = new Map<string, { state: string; returnOrigin: string; code?: string }>()

/** POST /connectors/:connector_key/connect — start or resume OAuth. */
router.post('/connectors/:connector_key/connect', requireAuth, (req, res) => {
  const key = req.params.connector_key
  const entry = catalog.catalog.find((c) => c.key === key)
  if (!entry) {
    res.status(404).json({ detail: 'Invalid connector' })
    return
  }
  const version = String(req.body?.version ?? catalogVersionOf(key))
  const serverId = (req.body?.server_id ?? null) as string | null
  let conn = connections.find(
    (c) => c.connector_key === key && c.status !== 'revoked',
  )
  if (conn?.status === 'connected') {
    res.json(conn)
    return
  }
  if (!conn) {
    conn = makeConnection(key, 'pending', version)
    connections.push(conn)
  }
  // Like the real broker: pending until the user approves on the vendor page,
  // which sends the popup back to the webapp's /mcp/oauth/callback.
  const state = crypto.randomUUID()
  const returnOrigin = req.get('origin') ?? 'http://localhost:5174'
  consents.set(conn.id, { state, returnOrigin })
  conn.status = 'pending'
  conn.catalog_version = version
  conn.server_id = serverId
  conn.authorization_url = `http://localhost:3000/connectors/mock-consent?connection_id=${conn.id}&state=${state}`
  res.json(conn)
})

/** GET /connectors/mock-consent — stand-in for the vendor consent page. */
router.get('/connectors/mock-consent', (req, res) => {
  const id = String(req.query.connection_id ?? '')
  const conn = connections.find((c) => c.id === id)
  const consent = consents.get(id)
  if (!conn || !consent || consent.state !== req.query.state) {
    res.status(400).send('Unknown or expired consent request')
    return
  }
  const name = catalog.catalog.find((c) => c.key === conn.connector_key)?.display_name ?? conn.connector_key
  res.type('html').send(`<!doctype html><meta charset="utf-8"><title>Mock consent</title>
<body style="font:15px system-ui;padding:32px"><h2>Allow Grengin to access ${name}?</h2>
<p>Mock vendor consent page (local mock server).</p>
<form method="post" action="/connectors/mock-consent/approve">
<input type="hidden" name="connection_id" value="${id}"><button style="padding:8px 16px">Allow</button></form>`)
})

/** POST /connectors/mock-consent/approve — vendor approved; return to the webapp. */
router.post('/connectors/mock-consent/approve', (req, res) => {
  const id = String(req.body?.connection_id ?? '')
  const conn = connections.find((c) => c.id === id)
  const consent = consents.get(id)
  if (!conn || !consent) {
    res.status(400).send('Unknown or expired consent request')
    return
  }
  consent.code = crypto.randomBytes(32).toString('hex')
  conn.status = 'awaiting_confirmation'
  conn.authorization_url = null
  const fragment = new URLSearchParams({
    connector_approval: consent.code,
    connection_id: id,
    state: consent.state,
  })
  res.redirect(`${consent.returnOrigin}/mcp/oauth/callback#${fragment.toString()}`)
})

/** GET /connectors/:connection_id — verify status with the broker. */
router.get('/connectors/:connection_id', requireAuth, (req, res) => {
  const conn = connections.find((c) => c.id === req.params.connection_id)
  if (!conn) {
    res.status(404).json({ detail: 'Connection not found or not owned by caller' })
    return
  }
  res.json(conn)
})

/** POST /connectors/:connection_id/complete — confirm ownership and activate. */
router.post('/connectors/:connection_id/complete', requireAuth, (req, res) => {
  const conn = connections.find((c) => c.id === req.params.connection_id)
  if (!conn) {
    res.status(404).json({ detail: 'Connection not owned by caller' })
    return
  }
  const code = String(req.body?.confirmation_code ?? '')
  const consent = consents.get(conn.id)
  if (!/^[0-9a-f]{64}$/.test(code) || !consent?.code || consent.code !== code) {
    res.status(400).json({ detail: 'Invalid confirmation code format' })
    return
  }
  consents.delete(conn.id)
  conn.status = 'connected'
  conn.connected_at = new Date().toISOString()
  res.json(conn)
})

/** POST /connectors/:connection_id/disconnect — disable access and clean up. */
router.post('/connectors/:connection_id/disconnect', requireAuth, (req, res) => {
  const conn = connections.find((c) => c.id === req.params.connection_id)
  if (!conn) {
    res.status(404).json({ detail: 'Connection not found or not owned by caller' })
    return
  }
  conn.status = 'revoked'
  conn.connected_at = null
  conn.revocation_pending = false
  conn.provider_revocation = 'revoked'
  res.json(conn)
})

export default router
