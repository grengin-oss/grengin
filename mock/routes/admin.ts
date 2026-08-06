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
import usersListExample from '../examples/admin/users-list.response.json' with { type: 'json' }
import organizationExample from '../examples/admin/organization.response.json' with { type: 'json' }

const router = Router()

// Dashboard
router.get('/admin/dashboard', requireAuth, (req, res) => {
  res.json(dashboardExample)
})

// Users
router.get('/admin/users', requireAuth, (req, res) => {
  // Handle sorting via query params
  const { sort, ascending } = req.query
  let result = { ...usersListExample }
  
  if (sort && ['name', 'email', 'created_at'].includes(sort as string)) {
    const users = [...usersListExample.users]
    const isAscending = ascending === 'true' || ascending === undefined
    users.sort((a, b) => {
      let aVal: string | number
      let bVal: string | number
      
      if (sort === 'name') {
        aVal = (a.name || '').toLowerCase()
        bVal = (b.name || '').toLowerCase()
      } else if (sort === 'email') {
        aVal = (a.email || '').toLowerCase()
        bVal = (b.email || '').toLowerCase()
      } else if (sort === 'created_at') {
        aVal = new Date(a.created_at || 0).getTime()
        bVal = new Date(b.created_at || 0).getTime()
      } else {
        return 0
      }
      
      if (aVal < bVal) return isAscending ? -1 : 1
      if (aVal > bVal) return isAscending ? 1 : -1
      return 0
    })
    
    result = { ...usersListExample, users }
  }
  
  res.json(result)
})

router.post('/admin/users', requireAuth, (req, res) => {
  res.status(201).json({
    id: crypto.randomUUID(),
    ...req.body,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
})

router.get('/admin/users/:userId', requireAuth, (req, res) => {
  const user = usersListExample.users.find(u => u.id === req.params.userId)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  res.json(user)
})

router.put('/admin/users/:userId', requireAuth, (req, res) => {
  const user = usersListExample.users.find(u => u.id === req.params.userId)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  res.json({ ...user, ...req.body, updated_at: new Date().toISOString() })
})

router.delete('/admin/users/:userId', requireAuth, (req, res) => {
  res.status(204).send()
})

router.patch('/admin/users/:userId/status', requireAuth, (req, res) => {
  const user = usersListExample.users.find(u => u.id === req.params.userId)
  if (!user) {
    return res.status(404).json({ detail: 'User not found' })
  }
  const { status } = req.body
  if (!status || !['active', 'inactive', 'pending'].includes(status)) {
    return res.status(400).json({ detail: 'Invalid status value' })
  }
  res.json({ ...user, status, updated_at: new Date().toISOString() })
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
      ...dept,
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

  res.json({ departments: result, total: result.length })
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
  res.json(dept)
})

// --- "My administered departments" aliases -------------------------------
// The frontend reads the department tree/list and scoped users through the
// /me/administered-departments* endpoints. In the mock these mirror the full
// data set (the mock user is a super admin who administers everything).
router.get('/me/administered-departments/tree', requireAuth, (_req, res) => {
  const allDepts = Array.from(departments.values())
  res.json({ tree: buildDepartmentTree(allDepts, null, 10) })
})

router.get('/me/administered-departments/users', requireAuth, (_req, res) => {
  res.json(usersListExample)
})

router.get('/me/administered-departments', requireAuth, (_req, res) => {
  const result = Array.from(departments.values())
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

  // Filter users by department_id
  let members = usersListExample.users.filter(u => u.department_id === req.params.departmentId)

  if (include_sub_departments === 'true') {
    // Get all descendant department IDs
    const getDescendantIds = (parentId: string): string[] => {
      const children = Array.from(departments.values()).filter(d => d.parent_id === parentId)
      return children.map(c => c.id).concat(children.flatMap(c => getDescendantIds(c.id)))
    }
    const descendantIds = getDescendantIds(req.params.departmentId)
    const subMembers = usersListExample.users.filter(u => descendantIds.includes(u.department_id))
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

  // In a real implementation, we'd update the users' department_id
  // For mock, just increment the member count
  const now = new Date().toISOString()
  const updated: Department = {
    ...dept,
    member_count: dept.member_count + user_ids.length,
    total_member_count: dept.total_member_count + user_ids.length,
    updated_at: now,
  }

  departments.set(req.params.departmentId, updated)
  res.json(updated)
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

  // In a real implementation, we'd update the users' department_id to null
  // For mock, just decrement the member count
  const now = new Date().toISOString()
  const updated: Department = {
    ...dept,
    member_count: Math.max(0, dept.member_count - user_ids.length),
    total_member_count: Math.max(0, dept.total_member_count - user_ids.length),
    updated_at: now,
  }

  departments.set(req.params.departmentId, updated)
  res.json(updated)
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

  const modelsByEngine: Record<string, AIEngineModelsResponse['models']> = {
    openai: [
      { model_id: 'gpt-4o', display_name: 'GPT-4o', is_whitelisted: true, model_type: 'text_generator', capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gpt-4.1', display_name: 'GPT-4.1', is_whitelisted: true, model_type: 'text_generator', capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gpt-4.1-mini', display_name: 'GPT-4.1 Mini', is_whitelisted: true, model_type: 'text_generator', capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'o3', display_name: 'O3', is_whitelisted: false, model_type: 'text_generator', capabilities: { vision: false, function_calling: true, streaming: true } },
      { model_id: 'gpt-image-2', display_name: 'GPT Image 2', is_whitelisted: true, model_type: 'image_generator', capabilities: { vision: false, function_calling: false, streaming: false } },
      { model_id: 'gpt-image-1', display_name: 'GPT Image 1', is_whitelisted: false, model_type: 'image_generator', capabilities: { vision: false, function_calling: false, streaming: false } },
    ],
    anthropic: [
      { model_id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4', is_whitelisted: true, model_type: 'text_generator', capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'claude-opus-4-20250514', display_name: 'Claude Opus 4', is_whitelisted: false, model_type: 'text_generator', capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'claude-3-haiku-20240307', display_name: 'Claude 3 Haiku', is_whitelisted: true, model_type: 'text_generator', capabilities: { vision: true, function_calling: true, streaming: true } },
    ],
    google: [
      { model_id: 'gemini-2.0-flash', display_name: 'Gemini 2.0 Flash', is_whitelisted: true, model_type: 'text_generator', capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gemini-1.5-pro', display_name: 'Gemini 1.5 Pro', is_whitelisted: true, model_type: 'text_generator', capabilities: { vision: true, function_calling: true, streaming: true } },
      { model_id: 'gemini-3-pro-image', display_name: 'Gemini 3 Pro Image (Nano Banana)', is_whitelisted: true, model_type: 'image_generator', capabilities: { vision: false, function_calling: false, streaming: false } },
      { model_id: 'gemini-3.1-flash-image', display_name: 'Gemini 3.1 Flash Image', is_whitelisted: false, model_type: 'image_generator', capabilities: { vision: false, function_calling: false, streaming: false } },
    ],
    groq: [
      { model_id: 'llama-3.3-70b-versatile', display_name: 'Llama 3.3 70B', is_whitelisted: false, capabilities: { vision: false, function_calling: true, streaming: true } },
      { model_id: 'mixtral-8x7b-32768', display_name: 'Mixtral 8x7B', is_whitelisted: false, capabilities: { vision: false, function_calling: true, streaming: true } },
    ],
  }

  res.json({
    models: modelsByEngine[req.params.engineKey] || [],
  })
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

export default router
