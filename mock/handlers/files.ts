import { http, HttpResponse } from 'msw'
import { faker } from '@faker-js/faker'
import type { components } from '../types/api.js'
import { API_BASE, requireAuth } from '../lib/index.js'

type UserFile = components['schemas']['UserFile']
type PaginatedFiles = components['schemas']['PaginatedFiles']

// In-memory file store
const files = new Map<string, UserFile>()

// Seed with initial data
const seedFiles = () => {
  const file1Id = faker.string.uuid()
  const file2Id = faker.string.uuid()

  files.set(file1Id, {
    id: file1Id,
    name: 'business-plan.pdf',
    size: 524288,
    type: 'application/pdf',
    description: 'Q1 2024 Business Plan',
    url: `/files/${file1Id}`,
    download_url: `/files/${file1Id}/download`,
    created_at: '2024-01-15T10:30:00Z',
    updated_at: '2024-01-15T10:30:00Z',
    user_id: '550e8400-e29b-41d4-a716-446655440001', // Mock user ID
    status: 'uploaded',
    metadata: {
      checksum: faker.string.alphanumeric(64),
      virus_scan_status: 'clean',
      processing_status: 'completed',
    },
  })

  files.set(file2Id, {
    id: file2Id,
    name: 'logo.png',
    size: 102400,
    type: 'image/png',
    description: null,
    url: `/files/${file2Id}`,
    download_url: `/files/${file2Id}/download`,
    created_at: '2024-01-14T15:20:00Z',
    updated_at: '2024-01-14T15:20:00Z',
    user_id: '550e8400-e29b-41d4-a716-446655440001', // Mock user ID
    status: 'uploaded',
    metadata: {
      checksum: faker.string.alphanumeric(64),
      virus_scan_status: 'clean',
      processing_status: 'completed',
    },
  })
}

seedFiles()

export const fileHandlers = [
  // Upload file
  http.post(`${API_BASE}/files`, async ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const formData = await request.formData()
    const file = formData.get('file') as File
    const description = formData.get('description') as string | null

    if (!file) {
      return HttpResponse.json(
        { detail: 'File is required' },
        { status: 400 }
      )
    }

    const fileId = faker.string.uuid()
    const newFile = {
      id: fileId,
      name: file.name,
      size: file.size,
      type: file.type,
      description: description || null,
      url: `/files/${fileId}`,
      download_url: `/files/${fileId}/download`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      user_id: '550e8400-e29b-41d4-a716-446655440001', // Mock user ID
      status: 'uploaded' as const,
      metadata: {
        checksum: faker.string.alphanumeric(64),
        virus_scan_status: 'pending' as const,
        processing_status: 'completed',
      },
    }

    files.set(fileId, newFile)

    return HttpResponse.json(newFile)
  }),

  // List files
  http.get(`${API_BASE}/files`, ({ request }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const url = new URL(request.url)
    const limit = parseInt(url.searchParams.get('limit') || '20')
    const offset = parseInt(url.searchParams.get('offset') || '0')
    const sort = url.searchParams.get('sort') || 'created_at'
    const order = url.searchParams.get('order') || 'desc'

    const allFiles = Array.from(files.values())
    const sortKey = sort as keyof UserFile
    const sortedFiles = allFiles.sort((a, b) => {
      const aVal = a[sortKey]
      const bVal = b[sortKey]
      if (aVal == null || bVal == null) return 0
      if (order === 'asc') {
        return aVal > bVal ? 1 : -1
      }
      return aVal < bVal ? 1 : -1
    })

    const paginatedFiles = sortedFiles.slice(offset, offset + limit)

    const response: PaginatedFiles = {
      files: paginatedFiles,
      total: allFiles.length,
      limit,
      offset,
      sort,
      order: order as 'asc' | 'desc',
    }

    return HttpResponse.json(response)
  }),

  // Get file
  http.get(`${API_BASE}/files/:fileId`, ({ request, params }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const { fileId } = params
    const file = files.get(fileId as string)

    if (!file) {
      return HttpResponse.json(
        { detail: 'File not found' },
        { status: 404 }
      )
    }

    return HttpResponse.json(file)
  }),

  // Download file
  http.get(`${API_BASE}/files/:fileId/download`, ({ request, params }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const { fileId } = params
    const file = files.get(fileId as string)

    if (!file) {
      return HttpResponse.json(
        { detail: 'File not found' },
        { status: 404 }
      )
    }

    // Return mock binary data
    return new HttpResponse('Mock file content', {
      headers: {
        'Content-Type': file.type,
        'Content-Disposition': `attachment; filename="${file.name}"`,
      },
    })
  }),

  // Delete file
  http.delete(`${API_BASE}/files/:fileId`, ({ request, params }) => {
    const authError = requireAuth(request)
    if (authError) return authError

    const { fileId } = params

    if (!files.has(fileId as string)) {
      return HttpResponse.json(
        { detail: 'File not found' },
        { status: 404 }
      )
    }

    files.delete(fileId as string)

    return new HttpResponse(null, { status: 204 })
  }),
]
