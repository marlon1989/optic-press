import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DESKTOP_ZIP_CHUNK_MB,
  LOW_MEMORY_ZIP_CHUNK_MB,
  MOBILE_ZIP_CHUNK_MB,
  resolveZipChunkMegabytes,
} from '../src/js/core/zip-limits.js';

test('resolveZipChunkMegabytes caps mobile ZIP chunks aggressively', () => {
  assert.equal(
    resolveZipChunkMegabytes({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' }),
    MOBILE_ZIP_CHUNK_MB,
  );
});

test('resolveZipChunkMegabytes lowers desktop chunks on low-memory devices', () => {
  assert.equal(
    resolveZipChunkMegabytes({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', deviceMemory: 2 }),
    LOW_MEMORY_ZIP_CHUNK_MB,
  );
});

test('resolveZipChunkMegabytes uses larger chunks on standard desktop devices', () => {
  assert.equal(
    resolveZipChunkMegabytes({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', deviceMemory: 8 }),
    DESKTOP_ZIP_CHUNK_MB,
  );
  assert.equal(DESKTOP_ZIP_CHUNK_MB, 500);
});
