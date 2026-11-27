// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0
//
// ENGG-534: the chat composer limits web search and attachments to what the
// selected model supports. These cover the pure capability helpers the composer
// and Chat view build on; only an explicit `false` on a model blocks anything,
// so models that don't send the fields keep today's behaviour.
import assert from 'node:assert/strict';
import {
  isImageAttachment,
  isPdfAttachment,
  modelAttachmentBlock,
  modelAllowsMultipleImages,
  modelMissesEarlierFiles,
  type ModelInfo,
} from '../src/lib/api/models.js';

const png = { name: 'shot.png', type: 'image/png' };
const heic = { name: 'IMG_1.HEIC', type: '' }; // extension-only, upper-case
const pdf = { name: 'report.pdf', type: 'application/pdf' };
const pdfByExt = { name: 'report.PDF', type: '' };
const csv = { name: 'data.csv', type: 'text/csv' };

// ── File-kind detection ──────────────────────────────────────────────────────
assert.equal(isImageAttachment(png), true);
assert.equal(isImageAttachment(heic), true);
assert.equal(isImageAttachment(pdf), false);
assert.equal(isImageAttachment(csv), false);
assert.equal(isPdfAttachment(pdf), true);
assert.equal(isPdfAttachment(pdfByExt), true);
assert.equal(isPdfAttachment(png), false);

// ── modelAttachmentBlock: only an explicit `false` blocks ────────────────────
const noVision: ModelInfo = { key: 'm', name: 'M', supports_vision: false };
const noPdf: ModelInfo = { key: 'm', name: 'M', supports_pdf_native: false };
const full: ModelInfo = {
  key: 'm',
  name: 'M',
  supports_vision: true,
  supports_pdf_native: true,
  supports_multiple_images: true,
};
const silent: ModelInfo = { key: 'm', name: 'M' }; // sends none of the fields

// No vision → images blocked, but other files (incl. PDFs) are not.
assert.equal(modelAttachmentBlock(noVision, png), 'no_images');
assert.equal(modelAttachmentBlock(noVision, heic), 'no_images');
assert.equal(modelAttachmentBlock(noVision, pdf), null);
assert.equal(modelAttachmentBlock(noVision, csv), null);

// No PDF → PDFs blocked, images fine.
assert.equal(modelAttachmentBlock(noPdf, pdf), 'no_pdf');
assert.equal(modelAttachmentBlock(noPdf, pdfByExt), 'no_pdf');
assert.equal(modelAttachmentBlock(noPdf, png), null);

// A fully-capable model and a model that sends no capability fields both allow
// everything (today's behaviour is preserved for silent models).
for (const file of [png, heic, pdf, csv]) {
  assert.equal(modelAttachmentBlock(full, file), null);
  assert.equal(modelAttachmentBlock(silent, file), null);
}
// A null/undefined model never blocks.
assert.equal(modelAttachmentBlock(undefined, png), null);
assert.equal(modelAttachmentBlock(null, pdf), null);

// ── modelAllowsMultipleImages: false only when explicitly capped ─────────────
const oneImage: ModelInfo = { key: 'm', name: 'M', supports_multiple_images: false };
assert.equal(modelAllowsMultipleImages(oneImage), false);
assert.equal(modelAllowsMultipleImages(full), true);
assert.equal(modelAllowsMultipleImages(silent), true); // field absent → allowed
assert.equal(modelAllowsMultipleImages(undefined), true);

// ── modelMissesEarlierFiles: drives the conversation switch toast ────────────
assert.equal(modelMissesEarlierFiles(noVision, [pdf, csv]), false);
assert.equal(modelMissesEarlierFiles(noVision, [pdf, png]), true);
assert.equal(modelMissesEarlierFiles(noPdf, [png, pdf]), true);
assert.equal(modelMissesEarlierFiles(full, [png, pdf, csv]), false);
assert.equal(modelMissesEarlierFiles(silent, [png, pdf]), false);
assert.equal(modelMissesEarlierFiles(noVision, []), false);
assert.equal(modelMissesEarlierFiles(undefined, [png, pdf]), false);

console.log('engg-534.test.ts: all assertions passed');
