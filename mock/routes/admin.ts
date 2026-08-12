// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import { requireAuth } from '../lib/middleware.js'
import {
  aiEngines,
  departments,
  type AIEngineDetail,
  type AIEngineModelsResponse,
  type Department,
  type DepartmentTree,
  type DepartmentBudgetStatus,
} from '../lib/store.js'
import dashboardExample from '../examples/admin/dashboard.response.json' with { type: 'json' }
import organizationExample from '../examples/admin/organization.response.json' with { type: 'json' }
import {
  DEMO_PERMISSION_CATALOG,
  DEMO_AUDIT_LOGS,
  AUDIT_ACTIONS,
  DEMO_PROVIDERS,
  promptMetricsFor,
  type DemoUser,
} from '../lib/demoSeed.js'
import {
  users as liveUsers,
  roles as liveRoles,
  rolePrompts as liveRolePrompts,
  deptPrompts as liveDeptPrompts,
  usersWithVisitor,
  findUser,
  usersInDepartmentLive,
  roleUserCount,
  departmentPromptsLive,
  deleteUser,
} from '../lib/demoState.js'

const router = Router()

// Map a canonical DemoUser to the User row shape the admin table + role expand
// read (spec §3.6 / §3.9). Kept in one place so every user-returning endpoint is
// identical.
function toUserRow(u: DemoUser) {
  return {
    id: u.id,
    sub: u.sub,
    email: u.email,
    name: u.name,
    picture: u.picture,
    role: u.role,
    roles: u.roles,
    status: u.status,
    department_id: u.department_id,
    department_name: u.department_name,
    department: u.department,
    is_super_admin: u.is_super_admin,
    has_password: u.has_password,
    mfa_enabled: u.mfa_enabled,
    last_login_at: u.last_login_at,
    created_at: u.created_at,
    updated_at: u.updated_at,
  }
}

// Shared user-list handler for /admin/users and /me/administered-departments/users.
// Supports search, role_id / status / department filters, sort and limit/offset
// (spec §3.6). The visitor's own identity is pinned at the top (spec §3.6).
function listUsers(req: import('express').Request, res: import('express').Response) {
  const q = req.query
  let rows = usersWithVisitor()

  const search = typeof q.search === 'string' ? q.search.toLowerCase().trim() : ''
  if (search) rows = rows.filter((u) => u.name.toLowerCase().includes(search) || u.email.toLowerCase().includes(search))
  if (typeof q.role_id === 'string' && q.role_id) rows = rows.filter((u) => u.role_id === q.role_id)
  if (typeof q.status === 'string' && q.status) rows = rows.filter((u) => u.status === q.status)
  if (typeof q.department === 'string' && q.department) {
    const d = q.department
    rows = rows.filter((u) => u.department_id === d || u.department_name === d)
  }

  const sort = typeof q.sort === 'string' ? q.sort : 'created_at'
  const ascending = String(q.ascending ?? (sort === 'name' || sort === 'email')) === 'true'
  const pinned = rows[0]?.id === 'usr-visitor' ? rows[0] : null
  const sortable = pinned ? rows.slice(1) : rows
  sortable.sort((a, b) => {
    let av: string | number
    let bv: string | number
    if (sort === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase() }
    else if (sort === 'email') { av = a.email.toLowerCase(); bv = b.email.toLowerCase() }
    else if (sort === 'updated_at') { av = new Date(a.updated_at).getTime(); bv = new Date(b.updated_at).getTime() }
    else { av = new Date(a.created_at).getTime(); bv = new Date(b.created_at).getTime() }
    if (av < bv) return ascending ? -1 : 1
    if (av > bv) return ascending ? 1 : -1
    return 0
  })
  const ordered = pinned ? [pinned, ...sortable] : sortable

  const limit = Math.max(1, parseInt(String(q.limit ?? '20'), 10) || 20)
  const offset = Math.max(0, parseInt(String(q.offset ?? '0'), 10) || 0)
  res.json({
    users: ordered.slice(offset, offset + limit).map(toUserRow),
    total: ordered.length,
    limit,
    offset,
  })
}

// Dashboard
router.get('/admin/dashboard', requireAuth, (req, res) => {
  res.json(dashboardExample)
})

// Users (spec §3.6). Sourced from the canonical seed; visitor pinned at top.
router.get('/admin/users', requireAuth, listUsers)

const findSeedUser = (id: string) => findUser(id)
// The pinned visitor row is a fixed overlay — it can't be edited/deleted.
const isVisitor = (id: string) => id === 'usr-visitor'
const roleNameFor = (roleId: string) => liveRoles.find((r) => r.id === roleId)?.name ?? 'User'
const deptNameFor = (deptId: string | null | undefined) => (deptId ? departments.get(deptId)?.name ?? null : null)

// Create a user — actually persisted (spec: live create). Appears immediately in
// the table, analytics and role counts.
router.post('/admin/users', requireAuth, (req, res) => {
  const b = req.body ?? {}
  const role_id: string = b.role_id ?? 'role-user'
  const department_id: string | null = b.department_id ?? null
  const deptName = deptNameFor(department_id)
  const now = new Date().toISOString()
  const user: DemoUser = {
    id: `usr-${crypto.randomUUID().slice(0, 8)}`,
    sub: `demo|${crypto.randomUUID().slice(0, 8)}`,
    email: b.email ?? `user${liveUsers.length + 1}@grengin.com`,
    name: b.name ?? 'New User',
    picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name ?? 'New User')}`,
    role: role_id === 'role-super' ? 'admin' : 'user',
    roles: [roleNameFor(role_id)],
    role_id,
    scope_department_id: b.scope_department_id ?? null,
    status: b.status ?? 'active',
    department_id,
    department_name: deptName,
    department: deptName ?? 'Unassigned',
    is_super_admin: role_id === 'role-super',
    has_password: true,
    mfa_enabled: false,
    last_login_at: now,
    created_at: now,
    updated_at: now,
  }
  liveUsers.push(user)
  res.status(201).json(toUserRow(user))
})

router.get('/admin/users/:userId', requireAuth, (req, res) => {
  const user = findSeedUser(req.params.userId)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  res.json(toUserRow(user))
})

router.put('/admin/users/:userId', requireAuth, (req, res) => {
  const user = liveUsers.find((u) => u.id === req.params.userId)
  if (!user) {
    if (isVisitor(req.params.userId)) return res.status(403).json({ detail: 'The demo visitor cannot be edited' })
    return res.status(404).json({ detail: 'User not found' })
  }
  const b = req.body ?? {}
  if (b.name !== undefined) { user.name = b.name; user.picture = `https://ui-avatars.com/api/?name=${encodeURIComponent(b.name)}` }
  if (b.email !== undefined) user.email = b.email
  if (b.status !== undefined) user.status = b.status
  if (b.role_id !== undefined) {
    user.role_id = b.role_id
    user.roles = [roleNameFor(b.role_id)]
    user.is_super_admin = b.role_id === 'role-super'
    user.role = b.role_id === 'role-super' ? 'admin' : 'user'
  }
  if (b.department_id !== undefined) {
    user.department_id = b.department_id || null
    user.department_name = deptNameFor(user.department_id)
    user.department = user.department_name ?? 'Unassigned'
  }
  user.updated_at = new Date().toISOString()
  res.json(toUserRow(user))
})

