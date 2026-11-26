// SPDX-FileCopyrightText: 2026 Perter Technology Solutions Private Limited
// SPDX-License-Identifier: Apache-2.0
//
// grengin-api 0.9.14 frontend integration (ENGG-544): attachment limits, model
// catalog metadata, default-model resolution, label translation and the
// GET /models locale parameter.
import assert from 'node:assert/strict';
import {
  validateAttachment,
  isAcceptedFileType,
  attachmentAcceptAttribute,
  resolveGlobalAttachments,
  defaultModelForProvider,
  getModels,
  DEFAULT_GLOBAL_ATTACHMENTS,
  type GlobalAttachments,
  type ProviderInfo,
} from '../src/lib/api/models.js';
import { resolveDefaultModel } from '../src/lib/features/chat/modelPreferences.js';
import { specialtyLabel, priceTierLabel } from '../src/lib/features/chat/modelCatalog.js';

// ── Attachment limits (section 3) ────────────────────────────────────────────
const limits: GlobalAttachments = {
  accepted_types: ['image/*', 'application/pdf', '.csv'],
  max_file_size_bytes: 1000,
  max_files_per_message: 3,
};

// Type matching: MIME, subtype wildcard, extension — and the match-anything token.
assert.equal(isAcceptedFileType({ name: 'a.png', type: 'image/png' }, limits.accepted_types), true);
assert.equal(isAcceptedFileType({ name: 'a.pdf', type: 'application/pdf' }, limits.accepted_types), true);
assert.equal(isAcceptedFileType({ name: 'data.csv', type: '' }, limits.accepted_types), true);
assert.equal(isAcceptedFileType({ name: 'a.exe', type: 'application/x-msdownload' }, limits.accepted_types), false);
assert.equal(isAcceptedFileType({ name: 'a.exe', type: 'application/x-msdownload' }, ['*/*']), true);

// validateAttachment: size wins, then type.
assert.equal(validateAttachment({ name: 'a.png', type: 'image/png', size: 2000 }, limits), 'too_big');
assert.equal(validateAttachment({ name: 'a.exe', type: 'application/x-msdownload', size: 10 }, limits), 'unsupported_type');
assert.equal(validateAttachment({ name: 'a.png', type: 'image/png', size: 10 }, limits), null);

// accept attribute: a list joins; match-anything (or empty) stays unset.
assert.equal(attachmentAcceptAttribute(limits), 'image/*,application/pdf,.csv');
assert.equal(attachmentAcceptAttribute({ ...limits, accepted_types: ['*/*'] }), undefined);
assert.equal(attachmentAcceptAttribute({ ...limits, accepted_types: [] }), undefined);

// resolveGlobalAttachments: defaults fill in when the server omits the block.
assert.deepEqual(resolveGlobalAttachments(undefined), DEFAULT_GLOBAL_ATTACHMENTS);
assert.deepEqual(resolveGlobalAttachments({}), DEFAULT_GLOBAL_ATTACHMENTS);
assert.equal(resolveGlobalAttachments({ global_attachments: limits }).max_files_per_message, 3);

// ── Model catalog default (section 2) ────────────────────────────────────────
const providers: ProviderInfo[] = [
  {
    key: 'openai',
    name: 'OpenAI',
    icon: '',
    models: [
      { key: 'gpt-mini', name: 'GPT mini', specialty: 'fast-cheap' },
      { key: 'gpt-5', name: 'GPT 5', specialty: 'frontier', default: true, recommended: true },
    ],
  },
];
assert.equal(defaultModelForProvider(providers[0])?.key, 'gpt-5');
// With no saved choice, resolveDefaultModel prefers the catalog default over
// registry order (which would otherwise pick the first model, gpt-mini).
assert.equal(resolveDefaultModel(providers)?.model.key, 'gpt-5');
// No default flag anywhere → first selectable model in registry order.
const noDefault: ProviderInfo[] = [
  { key: 'x', name: 'X', icon: '', models: [{ key: 'a', name: 'A' }, { key: 'b', name: 'B' }] },
];
assert.equal(resolveDefaultModel(noDefault)?.model.key, 'a');

// ── Label translation (section 2) ────────────────────────────────────────────
// A translator that resolves only "coding"; everything else returns the key
// (svelte-i18n's missing-message behaviour).
const translate = (key: string) =>
  key === 'chat.modelSpecialty.coding' ? 'Programmazione' : key;
const specialtyCatalog = [{ id: 'coding', label: 'Coding' }, { id: 'weird-new', label: 'Brand New' }];
// Known + translated code → the translation.
assert.equal(specialtyLabel('coding', specialtyCatalog, translate), 'Programmazione');
// Unknown code the webapp can't translate → the API's English label.
assert.equal(specialtyLabel('weird-new', specialtyCatalog, translate), 'Brand New');
// Unknown code with no catalog entry → the raw code (never a bare i18n key).
assert.equal(specialtyLabel('mystery', specialtyCatalog, translate), 'mystery');
// Price tiers follow the same rule.
const tierTranslate = (key: string) => (key === 'chat.priceTier.free' ? 'Gratis' : key);
assert.equal(priceTierLabel('free', [{ id: 'free', label: 'Free' }], tierTranslate), 'Gratis');
assert.equal(priceTierLabel('surge', [{ id: 'surge', label: 'Surge' }], tierTranslate), 'Surge');

// ── GET /models?locale= (section 2) ──────────────────────────────────────────
const originalFetch = globalThis.fetch;
const urls: string[] = [];
try {
  globalThis.fetch = async (url: any) => {
    urls.push(String(url));
    return Response.json({ providers: [], specialties: [], price_tiers: [] });
  };
  await getModels('ja');
  await getModels('fr-CA');
  await getModels();
  assert.ok(urls[0].endsWith('/models?locale=ja'), `locale appended: ${urls[0]}`);
  assert.ok(urls[1].includes('locale=fr-CA'), `locale preserved: ${urls[1]}`);
  assert.ok(urls[2].endsWith('/models'), `no locale → bare URL: ${urls[2]}`);
} finally {
  globalThis.fetch = originalFetch;
}

console.log('Release 0.9.14: attachment limits, catalog default, label fallback, locale param passed');
