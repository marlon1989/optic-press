import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('compression worker does not re-decode files during PNG to WebP upgrade', async () => {
  const workerSource = await readFile(new URL('../src/js/workers/worker.js', import.meta.url), 'utf8');
  const fileDecodeCalls = workerSource.match(/createImageBitmap\(file\)/g) || [];

  assert.equal(fileDecodeCalls.length, 1, 'Expected one source-file decode before canvas processing starts');
  assert.doesNotMatch(workerSource, /bitmapRetry/, 'Expected WebP upgrade to reuse the existing ImageBitmap');
});