router.delete('/admin/users/:userId', requireAuth, (req, res) => {
  if (isVisitor(req.params.userId)) return res.status(403).json({ detail: 'The demo visitor cannot be deleted' })
  deleteUser(req.params.userId)
  res.status(204).send()
})

router.patch('/admin/users/:userId/status', requireAuth, (req, res) => {
  const user = liveUsers.find((u) => u.id === req.params.userId)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  const { status } = req.body
  if (!status || !['active', 'inactive', 'pending', 'deactivated'].includes(status)) {
    return res.status(400).json({ detail: 'Invalid status value' })
  }
  user.status = status
  user.updated_at = new Date().toISOString()
  res.json(toUserRow(user))
})

router.get('/admin/users/:userId/usage', requireAuth, (req, res) => {
  res.json(dashboardExample.costs)
})

// Departments - v1.2 hierarchical departments API

// Helper: Build tree from flat departments
function buildDepartmentTree(depts: Department[], parentId: string | null = null, maxDepth: number = 10, currentDepth: number = 0): DepartmentTree[] {
  if (currentDepth >= maxDepth) return []

  return depts
    .filter(d => d.parent_id === parentId)
    .map(dept => ({
      ...deptView(dept),
      children: buildDepartmentTree(depts, dept.id, maxDepth, currentDepth + 1),
    }))
}

// Helper: Generate path from parent
function generatePath(parentId: string | null, name: string): string {
  if (!parentId) {
    return '/' + name.toLowerCase().replace(/\s+/g, '-')
  }
  const parent = departments.get(parentId)
  if (!parent) return '/' + name.toLowerCase().replace(/\s+/g, '-')
  return parent.path + '/' + name.toLowerCase().replace(/\s+/g, '-')
}

// Helper: Get depth from parent
function getDepth(parentId: string | null): number {
  if (!parentId) return 0
  const parent = departments.get(parentId)
  return parent ? parent.depth + 1 : 0
}

// Overlay LIVE member counts + admins (from the mutable users list) onto a stored
// department, so creating/deleting/moving users updates the org tree immediately.
function deptView<T extends Department>(dept: T): T {
  const members = usersInDepartmentLive(dept.id)
  return {
    ...dept,
    member_count: members.length,
    total_member_count: members.length,
    admin_ids: members.filter((u) => u.role_id === 'role-dept').map((u) => u.id),
  }
}

// List departments
router.get('/admin/departments', requireAuth, (req, res) => {
  const { parent_id, include_children } = req.query
  let result = Array.from(departments.values())

  if (parent_id === 'root') {
    result = result.filter(d => d.parent_id === null)
  } else if (parent_id) {
    result = result.filter(d => d.parent_id === parent_id)
    if (include_children === 'true') {
      // Include all descendants
      const getAllDescendants = (parentId: string): Department[] => {
        const children = Array.from(departments.values()).filter(d => d.parent_id === parentId)
        return children.concat(children.flatMap(c => getAllDescendants(c.id)))
      }
      result = result.concat(getAllDescendants(parent_id as string))
    }
  }

  res.json({ departments: result.map(deptView), total: result.length })
})

// Create department
router.post('/admin/departments', requireAuth, (req, res) => {
  const { name, description, parent_id, admin_ids } = req.body

  if (!name) {
    return res.status(400).json({ detail: 'Name is required' })
  }

  // Check parent exists if provided
  if (parent_id && !departments.get(parent_id)) {
    return res.status(400).json({ detail: 'Parent department not found' })
  }

  const id = crypto.randomUUID()
  const now = new Date().toISOString()

  const newDept: Department = {
    id,
    name,
    description: description || null,
    parent_id: parent_id || null,
    path: generatePath(parent_id, name),
    depth: getDepth(parent_id),
    admin_ids: admin_ids || [],
    member_count: 0,
    total_member_count: 0,
    child_count: 0,
    budget_allocated: null,
    budget_distributed: 0,
    budget_available: 0,
    budget_used: 0,
    budget_period: 'monthly',
    created_at: now,
    updated_at: now,
  }

  departments.set(id, newDept)

  // Update parent's child_count
  if (parent_id) {
    const parent = departments.get(parent_id)
    if (parent) {
      departments.set(parent_id, { ...parent, child_count: parent.child_count + 1, updated_at: now })
    }
  }

  res.status(201).json(newDept)
})

// Get department tree
router.get('/admin/departments/tree', requireAuth, (req, res) => {
  const { root_id, max_depth } = req.query
  const depth = Math.min(Math.max(parseInt(max_depth as string) || 10, 1), 10)

  const allDepts = Array.from(departments.values())

  if (root_id) {
    const root = departments.get(root_id as string)
    if (!root) {
      return res.status(404).json({ detail: 'Department not found' })
    }
    const tree = buildDepartmentTree(allDepts, root_id as string, depth)
    res.json({ tree: [{ ...root, children: tree }] })
  } else {
    const tree = buildDepartmentTree(allDepts, null, depth)
    res.json({ tree })
  }
})

