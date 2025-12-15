import { Router } from 'express'
import { faker } from '@faker-js/faker'
import { requireAuth } from '../lib/middleware.js'
import { files, type UserFile, type PaginatedFiles } from '../lib/store.js'

const router = Router()

router.get('/files', requireAuth, (req, res) => {
  const limit = parseInt(req.query.limit as string || '20')
  const offset = parseInt(req.query.offset as string || '0')
  const sort = req.query.sort as string || 'created_at'
  const order = req.query.order as string || 'desc'

  const allFiles = Array.from(files.values())
  const sortedFiles = allFiles.sort((a: any, b: any) => {
    const aVal = a[sort]
    const bVal = b[sort]
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
  res.json(response)
})

router.post('/files', requireAuth, (req, res) => {
  const fileId = faker.string.uuid()
  const newFile: UserFile = {
    id: fileId,
    name: req.body.name || 'untitled.txt',
    size: req.body.size || 0,
    type: req.body.type || 'text/plain',
    description: req.body.description || null,
    url: `/files/${fileId}`,
    download_url: `/files/${fileId}/download`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    user_id: 'auth0|507f1f77bcf86cd799439011',
    status: 'uploaded',
  }
  files.set(fileId, newFile)
  res.json(newFile)
})

router.get('/files/:fileId', requireAuth, (req, res) => {
  const file = files.get(req.params.fileId)
  if (!file) {
    return res.status(404).json({ detail: 'File not found' })
  }
  res.json(file)
})

router.delete('/files/:fileId', requireAuth, (req, res) => {
  if (!files.has(req.params.fileId)) {
    return res.status(404).json({ detail: 'File not found' })
  }
  files.delete(req.params.fileId)
  res.status(204).send()
})

export default router
