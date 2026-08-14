/**
 * Interactive Demo — single canonical seed dataset (spec: Confluence
 * "Grengin Interactive Demo — UI & Seed Data Specification", page 93814794).
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH for all demo seed data. Every mock
 * route derives its response from the structures exported here, so the same
 * users, departments, roles, models, prompts and analytics appear identically
 * across the whole app — User Management, Usage Analytics, Overview, Audit Logs,
 * Organization/Departments, RBAC and Prompt Effectiveness.
 *
 * The data is fully DETERMINISTIC (no Math.random / Date.now at build time), so
 * it is stable across server restarts and consistent between endpoints.
 */

import type { components } from '../types/api.js'

type Department = components['schemas']['Department']

// ---------------------------------------------------------------------------
// Time helpers — everything is anchored to a fixed reference "now" so the demo
// is reproducible. Analytics spans the 90 days ending at REF (spec §3.2).
// ---------------------------------------------------------------------------
export const REF_MS = Date.parse('2026-08-06T00:00:00Z')
const iso = (ms: number) => new Date(ms).toISOString()
const daysAgo = (d: number, hour = 9, min = 0) => iso(REF_MS - d * 86_400_000 + hour * 3_600_000 + min * 60_000)

// Deterministic pseudo-random in [0,1) from an integer seed (mulberry32-ish).
function rand(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0
  t = Math.imul(t ^ (t >>> 15), t | 1)
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

// ---------------------------------------------------------------------------
// Models (spec §3.7) — all providers + models listed; only cheap/cost-effective
// models enabled. Image-generation models flagged. This one list feeds AI
// Engines, department allowed-models and the top-models analytics.
// ---------------------------------------------------------------------------
export interface DemoModel {
  model_id: string
  display_name: string
  provider: string // engine_key
  provider_name: string
  model_type: 'text_generator' | 'image_generator'
  cheap: boolean // cheap ⇒ enabled/whitelisted (spec §3.7)
}

export const DEMO_MODELS: DemoModel[] = [
  // OpenAI
  { model_id: 'gpt-4o-mini', display_name: 'GPT-4o Mini', provider: 'openai', provider_name: 'OpenAI', model_type: 'text_generator', cheap: true },
  { model_id: 'gpt-4.1-mini', display_name: 'GPT-4.1 Mini', provider: 'openai', provider_name: 'OpenAI', model_type: 'text_generator', cheap: true },
  { model_id: 'gpt-4o', display_name: 'GPT-4o', provider: 'openai', provider_name: 'OpenAI', model_type: 'text_generator', cheap: false },
  { model_id: 'gpt-5.2', display_name: 'GPT-5.2', provider: 'openai', provider_name: 'OpenAI', model_type: 'text_generator', cheap: false },
  { model_id: 'o3', display_name: 'o3', provider: 'openai', provider_name: 'OpenAI', model_type: 'text_generator', cheap: false },
  { model_id: 'gpt-image-1-mini', display_name: 'GPT Image 1 Mini', provider: 'openai', provider_name: 'OpenAI', model_type: 'image_generator', cheap: true },
  { model_id: 'gpt-image-1', display_name: 'GPT Image 1', provider: 'openai', provider_name: 'OpenAI', model_type: 'image_generator', cheap: false },
  // Anthropic
  { model_id: 'claude-haiku-4-5', display_name: 'Claude Haiku 4.5', provider: 'anthropic', provider_name: 'Anthropic', model_type: 'text_generator', cheap: true },
  { model_id: 'claude-3-haiku', display_name: 'Claude 3 Haiku', provider: 'anthropic', provider_name: 'Anthropic', model_type: 'text_generator', cheap: true },
  { model_id: 'claude-sonnet-4-5', display_name: 'Claude Sonnet 4.5', provider: 'anthropic', provider_name: 'Anthropic', model_type: 'text_generator', cheap: false },
  { model_id: 'claude-opus-4-1', display_name: 'Claude Opus 4.1', provider: 'anthropic', provider_name: 'Anthropic', model_type: 'text_generator', cheap: false },
  // Google
  { model_id: 'gemini-2.5-flash', display_name: 'Gemini 2.5 Flash', provider: 'google', provider_name: 'Google', model_type: 'text_generator', cheap: true },
  { model_id: 'gemini-1.5-flash', display_name: 'Gemini 1.5 Flash', provider: 'google', provider_name: 'Google', model_type: 'text_generator', cheap: true },
  { model_id: 'gemini-2.5-pro', display_name: 'Gemini 2.5 Pro', provider: 'google', provider_name: 'Google', model_type: 'text_generator', cheap: false },
  { model_id: 'gemini-2.5-flash-image', display_name: 'Gemini 2.5 Flash Image', provider: 'google', provider_name: 'Google', model_type: 'image_generator', cheap: true },
  { model_id: 'gemini-3-pro-image', display_name: 'Gemini 3 Pro Image (Nano Banana)', provider: 'google', provider_name: 'Google', model_type: 'image_generator', cheap: false },
  // Groq
  { model_id: 'llama-3.3-70b-versatile', display_name: 'Llama 3.3 70B', provider: 'groq', provider_name: 'Groq', model_type: 'text_generator', cheap: true },
  { model_id: 'mixtral-8x7b-32768', display_name: 'Mixtral 8x7B', provider: 'groq', provider_name: 'Groq', model_type: 'text_generator', cheap: true },
]

export const IMAGE_MODELS = DEMO_MODELS.filter((m) => m.model_type === 'image_generator')
export const TEXT_MODELS = DEMO_MODELS.filter((m) => m.model_type === 'text_generator')

export interface DemoProvider {
  engine_key: string
  display_name: string
  models: DemoModel[]
}
export const DEMO_PROVIDERS: DemoProvider[] = ['openai', 'anthropic', 'google', 'groq'].map((key) => ({
  engine_key: key,
  display_name: DEMO_MODELS.find((m) => m.provider === key)!.provider_name,
  models: DEMO_MODELS.filter((m) => m.provider === key),
}))

// ---------------------------------------------------------------------------
// Roles + permissions (spec §3.9) — real system roles/permissions as-is, plus
// the one custom "AI Manager" role scoped to MCP + AI.
// ---------------------------------------------------------------------------
export const DEMO_PERMISSION_CATALOG: Array<{ domain: string; action: string; is_scopeable: boolean }> = [
  { domain: 'analytics', action: 'view', is_scopeable: true },
  { domain: 'departments', action: 'view', is_scopeable: true },
  { domain: 'departments', action: 'manage', is_scopeable: true },
  { domain: 'ai_platform', action: 'view', is_scopeable: false },
  { domain: 'ai_platform', action: 'manage', is_scopeable: false },
  { domain: 'sso_providers', action: 'view', is_scopeable: false },
  { domain: 'sso_providers', action: 'manage', is_scopeable: false },
  { domain: 'users', action: 'view', is_scopeable: true },
  { domain: 'users', action: 'manage', is_scopeable: true },
  { domain: 'roles', action: 'view', is_scopeable: false },
  { domain: 'roles', action: 'manage', is_scopeable: false },
  { domain: 'roles', action: 'assign', is_scopeable: true },
  { domain: 'budget', action: 'view', is_scopeable: true },
  { domain: 'budget', action: 'allocate', is_scopeable: true },
  { domain: 'mcp_servers', action: 'view', is_scopeable: true },
  { domain: 'mcp_servers', action: 'manage', is_scopeable: true },
  { domain: 'audit_logs', action: 'view', is_scopeable: false },
  { domain: 'system', action: 'maintain', is_scopeable: false },
]
export const ALL_PERM_KEYS = DEMO_PERMISSION_CATALOG.map((p) => `${p.domain}:${p.action}`)

export interface DemoRole {
  id: string
  name: string
  is_system: boolean
  permissions: string[]
}
export const DEMO_ROLES: DemoRole[] = [
  { id: 'role-super', name: 'Super Admin', is_system: true, permissions: ALL_PERM_KEYS },
  {
    id: 'role-dept',
    name: 'Department Admin',
    is_system: true,
    permissions: ['departments:view', 'departments:manage', 'users:view', 'users:manage', 'budget:view', 'budget:allocate', 'mcp_servers:view', 'mcp_servers:manage', 'analytics:view', 'roles:assign'],
  },
  { id: 'role-fin', name: 'Finance Admin', is_system: true, permissions: ['analytics:view', 'departments:view', 'budget:view', 'budget:allocate'] },
  { id: 'role-ai', name: 'AI Manager', is_system: false, permissions: ['ai_platform:view', 'ai_platform:manage', 'mcp_servers:view', 'mcp_servers:manage'] },
  { id: 'role-user', name: 'User', is_system: true, permissions: [] },
]

// ---------------------------------------------------------------------------
// Departments (spec §3.5) — a HIERARCHICAL wealth-management org: 3 top-level
// divisions, each with 3 sub-departments (12 nodes across depth 0–1). Budgets
// roll UP the tree — a division's allocation equals its own direct budget plus
// everything distributed to its children — and so do member counts. Every
// department has a good description, a budget with 20–60% used, and 4–8 allowed
// models incl. 1–3 image models.
// ---------------------------------------------------------------------------
export interface AllowedModelRef {
  model: string
  provider: string
}
export interface DemoDepartment extends Department {
  allowed_models?: AllowedModelRef[] | null
  action_on_exceed?: 'warn' | 'block'
}

const deptId = (n: number) => `d00${n}0000-0000-4000-8000-0000000000${String(n).padStart(2, '0')}`

interface DeptSeed {
  n: number // 1-based index → stable id + user-assignment order
  key: string // slug used by prompt assignment + budget/member rollup
  name: string
  description: string
  parent: number | null // parent seed `n`, or null for a top-level division
  budget: number // this dept's OWN (direct) budget allocation
  usedPct: number // 0.20–0.60 of the direct budget
  memberCount: number // DIRECT members assigned to this dept
  textCount: number // number of text models allowed
  imageCount: number // number of image models allowed (1–3)
}

// Order matters: a parent always precedes its children — the path builder, the
// budget/member rollup and the user-assignment vector all walk this array
// top-to-bottom. Divisions first, then their sub-departments. Direct member
// counts sum to 50 (each division's single direct member is its Managing
// Director, who is also that division's Department Admin).
const DEPT_SEEDS: DeptSeed[] = [
  // ---- Divisions (depth 0) --------------------------------------------------
  { n: 1, key: 'private-wealth', name: 'Private Wealth', parent: null, description: 'Serves high- and ultra-high-net-worth clients across advisory, planning and onboarding.', budget: 1500, usedPct: 0.3, memberCount: 1, textCount: 5, imageCount: 2 },
  { n: 2, key: 'investment-management', name: 'Investment Management', parent: null, description: 'Manages client capital end to end — research, portfolio construction, rebalancing and execution.', budget: 1500, usedPct: 0.3, memberCount: 1, textCount: 5, imageCount: 2 },
  { n: 3, key: 'corporate-services', name: 'Corporate Services', parent: null, description: 'Runs the firm itself: compliance and risk oversight, technology platforms and corporate finance.', budget: 1500, usedPct: 0.3, memberCount: 1, textCount: 5, imageCount: 1 },

  // ---- Private Wealth → sub-departments (depth 1) ---------------------------
  { n: 4, key: 'private-client-advisory', name: 'Private Client Advisory', parent: 1, description: 'Relationship managers and advisors guiding HNW clients on goals, allocation and bespoke solutions.', budget: 9000, usedPct: 0.46, memberCount: 6, textCount: 5, imageCount: 2 },
  { n: 5, key: 'financial-planning', name: 'Financial Planning', parent: 1, description: 'Builds holistic retirement, tax and estate plans tailored to each client’s objectives.', budget: 6000, usedPct: 0.38, memberCount: 5, textCount: 4, imageCount: 1 },
  { n: 6, key: 'client-onboarding', name: 'Client Onboarding & KYC', parent: 1, description: 'Runs account opening, KYC/AML checks and suitability reviews for new client relationships.', budget: 4000, usedPct: 0.29, memberCount: 5, textCount: 4, imageCount: 1 },

  // ---- Investment Management → sub-departments (depth 1) --------------------
  { n: 7, key: 'portfolio-management', name: 'Portfolio Management', parent: 2, description: 'Constructs and rebalances discretionary portfolios across asset classes to client mandates.', budget: 9500, usedPct: 0.52, memberCount: 6, textCount: 5, imageCount: 1 },
  { n: 8, key: 'investment-research', name: 'Investment Research', parent: 2, description: 'Produces equity, fixed-income and macro research that drives the firm’s investment views.', budget: 8000, usedPct: 0.48, memberCount: 5, textCount: 5, imageCount: 2 },
  { n: 9, key: 'trading-execution', name: 'Trading & Execution', parent: 2, description: 'Executes trades efficiently, manages liquidity and minimises market impact and cost.', budget: 5000, usedPct: 0.35, memberCount: 5, textCount: 4, imageCount: 1 },

  // ---- Corporate Services → sub-departments (depth 1) ----------------------
  { n: 10, key: 'compliance-risk', name: 'Compliance & Risk', parent: 3, description: 'Monitors regulatory obligations, investment-risk limits and surveillance across the firm.', budget: 4500, usedPct: 0.31, memberCount: 5, textCount: 4, imageCount: 1 },
  { n: 11, key: 'technology-data', name: 'Technology & Data', parent: 3, description: 'Builds and runs the advisory, portfolio and client-reporting platforms and data pipeline.', budget: 7000, usedPct: 0.44, memberCount: 5, textCount: 5, imageCount: 1 },
  { n: 12, key: 'finance-operations', name: 'Finance & Operations', parent: 3, description: 'Owns the firm’s own budgeting, billing, fund accounting and back-office operations.', budget: 3500, usedPct: 0.27, memberCount: 5, textCount: 4, imageCount: 1 },
]

const seedByN = new Map(DEPT_SEEDS.map((s) => [s.n, s]))
const childSeeds = (n: number) => DEPT_SEEDS.filter((s) => s.parent === n)
const slugify = (name: string) => name.toLowerCase().replace(/\s+/g, '-')

// Materialised path, e.g. "/private-wealth/private-client-advisory". Mirrors the
// admin route's generatePath so seeded + runtime-created departments look alike.
function deptPath(seed: DeptSeed): string {
  if (!seed.parent) return '/' + slugify(seed.name)
  return '/' + slugify(seedByN.get(seed.parent)!.name) + '/' + slugify(seed.name)
}

// Every descendant seed `n` under a given department (depth is 2 here, but this
// recurses so deeper trees would still roll up correctly).
function descendantNs(n: number): number[] {
  return childSeeds(n).flatMap((c) => [c.n, ...descendantNs(c.n)])
}

// Pick a deterministic set of allowed models for a department: `textCount` text
// models + `imageCount` image models.
function pickAllowedModels(seed: DeptSeed): AllowedModelRef[] {
  const texts = TEXT_MODELS.slice(0, seed.textCount)
  const images = IMAGE_MODELS.slice(0, Math.max(1, Math.min(3, seed.imageCount)))
  return [...texts, ...images].map((m) => ({ model: m.model_id, provider: m.provider }))
}

// ---------------------------------------------------------------------------
// Users (spec §3.6) — 50 users, 50% Indian / 50% American names, random-looking
// emails, different roles, some department-scoped (esp. Department & Finance
// Admin per §3.9). Every role has ≥1 user.
// ---------------------------------------------------------------------------
const INDIAN_FIRST = ['Aarav', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Neha', 'Arjun', 'Kavya', 'Rahul', 'Meera', 'Karthik', 'Sneha', 'Aditya', 'Isha', 'Sanjay', 'Divya', 'Rohit', 'Pooja', 'Nikhil', 'Anjali', 'Varun', 'Riya', 'Manish', 'Shreya', 'Deepak']
const INDIAN_LAST = ['Sharma', 'Patel', 'Mehta', 'Iyer', 'Nair', 'Gupta', 'Reddy', 'Rao', 'Verma', 'Joshi', 'Menon', 'Desai', 'Kapoor', 'Bhat', 'Chopra', 'Malhotra', 'Pillai', 'Shah', 'Kulkarni', 'Agarwal', 'Banerjee', 'Chauhan', 'Sethi', 'Nanda', 'Bose']
const AMERICAN_FIRST = ['James', 'Emily', 'Michael', 'Sarah', 'David', 'Jessica', 'Daniel', 'Ashley', 'Christopher', 'Amanda', 'Matthew', 'Olivia', 'Andrew', 'Emma', 'Joshua', 'Sophia', 'Ryan', 'Isabella', 'Brandon', 'Mia', 'Justin', 'Grace', 'Tyler', 'Chloe', 'Ethan']
const AMERICAN_LAST = ['Miller', 'Davis', 'Brown', 'Wilson', 'Jones', 'Garcia', 'Martinez', 'Taylor', 'Lee', 'White', 'Harris', 'Clark', 'Lewis', 'Walker', 'Hall', 'Allen', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter']

export interface DemoUser {
  id: string
  sub: string
  email: string
  name: string
  picture: string
  role: 'admin' | 'user'
  roles: string[]
  role_id: string
  scope_department_id: string | null
  status: 'active' | 'deactivated'
  department_id: string | null
  department_name: string | null
  department: string
  is_super_admin: boolean
  has_password: boolean
  mfa_enabled: boolean
  last_login_at: string
  created_at: string
  updated_at: string
}

// Direct-member distribution across the 12 departments, in DEPT_SEEDS order
// (divisions get 1 each, leaves ≥5). Sums to 50.
const DEPT_MEMBER_COUNTS = DEPT_SEEDS.map((s) => s.memberCount)
// Extra users who belong to no department (spec §3.6 "Unassigned" bucket).
const UNASSIGNED_COUNT = 3

// Role assignment plan (spec §3.9). Index into the 50-user array.
// - 2 Super Admins (org-wide)
// - 12 Department Admins (one per department, incl. each division's Managing
//   Director; each scoped to their own department)
// - 2 Finance Admins (scoped to Finance & Operations)
// - 2 AI Managers (custom role, org-wide)
// - remaining 32 → User
function buildUsers(): DemoUser[] {
  // Build the department assignment vector first (which dept each of 50 users is
  // in), keyed by DEPT_SEEDS index and mirroring the array order.
  const deptOfUser: number[] = []
  DEPT_MEMBER_COUNTS.forEach((count, di) => {
    for (let k = 0; k < count; k++) deptOfUser.push(di)
  })

  // First user in each department is that department's Department Admin (this is
  // the Managing Director for a division, the team lead for a leaf).
  const deptAdminIndex = new Map<number, number>()
  {
    const firstSeen = new Set<number>()
    deptOfUser.forEach((di, i) => {
      if (!firstSeen.has(di)) {
        firstSeen.add(di)
        deptAdminIndex.set(di, i)
      }
    })
  }
  const deptAdminIdxSet = new Set(deptAdminIndex.values())

  // Org-wide + scoped special roles are placed on indices that are NOT the first
  // member of any department, so they never steal a Department Admin slot. With
  // the counts above the per-department first-member indices are
  // {0,1,2,3,9,14,19,25,30,35,40,45}; the picks below avoid all of them.
  // Super Admins: 4, 24. AI Managers: 41, 42 (Technology & Data members).
  // Finance Admins: 46, 47 (Finance & Operations members, scoped to that dept).
  const superIdx = new Set([4, 24])
  const aiIdx = new Set([41, 42])
  const finIdx = new Set([46, 47])
  const financeDeptN = 12 // Finance & Operations

  const users: DemoUser[] = []
  for (let i = 0; i < 50; i++) {
    const indian = i % 2 === 0
    const first = indian ? INDIAN_FIRST[(i >> 1) % INDIAN_FIRST.length] : AMERICAN_FIRST[(i >> 1) % AMERICAN_FIRST.length]
    const last = indian ? INDIAN_LAST[((i >> 1) + 3) % INDIAN_LAST.length] : AMERICAN_LAST[((i >> 1) + 5) % AMERICAN_LAST.length]
    const name = `${first} ${last}`
    const di = deptOfUser[i]
    const dept = DEPT_SEEDS[di]

    let role_id = 'role-user'
    let roleName = 'User'
    let scope: string | null = null
    let isSuper = false
    if (superIdx.has(i)) {
      role_id = 'role-super'
      roleName = 'Super Admin'
      isSuper = true
    } else if (deptAdminIdxSet.has(i)) {
      role_id = 'role-dept'
      roleName = 'Department Admin'
      scope = deptId(dept.n) // department-scoped (spec §3.9)
    } else if (finIdx.has(i)) {
      role_id = 'role-fin'
      roleName = 'Finance Admin'
      scope = deptId(financeDeptN) // scoped to Finance & Operations (spec §3.9)
    } else if (aiIdx.has(i)) {
      role_id = 'role-ai'
      roleName = 'AI Manager'
    }

    // Emails look random: a few use nicknames / numbers rather than first.last.
    const r = rand(i * 101 + 7)
    const handle =
      r < 0.34
        ? `${first}.${last}`.toLowerCase()
        : r < 0.67
          ? `${first[0]}${last}`.toLowerCase()
          : `${first}${last}${10 + (i % 89)}`.toLowerCase()
    const email = `${handle}@grengin.com`
    // ~10% deactivated, but never the admins/super-admins.
    const privileged = isSuper || role_id !== 'role-user'
    const status: DemoUser['status'] = !privileged && rand(i * 31 + 3) < 0.1 ? 'deactivated' : 'active'

    users.push({
      id: `usr-${String(i + 1).padStart(4, '0')}`,
      sub: `demo|${String(i + 1).padStart(6, '0')}`,
      email,
      name,
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
      role: isSuper ? 'admin' : 'user',
      roles: [roleName],
      role_id,
      scope_department_id: scope,
      status,
      department_id: deptId(dept.n),
      department_name: dept.name,
      department: dept.name,
      is_super_admin: isSuper,
      has_password: true,
      mfa_enabled: isSuper || i % 5 === 0,
      last_login_at: daysAgo(i % 14, 8 + (i % 9), (i * 7) % 60),
      created_at: daysAgo(120 - i, 10, (i * 3) % 60),
      updated_at: daysAgo(i % 14, 8 + (i % 9), (i * 7) % 60),
    })
  }

  // Unassigned users (spec §3.6: "users who aren't part of any team yet"). These
  // have department_id = null so they surface in the Organization "Unassigned"
  // bucket. They are still real, active User-role members with usage, and they
  // are NOT counted toward any department — so every department keeps its ≥5
  // members and the department member counts stay consistent.
  // Distinct, novel names (NOT drawn from the pools above, which are fully used
  // by the 50 assigned users) so an unassigned user never duplicates an existing
  // member's name. Kept 50/50-ish Indian/American (spec §3.6).
  const UNASSIGNED_NAMES = ['Tara Menon', 'Marcus Bell', 'Reyansh Saxena']
  for (let k = 0; k < UNASSIGNED_COUNT; k++) {
    const i = 50 + k
    const name = UNASSIGNED_NAMES[k]
    const [first, last] = name.split(' ')
    const r = rand(i * 101 + 7)
    const handle = r < 0.5 ? `${first}.${last}`.toLowerCase() : `${first[0]}${last}${10 + (i % 89)}`.toLowerCase()
    users.push({
      id: `usr-${String(i + 1).padStart(4, '0')}`,
      sub: `demo|${String(i + 1).padStart(6, '0')}`,
      email: `${handle}@grengin.com`,
      name,
      picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
      role: 'user',
      roles: ['User'],
      role_id: 'role-user',
      scope_department_id: null,
      status: 'active',
      department_id: null,
      department_name: null,
      department: 'Unassigned',
      is_super_admin: false,
      has_password: true,
      mfa_enabled: false,
      last_login_at: daysAgo(i % 7, 9, (i * 11) % 60),
      created_at: daysAgo(9 - k, 11, (i * 5) % 60),
      updated_at: daysAgo(i % 7, 9, (i * 11) % 60),
    })
  }
  return users
}

export const DEMO_USERS: DemoUser[] = buildUsers()

export function usersInDepartment(departmentId: string): DemoUser[] {
  return DEMO_USERS.filter((u) => u.department_id === departmentId)
}

// Build the 12 department records now that users exist. Member counts and
// budgets roll UP the tree: a division reports its direct members plus every
// descendant's, and an allocation equal to its own direct budget plus the sum
// distributed to its children.
export const DEMO_DEPARTMENTS: DemoDepartment[] = DEPT_SEEDS.map((seed) => {
  const id = deptId(seed.n)
  const directMembers = usersInDepartment(id)
  const admins = directMembers.filter((u) => u.role_id === 'role-dept').map((u) => u.id)

  const kids = childSeeds(seed.n)
  const totalMembers = [seed.n, ...descendantNs(seed.n)].reduce((sum, n) => sum + usersInDepartment(deptId(n)).length, 0)

  const distributed = kids.reduce((sum, k) => sum + k.budget, 0)
  const allocated = seed.budget + distributed // leaves: distributed = 0 ⇒ just their own
  const directUsed = Math.round(seed.budget * seed.usedPct)

  return {
    id,
    name: seed.name,
    description: seed.description,
    parent_id: seed.parent ? deptId(seed.parent) : null,
    path: deptPath(seed),
    depth: seed.parent ? 1 : 0,
    admin_ids: admins,
    member_count: directMembers.length,
    total_member_count: totalMembers,
    child_count: kids.length,
    budget_allocated: allocated,
    budget_distributed: distributed,
    budget_available: allocated - distributed - directUsed,
    budget_used: directUsed,
    budget_period: 'monthly',
    allowed_models: pickAllowedModels(seed),
    action_on_exceed: seed.name === 'Compliance & Risk' ? 'block' : 'warn',
    created_at: '2026-01-05T00:00:00Z',
    updated_at: daysAgo(2, 12),
  }
})

// Convenience name lookup used by analytics (keyed by department name).
export const DEPARTMENT_NAMES = DEMO_DEPARTMENTS.map((d) => d.name)

// ---------------------------------------------------------------------------
// Prompts (spec §3.3 personas + §3.5 ≥1 prompt per department).
// ---------------------------------------------------------------------------
export interface DemoRolePrompt {
  id: string
  name: string
  role_id: string
  prompt_text: string
  is_system: boolean
  variables: string[]
  usage_count: number
  average_rating: number // 0.80–0.95 (spec §3.3)
  feedback_count: number
  created_by: string
  created_at: string
  updated_at: string
}

const PERSONA_SEEDS: Array<{ name: string; text: string; vars: string[]; usage: number; rating: number; feedback: number }> = [
  { name: 'Wealth Advisor', text: 'You are a senior wealth advisor. Draft a clear, compliant client update on {topic} for a {client_segment} client.', vars: ['topic', 'client_segment'], usage: 1840, rating: 0.92, feedback: 420 },
  { name: 'Research Analyst', text: 'You are an investment research analyst. Summarise the outlook for {asset} and give a rated recommendation with the key risks.', vars: ['asset'], usage: 1520, rating: 0.89, feedback: 365 },
  { name: 'Financial Planner', text: 'You are a certified financial planner. Outline a retirement, tax and estate plan for a client with {profile}.', vars: ['profile'], usage: 1210, rating: 0.9, feedback: 298 },
  { name: 'Portfolio Manager', text: 'You are a portfolio manager. Explain the rationale for rebalancing {portfolio} given {market_condition}.', vars: ['portfolio', 'market_condition'], usage: 1660, rating: 0.87, feedback: 402 },
  { name: 'Compliance Officer', text: 'You are a compliance officer. Review {communication} for regulatory and suitability issues and flag any concerns.', vars: ['communication'], usage: 980, rating: 0.94, feedback: 233 },
  { name: 'Platform Engineer', text: 'You are a senior platform engineer. Review {code} in our portfolio and client-reporting systems for bugs and improvements.', vars: ['code'], usage: 1975, rating: 0.85, feedback: 512 },
]

export const DEMO_ROLE_PROMPTS: DemoRolePrompt[] = PERSONA_SEEDS.map((p, i) => ({
  id: `rp-${i + 1}`,
  name: p.name,
  role_id: 'role-user',
  prompt_text: p.text,
  is_system: true,
  variables: p.vars,
  usage_count: p.usage,
  average_rating: p.rating,
  feedback_count: p.feedback,
  created_by: 'admin@grengin.com',
  created_at: daysAgo(95 - i * 2, 9),
  updated_at: daysAgo(15 + i, 12),
}))

// Assign ≥1 prompt to every department (spec §3.5). Maps each dept (keyed by
// name) to the persona(s) that fit its work. rp-1 Wealth Advisor, rp-2 Research
// Analyst, rp-3 Financial Planner, rp-4 Portfolio Manager, rp-5 Compliance
// Officer, rp-6 Platform Engineer.
const DEPT_PROMPT_ASSIGNMENT: Record<string, string[]> = {
  'Private Wealth': ['rp-1'],
  'Investment Management': ['rp-4'],
  'Corporate Services': ['rp-5'],
  'Private Client Advisory': ['rp-1'],
  'Financial Planning': ['rp-3'],
  'Client Onboarding & KYC': ['rp-5'],
  'Portfolio Management': ['rp-4'],
  'Investment Research': ['rp-2'],
  'Trading & Execution': ['rp-4'],
  'Compliance & Risk': ['rp-5'],
  'Technology & Data': ['rp-6'],
  'Finance & Operations': ['rp-3'],
}

export interface DemoDepartmentPrompt {
  id: string
  department_id: string
  prompt_id: string
  priority: number
  created_at: string
}
export const DEMO_DEPARTMENT_PROMPTS: DemoDepartmentPrompt[] = DEMO_DEPARTMENTS.flatMap((d) => {
  const promptIds = DEPT_PROMPT_ASSIGNMENT[d.name] ?? ['rp-3']
  return promptIds.map((pid, idx) => ({
    id: `dp-${d.id.slice(0, 8)}-${idx + 1}`,
    department_id: d.id,
    prompt_id: pid,
    priority: idx + 1,
    created_at: daysAgo(40 - idx, 10),
  }))
})

export function departmentPrompts(departmentId: string): DemoDepartmentPrompt[] {
  return DEMO_DEPARTMENT_PROMPTS.filter((p) => p.department_id === departmentId).sort((a, b) => a.priority - b.priority)
}

// Prompt-effectiveness metrics (spec §3.3) — computed from the LIVE role prompts
// so newly created / edited prompts appear immediately.
export function promptMetricsFor(rolePrompts: DemoRolePrompt[]) {
  return rolePrompts.map((p) => ({
    prompt_id: p.id,
    role_id: p.role_id,
    name: p.name,
    usage_count: p.usage_count,
    feedback_count: p.feedback_count,
    average_rating: p.average_rating,
  }))
}

// ---------------------------------------------------------------------------
// Analytics (spec §3.1 / §3.2) — all derived from the canonical users, depts and
// models so totals reconcile across Overview, Usage Analytics and the tables.
// ---------------------------------------------------------------------------

// Stable per-user hash so a user's analytics stay consistent regardless of their
// position and so newly created users get deterministic (but plausible) numbers.
function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

// Per-user request volume (deterministic from the user id). Active users get
// real usage; deactivated users get none.
function userRequestVolume(u: DemoUser): number {
  if (u.status === 'deactivated') return 0
  return 900 + Math.floor(rand(hashStr(u.id)) * 3600) // 900–4500
}

export interface UserAnalytics {
  user_id: string
  user_name: string
  user_email: string
  department: string
  total_requests: number
  success_count: number
  error_count: number
  total_tokens: number
  total_cost: number
  average_latency: number
  last_activity: string
}

// Per-user analytics computed from the LIVE users list (spec §3.2). Recomputed on
// each request so create/edit/delete of users is reflected immediately.
export function userAnalyticsFor(users: DemoUser[]): UserAnalytics[] {
  return users.map((u) => {
    const seed = hashStr(u.id)
    const total_requests = userRequestVolume(u)
    const error_count = Math.round(total_requests * (0.02 + rand(seed + 7) * 0.03))
    return {
      user_id: u.id,
      user_name: u.name,
      user_email: u.email,
      department: u.department,
      total_requests,
      success_count: total_requests - error_count,
      error_count,
      total_tokens: total_requests * (620 + (seed % 5) * 40),
      total_cost: Math.round(total_requests * 0.031 * 100) / 100,
      average_latency: 720 + (seed % 6) * 95,
      last_activity: u.last_login_at,
    }
  })
}

export interface DepartmentAnalytics {
  department: string
  total_users: number
  total_requests: number
  success_count: number
  error_count: number
  total_tokens: number
  total_cost: number
  average_latency: number
}

// Department analytics aggregated from the LIVE users, grouped by the canonical
// department names. Users with no department are excluded (they aren't a team).
export function departmentAnalyticsFor(users: DemoUser[]): DepartmentAnalytics[] {
  const perUser = userAnalyticsFor(users)
  const byId = new Map(perUser.map((r) => [r.user_id, r]))
  return DEPARTMENT_NAMES.map((name, di) => {
    const rows = users.filter((u) => u.department_name === name).map((u) => byId.get(u.id)!).filter(Boolean)
    const total_requests = rows.reduce((s, r) => s + r.total_requests, 0)
    const error_count = rows.reduce((s, r) => s + r.error_count, 0)
    const total_tokens = rows.reduce((s, r) => s + r.total_tokens, 0)
    const total_cost = Math.round(rows.reduce((s, r) => s + r.total_cost, 0) * 100) / 100
    return {
      department: name,
      total_users: rows.length,
      total_requests,
      success_count: total_requests - error_count,
      error_count,
      total_tokens,
      total_cost,
      average_latency: 780 + (di % 6) * 70,
    }
  })
}

// Top models (spec §3.1 ≥3 models with usage) — spread the LIVE total requests
// over the enabled text + image models, weighted so the first few dominate.
export function topModelsFor(grandRequests: number) {
  const enabled = DEMO_MODELS.filter((m) => m.cheap)
  const weights = enabled.map((_, i) => 1 / (i + 1.4))
  const wSum = weights.reduce((s, w) => s + w, 0)
  return enabled
    .map((m, i) => {
      const total_requests = Math.round(grandRequests * (weights[i] / wSum))
      return {
        model_name: m.model_id,
        model_provider: m.provider_name,
        total_requests,
        total_tokens: total_requests * 690,
        total_cost: Math.round(total_requests * 0.031 * 100) / 100,
      }
    })
    .sort((a, b) => b.total_requests - a.total_requests)
}

// Overview quick stats (spec §3.1) computed from the LIVE users.
export function overviewFor(users: DemoUser[]) {
  const perUser = userAnalyticsFor(users)
  const active = users.filter((u) => u.status === 'active').length
  const total_requests = perUser.reduce((s, r) => s + r.total_requests, 0)
  const total_tokens = perUser.reduce((s, r) => s + r.total_tokens, 0)
  const total_cost = Math.round(perUser.reduce((s, r) => s + r.total_cost, 0) * 100) / 100
  return {
    total_users: users.length,
    active_users: active,
    average_requests_per_user: active ? Math.round((total_requests / active) * 10) / 10 : 0,
    total_requests,
    total_tokens,
    total_cost,
    cost_growth_rate: 0.128,
    request_growth_rate: 0.094,
    token_growth_rate: 0.111,
    top_models: topModelsFor(total_requests),
  }
}

// 90 days of daily timeseries (spec §3.2). Deterministic wavy shape.
export function buildTimeseries(startMs: number, endMs: number, stepMs: number) {
  const data = []
  let i = 0
  for (let t = startMs; t <= endMs && i < 400; t += stepMs, i++) {
    const wave = Math.sin(i / 4) * 0.25 + 1
    const total_requests = Math.round((3200 + (i % 7) * 180) * wave)
    const error_count = Math.round(total_requests * 0.03)
    data.push({
      timestamp: iso(t),
      total_requests,
      success_count: total_requests - error_count,
      error_count,
      total_tokens: total_requests * 690,
      total_cost: Math.round(total_requests * 0.031 * 100) / 100,
      average_latency: 780 + (i % 5) * 90,
    })
  }
  return data
}

// ---------------------------------------------------------------------------
// Audit logs (spec §3.4) — ≥50 entries, ≥5 action types, random IPs, referencing
// the real seeded users.
// ---------------------------------------------------------------------------
export const AUDIT_ACTIONS = ['user.login', 'conversation.create', 'message.send', 'user.create', 'role.assign', 'department.update', 'budget.allocate', 'mcp.authorize', 'model.whitelist', 'user.deactivate', 'prompt.assign']

export const DEMO_AUDIT_LOGS = Array.from({ length: 64 }, (_, i) => {
  const action = AUDIT_ACTIONS[i % AUDIT_ACTIONS.length]
  const resourceType = action.split('.')[0]
  const actor = DEMO_USERS[(i * 3) % DEMO_USERS.length]
  const success = i % 9 !== 0
  const octet = (k: number) => Math.floor(rand(i * 17 + k) * 255)
  return {
    id: `al-${String(i + 1).padStart(4, '0')}`,
    userId: actor.id,
    action,
    resourceType,
    resourceId: `${resourceType}-${100 + i}`,
    details: {
      after: {},
      before: {},
      changed_fields: [] as string[],
      method: 'POST',
      path: `/api/${resourceType}`,
      query: {},
      route: `/api/${resourceType}`,
      status_code: success ? 200 : 403,
      success,
    },
    ipAddress: `${1 + octet(1)}.${octet(2)}.${octet(3)}.${octet(4)}`,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126',
    createdAt: daysAgo(i % 12, 8 + (i % 12), (i * 7) % 60),
  }
})

// ---------------------------------------------------------------------------
// Visitor identity (spec §3.6) — pinned at the top of the user table. Set by the
// demo-login route, read by /admin/users. Defaults to "Unknown".
// ---------------------------------------------------------------------------
let visitorIdentity: { name: string; email: string } | null = null

export function setVisitorIdentity(name: string | null | undefined, email: string | null | undefined) {
  const n = (name ?? '').trim()
  const e = (email ?? '').trim()
  visitorIdentity = { name: n || 'Unknown', email: e || 'unknown@demo.grengin.com' }
}

export function getVisitorUser(): DemoUser {
  const name = visitorIdentity?.name ?? 'Unknown'
  const email = visitorIdentity?.email ?? 'unknown@demo.grengin.com'
  const homeDept = DEMO_DEPARTMENTS[0] // Private Wealth (top division)
  return {
    id: 'usr-visitor',
    sub: 'demo|visitor',
    email,
    name,
    picture: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`,
    role: 'admin',
    roles: ['Super Admin'],
    role_id: 'role-super',
    scope_department_id: null,
    status: 'active',
    department_id: homeDept.id,
    department_name: homeDept.name,
    department: homeDept.name,
    is_super_admin: true,
    has_password: false,
    mfa_enabled: false,
    last_login_at: daysAgo(0, 12),
    created_at: daysAgo(0, 12),
    updated_at: daysAgo(0, 12),
  }
}

// NOTE: the visitor-pinned user table (`usersWithVisitor`) and live per-role
// counts (`roleUserCount`) now live in demoState.ts, which owns the MUTABLE users
// list so create/edit/delete are reflected. `getVisitorUser` above stays here as
// it only depends on the pinned identity + the static Private Wealth division.

// ---------------------------------------------------------------------------
// Chat landing (spec §2) — exactly 2 pre-existing conversations: one that used
// web search, one that used image generation. Shapes mirror the mock's own
// stream output so they render on reload (tool_calls/tool_results for web
// search; parts.files for the generated image).
// ---------------------------------------------------------------------------
export const WEB_SEARCH_CONV_ID = 'demo-conv-web-search-0001'
export const IMAGE_GEN_CONV_ID = 'demo-conv-image-gen-0001'
// Conversation that exercises the ENGG-399 UX fixes end-to-end: a descriptive
// title (browser-tab title), an attached file (drag & drop upload), a set model
// (last-used default), and wide code / table / long-URL content (scroll + wrap).
export const ENGG399_CONV_ID = 'demo-conv-engg399-0001'
const DEMO_IMAGE_FILE_ID = 'file-demo-q3-review-cover'
const DEMO_DATASET_FILE_ID = 'file-demo-engg399-dataset'

// Generated-image file, registered so GET /files/:id/download serves a placeholder.
export const DEMO_CHAT_FILES = [
  {
    id: DEMO_IMAGE_FILE_ID,
    name: 'q3-private-client-review-cover.png',
    size: 0,
    type: 'image/png',
    description: 'Elegant cover image for the Q3 private client portfolio review',
    url: `/files/${DEMO_IMAGE_FILE_ID}`,
    download_url: `/files/${DEMO_IMAGE_FILE_ID}/download`,
    created_at: daysAgo(2, 14, 10),
    updated_at: daysAgo(2, 14, 10),
    user_id: 'demo|visitor',
    status: 'uploaded',
  },
  {
    id: DEMO_DATASET_FILE_ID,
    name: 'sales-by-region-2026.csv',
    size: 20480,
    type: 'text/csv',
    description: 'Quarterly sales figures by region, attached for analysis',
    url: `/files/${DEMO_DATASET_FILE_ID}`,
    download_url: `/files/${DEMO_DATASET_FILE_ID}/download`,
    created_at: daysAgo(1, 9, 30),
    updated_at: daysAgo(1, 9, 30),
    user_id: 'demo|visitor',
    status: 'uploaded',
  },
]

export const DEMO_CONVERSATIONS = [
  {
    id: WEB_SEARCH_CONV_ID,
    title: 'Fed rate-cut outlook for H2 2026',
    archived: false,
    archived_at: null,
    created_at: daysAgo(3, 10, 0),
    updated_at: daysAgo(3, 10, 2),
  },
  {
    id: IMAGE_GEN_CONV_ID,
    title: 'Q3 private client review cover',
    archived: false,
    archived_at: null,
    created_at: daysAgo(2, 14, 8),
    updated_at: daysAgo(2, 14, 10),
  },
  {
    id: ENGG399_CONV_ID,
    title: 'Q3 regional sales — wide report & parser refactor',
    archived: false,
    archived_at: null,
    created_at: daysAgo(1, 9, 30),
    updated_at: daysAgo(1, 9, 34),
  },
]

// Message arrays keyed by conversation id. Typed loosely because the generated
// Message schema does not model tool_calls / tool_results (the real API does).
export const DEMO_MESSAGES: Record<string, any[]> = {
  [WEB_SEARCH_CONV_ID]: [
    {
      id: 'demo-ws-msg-1',
      conversation_id: WEB_SEARCH_CONV_ID,
      role: 'user',
      parts: { text: 'What’s the latest consensus on Fed rate cuts for the second half of 2026?' },
      model: null,
      tool_calls: null,
      tool_results: null,
      usage: null,
      created_at: daysAgo(3, 10, 0),
      updated_at: daysAgo(3, 10, 0),
    },
    {
      id: 'demo-ws-msg-2',
      conversation_id: WEB_SEARCH_CONV_ID,
      role: 'assistant',
      model: 'gpt-4o-mini-search-preview',
      parts: {
        text:
          'Here’s the current market consensus on the Fed for H2 2026:\n\n' +
          '1. **Two more cuts priced in** — futures imply roughly 50bps of easing by year-end, taking the target range lower in two 25bps steps.\n' +
          '2. **Data-dependent** — the path hinges on cooling core inflation and a gradually softening labour market.\n' +
          '3. **Portfolio read-through** — supportive for duration and quality fixed income; watch rate-sensitive equity sectors.\n\n' +
          'This is general market commentary, not personalised advice. Sources are listed below.',
      },
      tool_calls: [
        { tool_name: 'web_search', tool_id: 'ws-call-1', kind: 'web_search', input_text: 'Federal Reserve rate cut expectations H2 2026', status: 'completed' },
      ],
      tool_results: [
        {
          tool_name: 'web_search',
          tool_id: 'ws-call-1',
          kind: 'web_search',
          status: 'success',
          web_search: {
            query: 'Federal Reserve rate cut expectations H2 2026',
            queries: ['Federal Reserve rate cut expectations H2 2026', 'FOMC dot plot 2026 projections'],
            results: [
              { title: 'FOMC calendar and statements — Federal Reserve', url: 'https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm' },
              { title: 'CME FedWatch Tool — market-implied rate probabilities', url: 'https://www.cmegroup.com/markets/interest-rates/cme-fedwatch-tool.html' },
              { title: 'Summary of Economic Projections (dot plot) explained', url: 'https://www.federalreserve.gov/monetarypolicy/fomcprojtabl.htm' },
            ],
          },
        },
      ],
      usage: { input_tokens: 62, output_tokens: 210 },
      created_at: daysAgo(3, 10, 2),
      updated_at: daysAgo(3, 10, 2),
    },
  ],
  [IMAGE_GEN_CONV_ID]: [
    {
      id: 'demo-img-msg-1',
      conversation_id: IMAGE_GEN_CONV_ID,
      role: 'user',
      parts: { text: 'Generate a polished, understated cover image for our Q3 private client portfolio review.' },
      model: null,
      tool_calls: null,
      tool_results: null,
      usage: null,
      created_at: daysAgo(2, 14, 8),
      updated_at: daysAgo(2, 14, 8),
    },
    {
      id: 'demo-img-msg-2',
      conversation_id: IMAGE_GEN_CONV_ID,
      role: 'assistant',
      model: 'gemini-3.1-flash-image',
      parts: {
        text: 'Here’s an elegant cover concept for your Q3 private client review:',
        files: [{ id: DEMO_IMAGE_FILE_ID, name: 'q3-private-client-review-cover.png', type: 'image/png', size: 0 }],
      },
      tool_calls: null,
      tool_results: null,
      usage: { input_tokens: 18, output_tokens: 0 },
      created_at: daysAgo(2, 14, 10),
      updated_at: daysAgo(2, 14, 10),
    },
  ],
  // ENGG-399 showcase: this thread deliberately contains a wide code block, a
  // wide table and a long unbroken URL (scroll/wrap fix), an attached file
  // (drag & drop), a descriptive title (browser-tab title) and a set model
  // (last-used default). Opening it demonstrates all four ticket points.
  [ENGG399_CONV_ID]: [
    {
      id: 'demo-engg399-msg-1',
      conversation_id: ENGG399_CONV_ID,
      role: 'user',
      parts: {
        text:
          'I attached our regional sales export. Can you summarise it as a table, ' +
          'and show a small parser snippet for the CSV? Also link the source dashboard.',
        files: [{ id: DEMO_DATASET_FILE_ID, name: 'sales-by-region-2026.csv', type: 'text/csv', size: 20480 }],
      },
      model: null,
      tool_calls: null,
      tool_results: null,
      usage: null,
      created_at: daysAgo(1, 9, 30),
      updated_at: daysAgo(1, 9, 30),
    },
    {
      id: 'demo-engg399-msg-2',
      conversation_id: ENGG399_CONV_ID,
      role: 'assistant',
      model: 'claude-sonnet-4-5',
      parts: {
        text:
          'Here’s the breakdown from **sales-by-region-2026.csv**.\n\n' +
          'The full interactive dashboard lives here: ' +
          'https://analytics.example.com/dashboards/regional-sales/2026/q3?view=by-region&compare=prev-year&currency=USD&breakdown=segment\n\n' +
          'Parsed summary (this table is intentionally wide — it scrolls horizontally within the message):\n\n' +
          '| Region | Q1 Revenue | Q2 Revenue | Q3 Revenue | QoQ Growth | Top Segment | Reps | Notes |\n' +
          '| --- | --- | --- | --- | --- | --- | --- | --- |\n' +
          '| North America | $1,204,500 | $1,318,200 | $1,442,900 | +9.5% | Enterprise | 24 | Strong renewals in Q3 |\n' +
          '| EMEA | $902,300 | $968,750 | $1,051,400 | +8.5% | Mid-Market | 19 | FX headwind on EUR deals |\n' +
          '| APAC | $611,900 | $702,450 | $845,600 | +20.4% | SMB | 15 | Fastest-growing region |\n' +
          '| LATAM | $288,400 | $301,900 | $332,750 | +10.2% | SMB | 8 | New Brazil team ramping |\n\n' +
          'And a minimal parser you can drop into a Node script:\n\n' +
          '```javascript\n' +
          'const parseSalesCsv = (raw) => raw.trim().split("\\n").slice(1).map((line) => { const [region, q1, q2, q3, growth, segment, reps, notes] = line.split(","); return { region, q1: Number(q1), q2: Number(q2), q3: Number(q3), growth, segment, reps: Number(reps), notes }; });\n' +
          '```\n\n' +
          'Want me to chart QoQ growth or export a cleaned CSV?',
      },
      tool_calls: null,
      tool_results: null,
      usage: { input_tokens: 96, output_tokens: 320 },
      created_at: daysAgo(1, 9, 34),
      updated_at: daysAgo(1, 9, 34),
    },
  ],
}