// Get department by ID
router.get('/admin/departments/:departmentId', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }
  res.json(deptView(dept))
})

// --- "My administered departments" aliases -------------------------------
// The frontend reads the department tree/list and scoped users through the
// /me/administered-departments* endpoints. In the mock these mirror the full
// data set (the mock user is a super admin who administers everything).
router.get('/me/administered-departments/tree', requireAuth, (_req, res) => {
  const allDepts = Array.from(departments.values())
  res.json({ tree: buildDepartmentTree(allDepts, null, 10) })
})

router.get('/me/administered-departments/users', requireAuth, listUsers)

router.get('/me/administered-departments', requireAuth, (_req, res) => {
  const result = Array.from(departments.values()).map(deptView)
  res.json({ departments: result, total: result.length })
})

// Update department
router.put('/admin/departments/:departmentId', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }

  const { name, description, admin_ids } = req.body
  const now = new Date().toISOString()

  const updated: Department = {
    ...dept,
    ...(name !== undefined && { name, path: generatePath(dept.parent_id, name) }),
    ...(description !== undefined && { description }),
    ...(admin_ids !== undefined && { admin_ids }),
    updated_at: now,
  }

  departments.set(req.params.departmentId, updated)
  res.json(updated)
})

// Delete department
router.delete('/admin/departments/:departmentId', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }

  const { force } = req.query

  // Check if has children
  const hasChildren = Array.from(departments.values()).some(d => d.parent_id === req.params.departmentId)
  if (hasChildren && force !== 'true') {
    return res.status(400).json({ detail: 'Cannot delete department with children. Use force=true to reassign.' })
  }

  // Check if has members (in mock, we skip this check for simplicity)
  if (dept.member_count > 0 && force !== 'true') {
    return res.status(400).json({ detail: 'Cannot delete department with members. Use force=true to reassign.' })
  }

  // If force, reassign children to parent
  if (force === 'true' && hasChildren) {
    Array.from(departments.values())
      .filter(d => d.parent_id === req.params.departmentId)
      .forEach(child => {
        const updatedChild: Department = {
          ...child,
          parent_id: dept.parent_id,
          path: generatePath(dept.parent_id, child.name),
          depth: getDepth(dept.parent_id),
          updated_at: new Date().toISOString(),
        }
        departments.set(child.id, updatedChild)
      })
  }

  // Update parent's child_count
  if (dept.parent_id) {
    const parent = departments.get(dept.parent_id)
    if (parent) {
      departments.set(dept.parent_id, {
        ...parent,
        child_count: Math.max(0, parent.child_count - 1),
        updated_at: new Date().toISOString(),
      })
    }
  }

  departments.delete(req.params.departmentId)
  res.status(204).send()
})

// Move department
router.post('/admin/departments/:departmentId/move', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }

  const { new_parent_id } = req.body

  // Check for circular reference
  if (new_parent_id) {
    let current = departments.get(new_parent_id)
    while (current) {
      if (current.id === req.params.departmentId) {
        return res.status(400).json({ detail: 'Cannot move department to its own descendant' })
      }
      current = current.parent_id ? departments.get(current.parent_id) : undefined
    }

    // Check new parent exists
    if (!departments.get(new_parent_id)) {
      return res.status(404).json({ detail: 'New parent department not found' })
    }
  }

  const now = new Date().toISOString()

  // Update old parent's child_count
  if (dept.parent_id) {
    const oldParent = departments.get(dept.parent_id)
    if (oldParent) {
      departments.set(dept.parent_id, {
        ...oldParent,
        child_count: Math.max(0, oldParent.child_count - 1),
        updated_at: now,
      })
    }
  }

  // Update new parent's child_count
  if (new_parent_id) {
    const newParent = departments.get(new_parent_id)
    if (newParent) {
      departments.set(new_parent_id, {
        ...newParent,
        child_count: newParent.child_count + 1,
        updated_at: now,
      })
    }
  }

  // Update the department
  const updated: Department = {
    ...dept,
    parent_id: new_parent_id || null,
    path: generatePath(new_parent_id, dept.name),
    depth: getDepth(new_parent_id),
    updated_at: now,
  }

  departments.set(req.params.departmentId, updated)

  // Update all descendants' paths and depths
  const updateDescendants = (parentId: string, parentPath: string, parentDepth: number) => {
    Array.from(departments.values())
      .filter(d => d.parent_id === parentId)
      .forEach(child => {
        const updatedChild: Department = {
          ...child,
          path: parentPath + '/' + child.name.toLowerCase().replace(/\s+/g, '-'),
          depth: parentDepth + 1,
          updated_at: now,
        }
        departments.set(child.id, updatedChild)
        updateDescendants(child.id, updatedChild.path, updatedChild.depth)
      })
  }
  updateDescendants(req.params.departmentId, updated.path, updated.depth)

  res.json(updated)
})

// Get department budget
router.get('/admin/departments/:departmentId/budget', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }

  // Get sub-department budgets
  const subDepts = Array.from(departments.values()).filter(d => d.parent_id === req.params.departmentId)

  const budgetStatus: DepartmentBudgetStatus = {
    department_id: dept.id,
    budget_allocated: dept.budget_allocated || 0,
    budget_distributed: dept.budget_distributed,
    budget_available: dept.budget_available,
    budget_used: dept.budget_used,
    budget_used_total: dept.budget_used + subDepts.reduce((sum, d) => sum + d.budget_used, 0),
    period: dept.budget_period,
    period_start: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
    period_end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).toISOString(),
    sub_department_budgets: subDepts.map(d => ({
      department_id: d.id,
      name: d.name,
      allocated: d.budget_allocated || 0,
      used: d.budget_used,
    })),
  }

  res.json(budgetStatus)
})

