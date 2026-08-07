// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0

import { Router } from 'express'
import zlib from 'node:zlib'
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

// Deterministic placeholder colour from an id so each generated image looks distinct.
function hueFromId(id: string): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360
  return h
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  let r = 0, g = 0, b = 0
  if (h < 60) [r, g, b] = [c, x, 0]
  else if (h < 120) [r, g, b] = [x, c, 0]
  else if (h < 180) [r, g, b] = [0, c, x]
  else if (h < 240) [r, g, b] = [0, x, c]
  else if (h < 300) [r, g, b] = [x, 0, c]
  else [r, g, b] = [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

// CRC32 for PNG chunks.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

function crc32(buf: Buffer): number {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}

// Synthesise a real diagonal-gradient PNG so inline rendering, the preview modal
// and download all behave exactly as they will with backend-produced PNGs.
function makeGradientPng(hue: number, size = 512): Buffer {
  const [r1, g1, b1] = hslToRgb(hue, 0.72, 0.6)
  const [r2, g2, b2] = hslToRgb((hue + 60) % 360, 0.7, 0.45)
  const rowLen = size * 3 + 1
  const raw = Buffer.alloc(rowLen * size)
  for (let y = 0; y < size; y++) {
    const rowOff = y * rowLen
    raw[rowOff] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const t = (x + y) / (2 * (size - 1)) // diagonal 0..1
      const off = rowOff + 1 + x * 3
      raw[off] = Math.round(r1 + (r2 - r1) * t)
      raw[off + 1] = Math.round(g1 + (g2 - g1) * t)
      raw[off + 2] = Math.round(b1 + (b2 - b1) * t)
    }
  }
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 2 // colour type: truecolour RGB
  const idat = zlib.deflateSync(raw)
  return Buffer.concat([
    sig,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

// Download file binary. For image files we synthesise a real gradient PNG so the
// inline image rendering, preview modal, and generated-image download can all be
// exercised locally exactly as they behave with backend-produced images.
router.get('/files/:fileId/download', requireAuth, (req, res) => {
  const file = files.get(req.params.fileId)
  if (!file) {
    return res.status(404).json({ detail: 'File not found' })
  }

  if ((file.type || '').startsWith('image/')) {
    const png = makeGradientPng(hueFromId(file.id))
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'no-store')
    return res.send(png)
  }

  res.setHeader('Content-Type', 'text/plain')
  res.send(`Mock file content for ${file.name}`)
})

router.delete('/files/:fileId', requireAuth, (req, res) => {
  if (!files.has(req.params.fileId)) {
    return res.status(404).json({ detail: 'File not found' })
  }
  files.delete(req.params.fileId)
  res.status(204).send()
})

export default router
