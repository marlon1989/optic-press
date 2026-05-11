import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isNefFile,
  resolveEffectiveMime,
} from '../src/js/workers/mime.js';

test('isNefFile detects Nikon RAW files case-insensitively', () => {
  assert.equal(isNefFile('camera.NEF'), true);
  assert.equal(isNefFile('camera.png'), false);
});

test('resolveEffectiveMime converts NEF browser MIME to JPEG', () => {
  assert.equal(resolveEffectiveMime('camera.nef', 'image/x-nikon-nef'), 'image/jpeg');
  assert.equal(resolveEffectiveMime('camera.nef', ''), 'image/jpeg');
});

test('resolveEffectiveMime preserves normal image targets', () => {
  assert.equal(resolveEffectiveMime('photo.png', 'image/png'), 'image/png');
  assert.equal(resolveEffectiveMime('photo.webp', 'image/webp'), 'image/webp');
});