// Set department budget
router.put('/admin/departments/:departmentId/budget', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }

  const { budget_allocated, budget_period, action_on_exceed } = req.body

  // Check parent's available budget
  if (dept.parent_id && budget_allocated !== undefined) {
    const parent = departments.get(dept.parent_id)
    if (parent) {
      const oldAllocation = dept.budget_allocated || 0
      const newAllocation = budget_allocated
      const parentAvailable = parent.budget_available + oldAllocation

      if (newAllocation > parentAvailable) {
        return res.status(400).json({ detail: `Budget exceeds parent's available budget (${parentAvailable})` })
      }

      // Update parent's distributed and available
      departments.set(dept.parent_id, {
        ...parent,
        budget_distributed: parent.budget_distributed - oldAllocation + newAllocation,
        budget_available: parent.budget_available + oldAllocation - newAllocation,
        updated_at: new Date().toISOString(),
      })
    }
  }

  const now = new Date().toISOString()
  const updated: Department = {
    ...dept,
    ...(budget_allocated !== undefined && {
      budget_allocated,
      budget_available: budget_allocated - dept.budget_distributed,
    }),
    ...(budget_period !== undefined && { budget_period }),
    updated_at: now,
  }

  departments.set(req.params.departmentId, updated)
  res.json(updated)
})

// List department members
router.get('/admin/departments/:departmentId/members', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }

  const { include_sub_departments } = req.query

  // Members from the canonical seed (spec §3.5: ≥5 members per department).
  let members = usersInDepartmentLive(req.params.departmentId).map(toUserRow)

  if (include_sub_departments === 'true') {
    const getDescendantIds = (parentId: string): string[] => {
      const children = Array.from(departments.values()).filter(d => d.parent_id === parentId)
      return children.map(c => c.id).concat(children.flatMap(c => getDescendantIds(c.id)))
    }
    const descendantIds = getDescendantIds(req.params.departmentId)
    const subMembers = descendantIds.flatMap((id) => usersInDepartmentLive(id).map(toUserRow))
    members = members.concat(subMembers)
  }

  res.json({ members, total: members.length })
})

// Add members to department
router.post('/admin/departments/:departmentId/members', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }

  const { user_ids } = req.body
  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ detail: 'user_ids array is required' })
  }

  // Actually reassign the users to this department (live). deptView() then
  // reflects the new member count everywhere.
  for (const uid of user_ids) {
    const u = liveUsers.find((x) => x.id === uid)
    if (u) { u.department_id = dept.id; u.department_name = dept.name; u.department = dept.name; u.updated_at = new Date().toISOString() }
  }
  res.json(deptView(departments.get(req.params.departmentId)!))
})

// Remove members from department
router.delete('/admin/departments/:departmentId/members', requireAuth, (req, res) => {
  const dept = departments.get(req.params.departmentId)
  if (!dept) {
    return res.status(404).json({ detail: 'Department not found' })
  }

  const { user_ids } = req.body
  if (!user_ids || !Array.isArray(user_ids) || user_ids.length === 0) {
    return res.status(400).json({ detail: 'user_ids array is required' })
  }

  // Actually unassign the users (live) → they move to the "Unassigned" bucket.
  for (const uid of user_ids) {
    const u = liveUsers.find((x) => x.id === uid && x.department_id === dept.id)
    if (u) { u.department_id = null; u.department_name = null; u.department = 'Unassigned'; u.updated_at = new Date().toISOString() }
  }
  res.json(deptView(departments.get(req.params.departmentId)!))
})

// Organization
router.get('/admin/organization', requireAuth, (req, res) => {
  res.json(organizationExample)
})

router.put('/admin/organization', requireAuth, (req, res) => {
  res.json({ ...organizationExample, ...req.body, updated_at: new Date().toISOString() })
})

// AI Engines
router.get('/admin/ai-engines', requireAuth, (req, res) => {
  res.json(Array.from(aiEngines.values()))
})

router.get('/admin/ai-engines/:engineKey', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }
  res.json(engine)
})

router.put('/admin/ai-engines/:engineKey', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  // Validate that default_model is in whitelisted_models
  const defaultModel = req.body.default_model !== undefined ? req.body.default_model : engine.default_model
  const whitelistedModels = req.body.whitelisted_models !== undefined ? req.body.whitelisted_models : engine.whitelisted_models
  
  if (defaultModel && whitelistedModels && !whitelistedModels.includes(defaultModel)) {
    return res.status(400).json({
      detail: 'The default model must be included in the whitelisted models.'
    })
  }

  // If setting this engine as the default engine (is_default: true),
  // unset all other engines as default
  if (req.body.is_default === true) {
    aiEngines.forEach((otherEngine, key) => {
      if (key !== req.params.engineKey && otherEngine.is_default) {
        aiEngines.set(key, {
          ...otherEngine,
          is_default: false,
          updated_at: new Date().toISOString(),
        })
      }
    })
  }

  const updated: AIEngineDetail = {
    ...engine,
    ...(req.body.is_enabled !== undefined && { is_enabled: req.body.is_enabled }),
    ...(req.body.whitelisted_models !== undefined && { whitelisted_models: req.body.whitelisted_models }),
    ...(req.body.default_model !== undefined && { default_model: req.body.default_model }),
    ...(req.body.is_default !== undefined && { is_default: req.body.is_default }),
    updated_at: new Date().toISOString(),
  }

  if (req.body.api_key) {
    updated.api_key_configured = true
    updated.api_key_status = 'not_validated'
    updated.api_key_preview = '...' + req.body.api_key.slice(-4)
  }

  aiEngines.set(req.params.engineKey, updated)
  res.json(updated)
})

router.post('/admin/ai-engines/:engineKey/validate', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  if (!engine.api_key_configured) {
    return res.status(400).json({ detail: 'No API key configured for this engine' })
  }

  const updated: AIEngineDetail = {
    ...engine,
    api_key_status: 'valid',
    api_key_last_validated_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  aiEngines.set(req.params.engineKey, updated)

  res.json({
    valid: true,
    message: 'API key validated successfully',
    models_available: 15,
  })
})

router.get('/admin/ai-engines/:engineKey/models', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  // All models listed; only cheap/cost-effective ones whitelisted (spec §3.7),
  // derived from the single canonical model catalog.
  const provider = DEMO_PROVIDERS.find((p) => p.engine_key === req.params.engineKey)
  const models: AIEngineModelsResponse['models'] = (provider?.models ?? []).map((m) => ({
    model_id: m.model_id,
    display_name: m.display_name,
    is_whitelisted: m.cheap,
    model_type: m.model_type,
    capabilities:
      m.model_type === 'image_generator'
        ? { vision: false, function_calling: false, streaming: false }
        : { vision: true, function_calling: true, streaming: true },
  }))

  res.json({ models })
})

