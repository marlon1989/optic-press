import assert from 'node:assert/strict';
import test from 'node:test';

import {
  BATCH_FILE_LIMIT,
  FILE_SIZE_LIMIT_BYTES,
  collectAcceptedImageFiles,
  getFolderNameFromRelativePath,
  isSupportedImageFile,
} from '../src/js/core/file-rules.js';

function makeImageFile(name, type, size = 128) {
  return new File([new Uint8Array(size)], name, { type });
}

test('isSupportedImageFile accepts configured image MIME types and NEF extension', () => {
  assert.equal(isSupportedImageFile(makeImageFile('photo.jpg', 'image/jpeg')), true);
  assert.equal(isSupportedImageFile(makeImageFile('raw.NEF', '')), true);
  assert.equal(isSupportedImageFile(makeImageFile('notes.txt', 'text/plain')), false);
});

test('collectAcceptedImageFiles rejects unsupported and oversized files with rich messages', () => {
  const messages = [];
  const accepted = collectAcceptedImageFiles(
    [
      makeImageFile('good.png', 'image/png'),
      makeImageFile('bad.txt', 'text/plain'),
      makeImageFile('huge.jpg', 'image/jpeg', FILE_SIZE_LIMIT_BYTES + 1),
    ],
    {
      existingQueueCount: 0,
      showToast: (message, type) => messages.push({ message, type }),
    },
  );

  assert.deepEqual(accepted.map((file) => file.name), ['good.png']);
  assert.equal(messages.length, 2);
  assert.match(messages[0].message, /bad\.txt/);
  assert.match(messages[0].message, /WEBP, PNG, JPEG, AVIF and NEF/);
  assert.equal(messages[0].type, 'error');
  assert.match(messages[1].message, /huge\.jpg/);
  assert.match(messages[1].message, /50 MB/);
});

test('collectAcceptedImageFiles clamps batch size to safety limit', () => {
  const messages = [];
  const accepted = collectAcceptedImageFiles(
    [
      makeImageFile('first.webp', 'image/webp'),
      makeImageFile('second.webp', 'image/webp'),
    ],
    {
      existingQueueCount: BATCH_FILE_LIMIT - 1,
      showToast: (message, type) => messages.push({ message, type }),
    },
  );

  assert.deepEqual(accepted.map((file) => file.name), ['first.webp']);
  assert.equal(messages.length, 1);
  assert.match(messages[0].message, new RegExp(String(BATCH_FILE_LIMIT)));
  assert.equal(messages[0].type, 'warning');
});

test('getFolderNameFromRelativePath returns top folder only', () => {
  assert.equal(getFolderNameFromRelativePath('wedding/raw/photo.nef'), 'wedding');
  assert.equal(getFolderNameFromRelativePath('photo.nef'), null);
  assert.equal(getFolderNameFromRelativePath(''), null);
});
