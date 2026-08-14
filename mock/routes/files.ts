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

// The seeded Q3 private-client review cover (see demoSeed.ts). This one file gets
// a bespoke, on-topic cover instead of the generic gradient so the image-generation
// demo shows a response that actually matches the prompt.
const DEMO_Q3_COVER_FILE_ID = 'file-demo-q3-review-cover'

// A polished, understated square cover for the "Q3 private client portfolio review".
// Square (640×640) because generated images render with object-fit: cover in a square
// box — landscape art would be cropped. Self-contained SVG (system fonts only), so it
// renders identically inline, in the preview modal, and on download.
function makeQ3CoverSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="640" viewBox="0 0 640 640" role="img" aria-label="Q3 Private Client Portfolio Review cover">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0" stop-color="#0B1826"/>
      <stop offset="1" stop-color="#14293D"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.82" cy="0.12" r="0.9">
      <stop offset="0" stop-color="#25415C" stop-opacity="0.55"/>
      <stop offset="1" stop-color="#25415C" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="vignette" cx="0.5" cy="0.46" r="0.75">
      <stop offset="0.55" stop-color="#000000" stop-opacity="0"/>
      <stop offset="1" stop-color="#000000" stop-opacity="0.35"/>
    </radialGradient>
    <linearGradient id="area" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#C9A96A" stop-opacity="0.30"/>
      <stop offset="1" stop-color="#C9A96A" stop-opacity="0"/>
    </linearGradient>
  </defs>

  <rect width="640" height="640" fill="url(#bg)"/>
  <rect width="640" height="640" fill="url(#glow)"/>

  <!-- faint baseline grid -->
  <g stroke="#FFFFFF" stroke-opacity="0.045" stroke-width="1">
    <line x1="64" y1="240" x2="576" y2="240"/>
    <line x1="64" y1="320" x2="576" y2="320"/>
    <line x1="64" y1="400" x2="576" y2="400"/>
    <line x1="64" y1="480" x2="576" y2="480"/>
    <line x1="64" y1="560" x2="576" y2="560"/>
  </g>

  <!-- understated upward performance curve -->
  <path d="M64 508 C 150 494 210 480 290 462 S 430 416 500 396 S 560 382 576 376 L 576 560 L 64 560 Z" fill="url(#area)"/>
  <path d="M64 508 C 150 494 210 480 290 462 S 430 416 500 396 S 560 382 576 376" fill="none" stroke="#C9A96A" stroke-opacity="0.85" stroke-width="2.25" stroke-linecap="round"/>
  <circle cx="576" cy="376" r="9" fill="#C9A96A" fill-opacity="0.16"/>
  <circle cx="576" cy="376" r="3.5" fill="#D8BE86"/>

  <!-- eyebrow -->
  <text x="64" y="132" fill="#C9A96A" fill-opacity="0.92" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="14" font-weight="600" letter-spacing="4.5">PRIVATE CLIENT &#183; CONFIDENTIAL</text>

  <!-- title -->
  <text x="62" y="212" fill="#EDF2F7" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="500" letter-spacing="0.5">Q3 Portfolio</text>
  <text x="62" y="280" fill="#EDF2F7" font-family="Georgia, 'Times New Roman', serif" font-size="62" font-weight="500" letter-spacing="0.5">Review</text>

  <!-- gold hairline rule -->
  <line x1="64" y1="316" x2="196" y2="316" stroke="#C9A96A" stroke-width="2"/>

  <!-- subtitle -->
  <text x="64" y="352" fill="#93A4B5" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="18" letter-spacing="0.3">Quarterly performance &amp; positioning</text>

  <!-- footer wordmark -->
  <text x="64" y="596" fill="#6E8299" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="13" font-weight="600" letter-spacing="3">GRENGIN</text>
  <text x="576" y="596" text-anchor="end" fill="#6E8299" font-family="'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="13" letter-spacing="2">FY2026</text>

  <rect width="640" height="640" fill="url(#vignette)"/>
</svg>`
}

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

  if (file.id === DEMO_Q3_COVER_FILE_ID) {
    res.setHeader('Content-Type', 'image/svg+xml')
    res.setHeader('Cache-Control', 'no-store')
    return res.send(makeQ3CoverSvg())
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