router.put('/admin/ai-engines/:engineKey/api-key', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  const { api_key } = req.body
  if (!api_key) {
    return res.status(400).json({ detail: 'API key is required' })
  }

  const updated: AIEngineDetail = {
    ...engine,
    api_key_configured: true,
    api_key_status: 'not_validated',
    api_key_preview: '...' + api_key.slice(-4),
    api_key_last_validated_at: null,
    updated_at: new Date().toISOString(),
  }
  aiEngines.set(req.params.engineKey, updated)
  res.json(updated)
})

router.delete('/admin/ai-engines/:engineKey/api-key', requireAuth, (req, res) => {
  const engine = aiEngines.get(req.params.engineKey)
  if (!engine) {
    return res.status(404).json({ detail: 'AI engine not found' })
  }

  const updated: AIEngineDetail = {
    ...engine,
    is_enabled: false,
    api_key_configured: false,
    api_key_status: 'not_configured',
    api_key_preview: null,
    api_key_last_validated_at: null,
    updated_at: new Date().toISOString(),
  }
  aiEngines.set(req.params.engineKey, updated)
  res.json(updated)
})

// SSO Providers
import ssoProvidersExample from '../examples/admin/sso-providers-list.response.json' with { type: 'json' }

router.get('/admin/sso-providers', requireAuth, (req, res) => {
  res.json(ssoProvidersExample)
})

