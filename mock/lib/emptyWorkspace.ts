// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

/**
 * Empty-workspace mode (Microsoft / azure SSO sign-in). See `workspace` in
 * lib/store.ts.
 *
 * The in-memory stores (chats, projects, files, departments, AI engines) are
 * emptied on sign-in, so their routes are already empty. This middleware
 * covers the routes that answer from static JSON fixtures: it keeps each
 * response's shape but empties every list and zeroes every count, so pages
 * render their real empty states. Users are the signed-in creator plus anyone
 * created during the session; models are only those of engines that now hold
 * a key.
 */

import type { Request, Response, NextFunction } from 'express'
import { aiEngines, ssoSession, workspace } from './store.js'
import rolesListExample from '../examples/admin/roles-list.response.json' with { type: 'json' }

/** Fixture-backed GET routes whose data belongs to a workspace with history. */
const EMPTY_GET: RegExp[] = [
  /^\/admin\/dashboard$/,
  /^\/admin\/analytics(\/|$)/,
  /^\/me\/analytics(\/|$)/,
  /^\/analytics\/(costs|usage|trends)$/,
  /^\/audit\/logs$/,
  /^\/admin\/audit-logs$/,
  /^\/admin\/users\/[^/]+\/usage$/,
  /^\/admin\/rate-limits$/,
  /^\/admin\/budgets$/,
  /^\/admin\/mcp-servers$/,
  /^\/mcp-servers$/,
  /^\/me\/skills$/,
  /^\/conversations\/[^/]+\/skills$/,
  /^\/admin\/prompt-metrics$/,
  /^\/admin\/role-prompts$/,
  /^\/me\/usage$/,
]

/** Single records that cannot exist in an empty workspace. */
const NOT_FOUND_GET: RegExp[] = [
  /^\/admin\/mcp-servers\/[^/]+(\/.*)?$/,
  /^\/admin\/role-prompts\/[^/]+$/,
  /^\/me\/skills\/[^/]+$/,
]

const USERS_GET = /^\/(admin\/users|me\/administered-departments\/users)$/

/** Same shape, no data: lists empty, counts zero, everything else kept. */
export function emptyLike(value: unknown): unknown {
  if (Array.isArray(value)) return []
  if (typeof value === 'number') return 0
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = emptyLike(v)
    return out
  }
  return value
}

function workspaceUsers(req: Request) {
  let users = [...(ssoSession.creator ? [ssoSession.creator] : []), ...workspace.users]
  // RolesTab lists one role's users: only the creator holds a role (Super Admin).
  const roleId = req.query.role_id ? String(req.query.role_id) : ''
  if (roleId) users = roleId === superAdminRoleId ? users.slice(0, ssoSession.creator ? 1 : 0) : []
  const search = String(req.query.search ?? '').toLowerCase()
  const filtered = search
    ? users.filter((u) =>
        [u.name, u.email].some((v) => String(v ?? '').toLowerCase().includes(search)),
      )
    : users
  const offset = Number(req.query.offset ?? 0)
  const limit = Number(req.query.limit ?? (filtered.length || 1))
  return {
    users: filtered.slice(offset, offset + limit),
    total: filtered.length,
    limit,
    offset,
  }
}

const superAdminRoleId =
  rolesListExample.roles.find((r) => r.is_system && r.name === 'Super Admin')?.id ?? ''

type Role = { id: string; name: string; is_system?: boolean; user_count?: number }

export function emptyWorkspace(req: Request, res: Response, next: NextFunction) {
  if (!workspace.empty) return next()
  const path = req.path

  if (req.method === 'GET') {
    if (NOT_FOUND_GET.some((re) => re.test(path))) {
      return res.status(404).json({ detail: 'Not Found' })
    }
    if (USERS_GET.test(path)) {
      return res.json(workspaceUsers(req))
    }
    if (path === '/admin/roles') {
      // Built-in roles plus any made here; only Super Admin has a member.
      const send = res.json.bind(res)
      res.json = (body: unknown) => {
        const page = body as { roles?: Role[] }
        const roles = (page.roles ?? [])
          .filter((r) => r.is_system || workspace.roleIds.includes(r.id))
          .map((r) => {
            const isSuper = r.id === superAdminRoleId
            return { ...r, user_count: isSuper && ssoSession.creator ? 1 : 0 }
          })
        return send({ ...page, roles })
      }
      return next()
    }
    if (path === '/skills') {
      // A new workspace has the built-in skills only.
      const send = res.json.bind(res)
      res.json = (body: unknown) => {
        const page = body as { skills?: { is_builtin?: boolean }[] }
        const skills = (page.skills ?? []).filter((s) => s.is_builtin)
        return send({ ...page, skills, total: skills.length })
      }
      return next()
    }
    if (path === '/models' || EMPTY_GET.some((re) => re.test(path))) {
      const send = res.json.bind(res)
      res.json = (body: unknown) => {
        if (path === '/models') {
          // Only providers whose engine has a key are available to chat.
          const connected = new Set(
            [...aiEngines.values()].filter((e) => e.api_key_configured).map((e) => e.engine_key),
          )
          const models = body as { providers?: { key: string }[] }
          return send({
            ...models,
            providers: (models.providers ?? []).filter((p) => connected.has(p.key)),
          })
        }
        return send(emptyLike(body))
      }
    }
    return next()
  }

  // Roles created in the empty workspace stay visible in it.
  if (req.method === 'POST' && path === '/admin/roles') {
    const send = res.json.bind(res)
    res.json = (body: unknown) => {
      const id = (body as { id?: string })?.id
      if (res.statusCode < 300 && id) workspace.roleIds.push(id)
      return send(body)
    }
  }

  // Users created in the empty workspace become part of it.
  if (req.method === 'POST' && path === '/admin/users') {
    const send = res.json.bind(res)
    res.json = (body: unknown) => {
      if (res.statusCode < 300 && body && typeof body === 'object') {
        workspace.users.push({
          status: 'active',
          is_super_admin: false,
          roles: [],
          ...(body as Record<string, unknown>),
        })
      }
      return send(body)
    }
  }
  next()
}
