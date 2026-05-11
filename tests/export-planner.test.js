import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createZipChunks,
  formatZipFilename,
  normalizeZipFolderName,
  resolveImageExtension,
  sanitizeArchiveEntryBaseName,
} from '../src/js/core/export-planner.js';

test('createZipChunks keeps cumulative chunk size below limit when possible', () => {
  const chunks = createZipChunks(
    [
      { id: '1', filename: 'a.jpg', size: 60, mime: 'image/jpeg' },
      { id: '2', filename: 'b.jpg', size: 50, mime: 'image/jpeg' },
      { id: '3', filename: 'c.jpg', size: 10, mime: 'image/jpeg' },
    ],
    100,
  );

  assert.deepEqual(
    chunks.map((chunk) => chunk.map((file) => file.id)),
    [['1'], ['2', '3']],
  );
});

test('createZipChunks keeps one oversize file instead of dropping it', () => {
  const chunks = createZipChunks(
    [{ id: 'large', filename: 'large.webp', size: 120, mime: 'image/webp' }],
    100,
  );

  assert.deepEqual(chunks.map((chunk) => chunk.map((file) => file.id)), [['large']]);
});

test('formatZipFilename adds part suffix only for multi-part archives', () => {
  assert.equal(formatZipFilename('photos', 0, 1), 'photos.zip');
  assert.equal(formatZipFilename('photos', 1, 3), 'photos_parte2de3.zip');
});

test('normalizeZipFolderName rejects empty or unsafe folder names', () => {
  assert.equal(normalizeZipFolderName('wedding'), 'wedding');
  assert.equal(normalizeZipFolderName('../secret'), 'photos');
  assert.equal(normalizeZipFolderName(''), 'photos');
});

test('resolveImageExtension prefers stat MIME, then blob MIME, then jpeg fallback', () => {
  assert.equal(resolveImageExtension('image/webp', 'image/jpeg'), 'webp');
  assert.equal(resolveImageExtension('', 'image/png'), 'png');
  assert.equal(resolveImageExtension('', ''), 'jpeg');
});

test('sanitizeArchiveEntryBaseName strips paths and extensions', () => {
  assert.equal(sanitizeArchiveEntryBaseName('../secret/raw.nef'), 'raw');
  assert.equal(sanitizeArchiveEntryBaseName('C:\\temp\\photo.jpg'), 'photo');
  assert.equal(sanitizeArchiveEntryBaseName(''), 'image');
});