router.post('/admin/sso-providers', requireAuth, (req, res) => {
  res.status(201).json({
    id: crypto.randomUUID(),
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

router.get('/admin/sso-providers/:providerId', requireAuth, (req, res) => {
  const provider = ssoProvidersExample.find((p: { id: string }) => p.id === req.params.providerId)
  if (!provider) {
    return res.status(404).json({ detail: 'SSO provider not found' })
  }
  res.json(provider)
})

router.put('/admin/sso-providers/:providerId', requireAuth, (req, res) => {
  const provider = ssoProvidersExample.find((p: { id: string }) => p.id === req.params.providerId)
  if (!provider) {
    return res.status(404).json({ detail: 'SSO provider not found' })
  }
  res.json({ ...provider, ...req.body, updated_at: new Date().toISOString() })
})

router.delete('/admin/sso-providers/:providerId', requireAuth, (req, res) => {
  res.status(204).send()
})

router.post('/admin/sso-providers/:providerId/test', requireAuth, (req, res) => {
  res.json({
    success: true,
    message: 'SSO provider test successful',
    discovery_url: 'https://example.com/.well-known/openid-configuration',
    endpoints_found: {
      authorization: true,
      token: true,
      userinfo: true,
      jwks: true,
    },
  })
})

// Rate Limits
import rateLimitsExample from '../examples/admin/rate-limits-list.response.json' with { type: 'json' }

router.get('/admin/rate-limits', requireAuth, (req, res) => {
  res.json(rateLimitsExample)
})

router.post('/admin/rate-limits', requireAuth, (req, res) => {
  res.status(201).json({
    id: crypto.randomUUID(),
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

router.put('/admin/rate-limits/:limitId', requireAuth, (req, res) => {
  res.json({
    id: req.params.limitId,
    ...req.body,
    updated_at: new Date().toISOString(),
  })
})

router.delete('/admin/rate-limits/:limitId', requireAuth, (req, res) => {
  res.status(204).send()
})

// Budgets
import budgetsExample from '../examples/admin/budgets-list.response.json' with { type: 'json' }

router.get('/admin/budgets', requireAuth, (req, res) => {
  res.json(budgetsExample)
})

router.post('/admin/budgets', requireAuth, (req, res) => {
  res.status(201).json({
    id: crypto.randomUUID(),
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

router.put('/admin/budgets/:budgetId', requireAuth, (req, res) => {
  res.json({
    id: req.params.budgetId,
    ...req.body,
    updated_at: new Date().toISOString(),
  })
})

router.delete('/admin/budgets/:budgetId', requireAuth, (req, res) => {
  res.status(204).send()
})

// Bulk user import
router.post('/admin/users/bulk', requireAuth, (req, res) => {
  res.json({
    total: 5,
    successful: 4,
    failed: 1,
    errors: [
      { row: 3, email: 'invalid@', error: 'Invalid email format' },
    ],
  })
})

// ---------------------------------------------------------------------------
// Host reconfiguration (ENGG-345) — gated on `system:maintain` in the real API.
// Mock handlers return realistic shapes for the System → Maintenance tab.
// ---------------------------------------------------------------------------

// Preflight — whether each reconfigure script exists, is executable, and can run.
router.get('/admin/reconfigure/available', requireAuth, (req, res) => {
  res.json({
    success: true,
    message: 'Reconfigure scripts inspected',
    running_as_root: false,
    sudo_available: true,
    domain: {
      script_path: '/opt/grengin/scripts/reconfigure-domain.sh',
      exists: true,
      executable: true,
      requested_use_sudo: false,
      effective_use_sudo: true,
      available: true,
      reason: null,
    },
    binaries: {
      script_path: '/opt/grengin/scripts/update-binaries.sh',
      exists: true,
      executable: true,
      requested_use_sudo: false,
      effective_use_sudo: true,
      available: true,
      reason: null,
    },
  })
})

// Change the serving domain and (re)issue TLS. Synchronous.
router.post('/admin/reconfigure/domain', requireAuth, (req, res) => {
  const { domain, ssl_mode = 'letsencrypt' } = req.body ?? {}

  if (!domain || typeof domain !== 'string') {
    return res.status(400).json({ detail: 'domain is required' })
  }

  res.json({
    success: true,
    message: `Domain reconfigured to ${domain}`,
    domain,
    ssl_mode,
    redirect_url: `https://${domain}`,
    script_path: '/opt/grengin/scripts/reconfigure-domain.sh',
    output: [
      `==> Reconfiguring domain to ${domain}`,
      `==> SSL mode: ${ssl_mode}`,
      '==> Reloading proxy configuration',
      '==> Done',
    ],
  })
})

// Pull and install new binaries. Synchronous.
router.post('/admin/reconfigure/binaries', requireAuth, (req, res) => {
  const {
    version = 'latest',
    release_base_url = null,
    arch = 'x86_64',
    update_api = true,
    update_webapp = true,
    update_installer = false,
    verify_checksums = true,
  } = req.body ?? {}

  res.json({
    success: true,
    message: `Binaries updated to ${version}`,
    version,
    release_base_url,
    arch,
    update_api,
    update_webapp,
    update_installer,
    verify_checksums,
    script_path: '/opt/grengin/scripts/update-binaries.sh',
    output: [
      `==> Fetching ${version} (${arch})`,
      '==> Verifying checksums',
      '==> Installing binaries',
      '==> Restarting services',
      '==> Done',
    ],
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Demo — RBAC + MCP (spec §3.3 / §3.7 / §3.8 / §3.9). Seeded data in
// the exact response shapes the app expects.
// ─────────────────────────────────────────────────────────────────────────────

// Permission catalog + role list are imported from the canonical seed (spec §3.9).

router.get('/admin/permissions', requireAuth, (_req, res) => {
  res.json({
    permissions: DEMO_PERMISSION_CATALOG.map((p) => ({
      id: `perm-${p.domain}-${p.action}`,
      domain: p.domain,
      action: p.action,
      is_scopeable: p.is_scopeable,
      description_key: `admin.permissions.${p.domain}.${p.action}`,
    })),
  })
})

// Roles (spec §3.9) — from the canonical seed. user_count is derived from the
// real user assignments, so every role has ≥1 user and counts match the table.
const rolesWithCounts = () => liveRoles.map((r) => ({ ...r, user_count: roleUserCount(r.id) }))

router.get('/admin/roles', requireAuth, (_req, res) => {
  res.json({ roles: rolesWithCounts() })
})

// Create a role — persisted live (appears in RBAC immediately).
router.post('/admin/roles', requireAuth, (req, res) => {
  const b = req.body ?? {}
  const role = {
    id: `role-${crypto.randomUUID().slice(0, 8)}`,
    name: b.name ?? 'New Role',
    is_system: false,
    permissions: Array.isArray(b.permissions) ? b.permissions : [],
  }
  liveRoles.push(role)
  res.status(201).json({ ...role, user_count: 0 })
})

// Role prompts (spec §3.3) — from the canonical seed.
router.get('/admin/role-prompts', requireAuth, (req, res) => {
  let list = liveRolePrompts
  if (typeof req.query.role_id === 'string') list = list.filter((p) => p.role_id === req.query.role_id)
  if (req.query.is_system !== undefined) list = list.filter((p) => String(p.is_system) === String(req.query.is_system))
  res.json(list)
})

// Department prompts (spec §3.5: ≥1 prompt per department). Bare-array shape.
router.get('/admin/department-prompts', requireAuth, (req, res) => {
  const deptId = typeof req.query.department_id === 'string' ? req.query.department_id : ''
  res.json(deptId ? departmentPromptsLive(deptId) : liveDeptPrompts)
})
router.post('/admin/department-prompts', requireAuth, (req, res) => {
  const record = {
    id: `dp-${crypto.randomUUID().slice(0, 8)}`,
    department_id: req.body?.department_id ?? '',
    prompt_id: req.body?.prompt_id ?? '',
    priority: req.body?.priority ?? liveDeptPrompts.length + 1,
    created_at: new Date().toISOString(),
  }
  liveDeptPrompts.push(record)
  res.status(201).json(record)
})
router.put('/admin/department-prompts/:id', requireAuth, (req, res) => {
  const found = liveDeptPrompts.find((p) => p.id === req.params.id)
  if (!found) return res.status(404).json({ detail: 'Not found' })
  if (req.body?.priority !== undefined) found.priority = req.body.priority
  res.json(found)
})
router.delete('/admin/department-prompts/:id', requireAuth, (req, res) => {
  const idx = liveDeptPrompts.findIndex((p) => p.id === req.params.id)
  if (idx !== -1) liveDeptPrompts.splice(idx, 1)
  res.status(204).send()
})

// MCP connectors (spec §3.8: none need to be enabled; only Slack shown connected).
const demoMcpServer = (over: Record<string, unknown>) => ({
  id: over.id,
  name: over.name,
  description: over.description ?? null,
  transport_type: over.transport_type ?? 'sse',
  connection_config: {},
  client_id: over.client_id ?? null,
  client_secret_configured: over.client_secret_configured ?? false,
  client_secret_preview: over.client_secret_preview ?? '',
  url: over.url ?? null,
  enabled: over.enabled ?? false,
  status: over.status ?? 'disconnected',
  status_message: over.status_message ?? null,
  tool_count: over.tool_count ?? 0,
  default_access: over.default_access ?? null,
  last_connected_at: over.last_connected_at ?? null,
  last_synced_at: over.last_synced_at ?? null,
  created_at: '2026-04-01T09:00:00Z',
  updated_at: '2026-07-15T09:00:00Z',
  auth_type: over.auth_type ?? 'oauth2',
  auth_mode: over.auth_mode ?? 'organization',
  oauth_provider: over.oauth_provider ?? null,
  scopes: over.scopes ?? null,
  auth_url: null,
  token_url: null,
  org_connection: over.org_connection ?? null,
  connected_users_count: over.connected_users_count ?? null,
})

const DEMO_MCP_SERVERS = [
  demoMcpServer({
    id: 'mcp-slack', name: 'Slack', description: 'Post and read messages, search channels.',
    enabled: true, status: 'connected', oauth_provider: 'slack', tool_count: 12, default_access: 'allow',
    last_connected_at: '2026-08-04T10:00:00Z', last_synced_at: '2026-08-05T06:00:00Z', connected_users_count: 18,
    org_connection: { connected: true, connected_as: 'grengin-workspace', connected_at: '2026-06-10T09:00:00Z', token_expires_at: '2026-09-10T09:00:00Z', scopes: ['channels:read', 'chat:write'] },
  }),
  demoMcpServer({ id: 'mcp-github', name: 'GitHub', description: 'Issues, pull requests, and repo search.', oauth_provider: 'github' }),
  demoMcpServer({ id: 'mcp-atlassian', name: 'Atlassian', description: 'Jira issues and Confluence pages.', oauth_provider: 'atlassian' }),
  demoMcpServer({ id: 'mcp-gdrive', name: 'Google Drive', description: 'Search and read documents.', oauth_provider: 'google' }),
]

router.get('/admin/mcp-servers', requireAuth, (_req, res) => {
  res.json({ servers: DEMO_MCP_SERVERS, total: DEMO_MCP_SERVERS.length })
})
// Create a connector — persisted live.
router.post('/admin/mcp-servers', requireAuth, (req, res) => {
  const server = demoMcpServer({ ...req.body, id: `mcp-${crypto.randomUUID().slice(0, 8)}` })
  DEMO_MCP_SERVERS.push(server)
  res.status(201).json(server)
})
// User-facing MCP connections (chat connector picker). Derived from the servers.
router.get('/mcp/connections', requireAuth, (_req, res) => {
  res.json({
    connections: DEMO_MCP_SERVERS.map((s) => ({
      server_id: s.id,
      server_name: s.name,
      description: s.description ?? '',
      connected: s.enabled === true,
      status: s.enabled === true ? 'connected' : 'disconnected',
      account_email: s.enabled === true ? 'demo@grengin.com' : null,
      connected_at: s.enabled === true ? '2026-06-10T09:00:00Z' : '',
      expires_at: null,
      scopes: (s.org_connection as { scopes?: string[] } | null)?.scopes ?? [],
    })),
  })
})

// Audit logs (spec §3.4) — imported from the canonical seed (references real
// users, ≥50 entries, ≥5 action types, random IPs).

router.get('/admin/audit-logs', requireAuth, (req, res) => {
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1)
  const limit = Math.max(1, parseInt(String(req.query.limit ?? '20'), 10) || 20)
  let list = DEMO_AUDIT_LOGS
  if (typeof req.query.userId === 'string' && req.query.userId) list = list.filter((l) => l.userId === req.query.userId)
  if (typeof req.query.action === 'string' && req.query.action) list = list.filter((l) => l.action === req.query.action)
  const startDate = typeof req.query.startDate === 'string' ? Date.parse(req.query.startDate) : NaN
  const endDate = typeof req.query.endDate === 'string' ? Date.parse(req.query.endDate) : NaN
  if (!Number.isNaN(startDate)) list = list.filter((l) => Date.parse(l.createdAt) >= startDate)
  if (!Number.isNaN(endDate)) list = list.filter((l) => Date.parse(l.createdAt) <= endDate)
  const start = (page - 1) * limit
  res.json({ items: list.slice(start, start + limit), total: list.length, page, limit })
})

// Audit log export — CSV or JSON, generated from the same seeded logs.
router.get('/admin/audit-logs/export', requireAuth, (req, res) => {
  const format = String(req.query.format ?? 'csv')
  if (format === 'json') {
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.json"')
    return res.send(JSON.stringify(DEMO_AUDIT_LOGS, null, 2))
  }
  res.setHeader('Content-Type', 'text/csv')
  res.setHeader('Content-Disposition', 'attachment; filename="audit_logs.csv"')
  const header = 'id,timestamp,user_id,action,resource_type,resource_id,ip_address,status_code,success'
  const rows = DEMO_AUDIT_LOGS.map((l) =>
    [l.id, l.createdAt, l.userId, l.action, l.resourceType, l.resourceId, l.ipAddress, l.details.status_code, l.details.success].join(',')
  )
  res.send([header, ...rows].join('\n'))
})

router.get('/audit/actions', requireAuth, (_req, res) => {
  res.json(AUDIT_ACTIONS)
})

// Role + role-prompt mutations — persisted live.
router.put('/admin/roles/:id', requireAuth, (req, res) => {
  const found = liveRoles.find((r) => r.id === req.params.id)
  if (!found) return res.status(404).json({ detail: 'Role not found' })
  if (found.is_system && found.name === 'Super Admin') return res.status(403).json({ detail: 'The Super Admin role cannot be edited' })
  if (req.body?.name !== undefined) found.name = req.body.name
  if (Array.isArray(req.body?.permissions)) found.permissions = req.body.permissions
  res.json({ ...found, user_count: roleUserCount(found.id) })
})
router.delete('/admin/roles/:id', requireAuth, (req, res) => {
  const idx = liveRoles.findIndex((r) => r.id === req.params.id)
  if (idx === -1) return res.status(404).json({ detail: 'Role not found' })
  if (liveRoles[idx].is_system) return res.status(403).json({ detail: 'System roles cannot be deleted' })
  // Reassign any users on this role back to the base User role (keeps counts valid).
  const removed = liveRoles.splice(idx, 1)[0]
  for (const u of liveUsers) if (u.role_id === removed.id) { u.role_id = 'role-user'; u.roles = ['User'] }
  res.status(204).send()
})

router.post('/admin/role-prompts', requireAuth, (req, res) => {
  const now = new Date().toISOString()
  const record = {
    id: `rp-${crypto.randomUUID().slice(0, 8)}`,
    name: req.body?.name ?? 'Untitled',
    role_id: req.body?.role_id ?? 'role-user',
    prompt_text: req.body?.prompt_text ?? '',
    is_system: req.body?.is_system ?? false,
    variables: Array.isArray(req.body?.variables) ? req.body.variables : [],
    usage_count: 0,
    average_rating: 0.9,
    feedback_count: 0,
    created_by: 'admin@grengin.com',
    created_at: now,
    updated_at: now,
  }
  liveRolePrompts.push(record)
  res.status(201).json(record)
})
router.put('/admin/role-prompts/:id', requireAuth, (req, res) => {
  const found = liveRolePrompts.find((p) => p.id === req.params.id)
  if (!found) return res.status(404).json({ detail: 'Prompt not found' })
  if (req.body?.name !== undefined) found.name = req.body.name
  if (req.body?.prompt_text !== undefined) found.prompt_text = req.body.prompt_text
  if (req.body?.role_id !== undefined) found.role_id = req.body.role_id
  if (Array.isArray(req.body?.variables)) found.variables = req.body.variables
  found.updated_at = new Date().toISOString()
  res.json(found)
})
router.delete('/admin/role-prompts/:id', requireAuth, (req, res) => {
  const idx = liveRolePrompts.findIndex((p) => p.id === req.params.id)
  if (idx !== -1) liveRolePrompts.splice(idx, 1)
  res.status(204).send()
})

// A user's role assignments (spec §3.9). Derived from the LIVE user; add/remove
// actually change the user's role so RBAC counts update.
router.get('/admin/users/:userId/roles', requireAuth, (req, res) => {
  const user = findSeedUser(req.params.userId)
  const role_id = user?.role_id ?? 'role-user'
  const scope_department_id = user?.scope_department_id ?? null
  res.json({
    assignments: [{ id: `ra-${req.params.userId.slice(0, 8)}`, role_id, scope_department_id }],
  })
})
router.post('/admin/users/:userId/roles', requireAuth, (req, res) => {
  const user = liveUsers.find((u) => u.id === req.params.userId)
  const role_id = req.body?.role_id ?? 'role-user'
  const scope_department_id = req.body?.scope_department_id ?? null
  if (user) {
    user.role_id = role_id
    user.roles = [liveRoles.find((r) => r.id === role_id)?.name ?? 'User']
    user.scope_department_id = scope_department_id
    user.is_super_admin = role_id === 'role-super'
  }
  res.status(201).json({ id: `ra-${crypto.randomUUID().slice(0, 8)}`, role_id, scope_department_id })
})
router.delete('/admin/users/:userId/roles/:assignmentId', requireAuth, (req, res) => {
  // Removing a user's only role assignment drops them to the base User role.
  const user = liveUsers.find((u) => u.id === req.params.userId)
  if (user) { user.role_id = 'role-user'; user.roles = ['User']; user.scope_department_id = null; user.is_super_admin = false }
  res.status(204).send()
})

// MCP connection actions (spec §3.8). Demo can't really connect out.
router.post('/admin/mcp-servers/:id/test', requireAuth, (_req, res) => {
  res.json({ success: true, message: 'Connection successful', latency_ms: 142 })
})
// Server access rules (McpServerAccessResponse). default_access is an enum.
router.get('/admin/mcp-servers/:id/access', requireAuth, (req, res) => {
  res.json({ server_id: req.params.id, default_access: 'all_users', rules: [] })
})
router.put('/admin/mcp-servers/:id/access/default', requireAuth, (req, res) => {
  res.json({ server_id: req.params.id, default_access: req.body?.default_access ?? 'all_users', rules: [] })
})
// Per-tool access (McpToolAccess[]). A few sample tools scoped to this server.
router.get('/admin/mcp-servers/:id/tools/access', requireAuth, (req, res) => {
  const tools = ['post_message', 'list_channels', 'search_messages', 'upload_file']
  res.json(
    tools.map((name, i) => ({
      tool_id: `${req.params.id}-tool-${i + 1}`,
      tool_name: name,
      server_id: req.params.id,
      inherit_from_server: true,
      rules: [],
    }))
  )
})
router.post('/admin/mcp-servers/:id/sync-tools', requireAuth, (_req, res) => res.status(204).send())
router.post('/mcp/connections/:id/authorize', requireAuth, (_req, res) => {
  // Demo can't complete real OAuth (spec §3.8). Return a valid URL so the UI
  // opens it gracefully instead of throwing "Failed to get authorization URL" —
  // point it at the install page (on-brand demo CTA).
  res.json({
    success: true,
    authorization_url: 'https://grengin.com/deploy',
    message: 'This is a demo — install Grengin to connect this connector.',
  })
})
router.post('/admin/mcp-servers/:id/connection/disconnect', requireAuth, (_req, res) => {
  res.json({ success: true })
})
// Update / delete a connector (dynamic :id) — persisted live.
router.put('/admin/mcp-servers/:id', requireAuth, (req, res) => {
  const idx = DEMO_MCP_SERVERS.findIndex((s) => s.id === req.params.id)
  if (idx === -1) return res.status(404).json({ detail: 'Connector not found' })
  DEMO_MCP_SERVERS[idx] = { ...DEMO_MCP_SERVERS[idx], ...req.body, id: req.params.id, updated_at: new Date().toISOString() }
  res.json(DEMO_MCP_SERVERS[idx])
})
router.delete('/admin/mcp-servers/:id', requireAuth, (req, res) => {
  const idx = DEMO_MCP_SERVERS.findIndex((s) => s.id === req.params.id)
  if (idx !== -1) DEMO_MCP_SERVERS.splice(idx, 1)
  res.status(204).send()
})

// Prompt effectiveness metrics (spec §3.3) — imported from the canonical seed.
router.get('/admin/prompt-metrics', requireAuth, (req, res) => {
  let list = promptMetricsFor(liveRolePrompts)
  if (typeof req.query.prompt_id === 'string') list = list.filter((m) => m.prompt_id === req.query.prompt_id)
  if (typeof req.query.role_id === 'string') list = list.filter((m) => m.role_id === req.query.role_id)
  res.json(list)
})

// Org branding / settings (shape = Branding). PUT echoes (demo read-only).
const DEMO_BRANDING = {
  id: 'org-grengin',
  name: 'Grengin',
  domain: 'grengin.com',
  allowed_domains: ['grengin.com'],
  settings: {
    sso_providers: ['google', 'azure'],
    default_engine: 'openai',
    default_model: 'gpt-5.2',
    data_retention_days: 90,
    require_mfa: false,
  },
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-07-20T12:00:00Z',
}

router.get('/admin/branding', requireAuth, (_req, res) => res.json(DEMO_BRANDING))
router.put('/admin/branding', requireAuth, (req, res) =>
  res.json({ ...DEMO_BRANDING, ...req.body, updated_at: '2026-08-05T12:00:00Z' })
)

export default router
